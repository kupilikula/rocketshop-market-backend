'use strict';

const knex = require('@database/knexInstance');
const { v4: uuidv4 } = require('uuid');
const { calculateBilling } = require('../../utils/calculateBilling');
const {checkPreferencesAndSendNotificationToStoreMerchants, MerchantNotificationTypes} = require("../../services/PushNotificationsToMerchantsService");
const {computeCartSummaryHash} = require("../../utils/cartSummaryHash");
const Razorpay = require('razorpay'); // Import Razorpay SDK

// Initialize Razorpay SDK (Ideally once when your server starts, not per request)
// Ensure you use the correct keys (Test for testing, Live for production)
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { cartSummary, customerId, recipient, deliveryAddress, cartSummaryHash } = request.body;

        if (customerId!== request.user.customerId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        try {
            // Validate request data
            if (!cartSummary || cartSummary.length === 0) {
                return reply.status(400).send({ error: 'Cart summary is missing or empty.' });
            }
            if (!customerId || !recipient) {
                return reply.status(400).send({ error: 'Customer ID or delivery address is missing.' });
            }

            const backendCartSummaryHash = computeCartSummaryHash(cartSummary);
            if (cartSummaryHash !== backendCartSummaryHash) {
                return reply.status(400).send({ error: 'Cart summary hash mismatch.' });
            }

            const alreadyCheckedOut = await knex('customer_cart_checkouts')
                .where({ customerId, cartSummaryHash })
                .andWhere('created_at', '>', knex.raw(`now() - interval '30 minutes'`))
                .first();

            if (alreadyCheckedOut) {
                return reply.status(409).send({ error: 'Duplicate checkout detected for this cart (within 30 minutes).' });
            }

            // Wrap the entire checkout process in a transaction for atomicity
            const createdOrders = await knex.transaction(async (trx) => {
                return await Promise.all(
                    cartSummary.map(async (storeGroup) => {
                        const { storeId, storeName, storeLogoImage, billing, items } = storeGroup;

                        // Revalidate billing details
                        const recomputedBilling = await calculateBilling(storeId, items, null, deliveryAddress);
                        // if (
                        //     billing.subtotal !== recomputedBilling.subtotal ||
                        //     billing.shipping !== recomputedBilling.shipping ||
                        //     billing.discount !== recomputedBilling.discount ||
                        //     billing.gst !== recomputedBilling.gst ||
                        //     billing.total !== recomputedBilling.total
                        // ) {
                        //     throw new Error(
                        //         `Billing mismatch for store ${storeId}. Expected: ${JSON.stringify(
                        //             recomputedBilling
                        //         )}, Received: ${JSON.stringify(billing)}`
                        //     );
                        // }

                        // Validate and reserve stock for each product
                        for (const item of items) {
                            const product = await trx('products')
                                .where('productId', item.product.productId)
                                .forUpdate() // Pessimistic lock to prevent race conditions
                                .first();

                            if (!product) {
                                throw new Error(`Product not found: ${item.product.productId}`);
                            }

                            const availableStock = product.stock - product.reservedStock;

                            if (item.quantity > availableStock) {
                                throw new Error(
                                    `Insufficient stock for product: ${item.product.productName}. Only ${availableStock} units available.`
                                );
                            }

                            // Reserve stock
                            await trx('products')
                                .where('productId', item.product.productId)
                                .update({
                                    reservedStock: product.reservedStock + item.quantity,
                                });
                        }

                        // Create a new order
                        const orderId = uuidv4();
                        const orderData = {
                            orderId,
                            storeId,
                            customerId,
                            orderStatus: 'Order Created',
                            orderStatusUpdateTime: new Date(),
                            orderTotal: recomputedBilling.total,
                            orderDate: new Date(),
                            recipient: JSON.stringify(recipient), // Save delivery address as JSON
                            deliveryAddress: JSON.stringify(deliveryAddress), // Save delivery address as JSON
                            created_at: new Date(),
                            updated_at: new Date(),
                        };

                        await trx('orders').insert(orderData);

                        // Insert the initial status history record
                        await trx('order_status_history').insert({
                            orderStatusId: uuidv4(),
                            orderId: orderId,
                            orderStatus: 'Order Created'
                        });


                        // Insert order items
                        const orderItems = items.map((item) => ({
                            orderId,
                            productId: item.product.productId,
                            price: item.product.price,
                            quantity: item.quantity,
                            created_at: new Date(),
                            updated_at: new Date(),
                        }));

                        await trx('order_items').insert(orderItems);

                        const customer = await trx('customers').where('customerId', customerId).first();

                        await checkPreferencesAndSendNotificationToStoreMerchants(storeId, MerchantNotificationTypes.NEW_ORDER, {orderId, orderTotal: recomputedBilling.total, customerName: customer.fullName})

                        return {
                            orderId,
                            storeId,
                            storeName,
                            storeLogoImage,
                            billing: recomputedBilling,
                            items,
                        };
                    })
                );
            });

            await knex('customer_cart_checkouts').insert({
                customerId,
                cartSummaryHash,
            });

            // --- START: Razorpay Order Creation with Transfers ---

            let totalAmountInPaise = 0;
            const transferData = [];
            const platformOrderIds = [];

            for (const order of createdOrders) {
                const storeId = order.storeId;
                // Ensure total is a number and convert to paise safely
                const orderTotal = parseFloat(order.billing.total);
                if (isNaN(orderTotal)) {
                    throw new Error(`Invalid billing total for order ${order.orderId}`);
                }
                const orderTotalInPaise = Math.round(orderTotal * 100);
                totalAmountInPaise += orderTotalInPaise;
                platformOrderIds.push(order.orderId);

                // Fetch the Razorpay Account ID for this storeId from your database
                // *** This requires your razorpay_accounts table populated from OAuth ***
                const razorpayAccount = await knex('razorpay_accounts') // Use your actual table name
                    .where('storeId', storeId)
                    .whereNotNull('razorpay_account_id') // Ensure account ID exists
                    .first();

                if (!razorpayAccount || !razorpayAccount.razorpay_account_id) {
                    // Critical Error: This store isn't properly linked for payments.
                    // You might want to rollback the transaction above or handle this differently.
                    // For now, we throw an error stopping the process.
                    fastify.log.error(`Razorpay account ID not found or invalid for storeId: ${storeId}`);
                    throw new Error(`Store ${order.storeName || storeId} is not configured for payments.`);
                }

                transferData.push({
                    account: razorpayAccount.razorpay_account_id, // Linked sub-merchant Account ID
                    amount: orderTotalInPaise,                    // Amount in paise for this store
                    currency: 'INR',
                    // Optional: Add notes or on_hold settings if needed
                    // on_hold: 0,
                    // notes: { platform_order_id: order.orderId }
                });
            }

            // Optional Sanity Check: Ensure total transfer amount equals calculated total
            const totalTransferAmount = transferData.reduce((sum, t) => sum + t.amount, 0);
            if (totalTransferAmount !== totalAmountInPaise) {
                fastify.log.error(
                    { totalAmountInPaise, totalTransferAmount, transferData },
                    "Mismatch between calculated total and transfer total!"
                );
                throw new Error(`Internal calculation error: Payment amount mismatch.`);
            }
            if (totalAmountInPaise <= 0) {
                throw new Error("Calculated total payment amount must be positive.");
            }

            // Prepare options for Razorpay Order API
            const razorpayOrderOptions = {
                amount: totalAmountInPaise,
                currency: 'INR',
                receipt: `rcpt_${uuidv4()}`, // Unique receipt ID for this payment attempt
                transfers: transferData,
                notes: { // Add references to your internal orders/customer
                    platform_order_ids: JSON.stringify(platformOrderIds),
                    customerId: customerId,
                    // Add any other relevant info
                }
            };

            fastify.log.info({ options: razorpayOrderOptions }, "Creating Razorpay order...");

            // Create the aggregate order on Razorpay
            const razorpayOrder = await razorpayInstance.orders.create(razorpayOrderOptions);

            if (!razorpayOrder || !razorpayOrder.id) {
                fastify.log.error({ options: razorpayOrderOptions, response: razorpayOrder }, "Failed to create Razorpay order - invalid response.");
                throw new Error('Failed to create Razorpay order.');
            }

            fastify.log.info({ razorpayOrderId: razorpayOrder.id }, "Razorpay order created successfully.");

            // --- END: Razorpay Order Creation with Transfers ---

            // Send the successful response including the Razorpay Order ID
            return reply.send({
                platformOrders: createdOrders, // Your internal order details
                razorpayOrderId: razorpayOrder.id // The ID for Razorpay Checkout
            });

        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to process checkout.', details: error.message });
        }
    });
};