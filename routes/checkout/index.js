'use strict';

const knex = require('@database/knexInstance'); // Adjust path if needed
const { v4: uuidv4 } = require('uuid');
const { calculateBilling } = require('../../utils/calculateBilling'); // Adjust path
const { checkPreferencesAndSendNotificationToStoreMerchants, MerchantNotificationTypes } = require("../../services/PushNotificationsToMerchantsService"); // Adjust path
const { computeCartSummaryHash } = require("../../utils/cartSummaryHash"); // Adjust path
const Razorpay = require('razorpay');

// Initialize Razorpay SDK
// Ensure you use the correct keys (Test for testing, Live for production)
// These should be YOUR PLATFORM's/PARTNER's API keys for creating Route orders
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { cartSummary, customerId, recipient, deliveryAddress, cartSummaryHash } = request.body;
        const logger = fastify.log; // Use Fastify logger

        if (customerId !== request.user.customerId) {
            logger.warn({ requestedCustomerId: customerId, authenticatedCustomerId: request.user.customerId }, "Unauthorized checkout attempt for different customer.");
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        try {
            // --- Input Validations ---
            if (!cartSummary || cartSummary.length === 0) {
                return reply.status(400).send({ error: 'Cart summary is missing or empty.' });
            }
            if (!customerId || !recipient || !deliveryAddress) { // Added deliveryAddress check
                return reply.status(400).send({ error: 'Customer ID, recipient, or delivery address is missing.' });
            }

            const backendCartSummaryHash = computeCartSummaryHash(cartSummary);
            if (cartSummaryHash !== backendCartSummaryHash) {
                logger.warn({ clientHash: cartSummaryHash, serverHash: backendCartSummaryHash }, "Cart summary hash mismatch.");
                return reply.status(400).send({ error: 'Cart summary hash mismatch. Please refresh your cart.' });
            }

            const alreadyCheckedOut = await knex('customer_cart_checkouts')
                .where({ customerId, cartSummaryHash })
                .andWhere('created_at', '>', knex.raw(`now() - interval '30 minutes'`))
                .first();

            if (alreadyCheckedOut) {
                logger.info({ customerId, cartSummaryHash }, "Duplicate checkout detected within 30 minutes.");
                return reply.status(409).send({ error: 'Duplicate checkout detected for this cart (within 30 minutes).' });
            }

            // --- Create Platform Orders (within a transaction) ---
            const createdOrders = await knex.transaction(async (trx) => {
                return await Promise.all(
                    cartSummary.map(async (storeGroup) => {
                        const { storeId, storeName, storeLogoImage, billing, items } = storeGroup;

                        const recomputedBilling = await calculateBilling(storeId, items, null, deliveryAddress);
                        // Optional: Strict billing revalidation (uncomment if needed)
                        // if (billing.total !== recomputedBilling.total /* || other fields */) {
                        //     throw new Error(`Billing mismatch for store ${storeId}.`);
                        // }

                        for (const item of items) {
                            const product = await trx('products')
                                .where('productId', item.product.productId)
                                .forUpdate()
                                .first();
                            if (!product) throw new Error(`Product not found: ${item.product.productId}`);
                            const availableStock = product.stock - product.reservedStock;
                            if (item.quantity > availableStock) {
                                throw new Error(`Insufficient stock for ${item.product.productName}. Available: ${availableStock}.`);
                            }
                            await trx('products')
                                .where('productId', item.product.productId)
                                .increment('reservedStock', item.quantity);
                        }

                        const orderId = uuidv4();
                        await trx('orders').insert({
                            orderId, storeId, customerId,
                            orderStatus: 'Order Created', orderStatusUpdateTime: new Date(),
                            orderTotal: recomputedBilling.total, orderDate: new Date(),
                            recipient: JSON.stringify(recipient),
                            deliveryAddress: JSON.stringify(deliveryAddress),
                        });
                        await trx('order_status_history').insert({
                            orderStatusId: uuidv4(), orderId, orderStatus: 'Order Created'
                        });
                        const orderItemsData = items.map(item => ({
                            orderId, productId: item.product.productId,
                            price: item.product.price, quantity: item.quantity,
                        }));
                        await trx('order_items').insert(orderItemsData);

                        const customer = await trx('customers').where('customerId', customerId).first();
                        await checkPreferencesAndSendNotificationToStoreMerchants(
                            storeId, MerchantNotificationTypes.NEW_ORDER,
                            { orderId, orderTotal: recomputedBilling.total, customerName: customer.fullName }
                        );

                        return {
                            orderId, storeId, storeName, storeLogoImage,
                            billing: recomputedBilling, // Use recomputed billing
                            items,
                        };
                    })
                );
            });
            logger.info({ customerId, orderCount: createdOrders.length }, "Platform orders created successfully.");

            // Record this checkout attempt
            await knex('customer_cart_checkouts').insert({ customerId, cartSummaryHash });

            // --- Prepare Data for Razorpay Order with Transfers ---
            let totalAmountInPaise = 0;
            const transferData = [];
            const platformOrderDetailsForMapping = []; // To store { platformOrderId, storeId }

            for (const order of createdOrders) {
                const storeId = order.storeId;
                const orderTotal = parseFloat(order.billing.total);
                if (isNaN(orderTotal)) {
                    logger.error({ platformOrderId: order.orderId }, "Invalid billing total for platform order.");
                    throw new Error(`Invalid billing total for order ${order.orderId}`);
                }
                const orderTotalInPaise = Math.round(orderTotal * 100);
                totalAmountInPaise += orderTotalInPaise;
                platformOrderDetailsForMapping.push({ platformOrderId: order.orderId, storeId: order.storeId });

                // --- >>> FETCH Razorpay Account ID using NEW SCHEMA <<< ---
                const accountLink = await knex('store_razorpay_links as srl')
                    .innerJoin('razorpay_credentials as rc', 'srl.razorpayCredentialId', 'rc.credentialId')
                    .select('rc.razorpayAccountId') // This is the 'acc_...' ID
                    .where('srl.storeId', storeId)
                    .first();

                if (!accountLink || !accountLink.razorpayAccountId) {
                    logger.error(`Razorpay account ID not found for storeId: ${storeId}. Payment cannot proceed for this store.`);
                    // This is a critical setup error.
                    // Consider how to handle this: Fail entire payment, or allow partial payment?
                    // For now, failing the entire payment attempt.
                    throw new Error(`Store ${order.storeName || storeId} is not configured for payments.`);
                }
                // --- >>> END FETCH <<< ---

                transferData.push({
                    account: accountLink.razorpayAccountId,
                    amount: orderTotalInPaise,
                    currency: 'INR',
                    notes: { platform_order_id: order.orderId } // Good for reconciliation
                });
            }

            if (totalAmountInPaise <= 0) {
                logger.error({ totalAmountInPaise }, "Calculated total payment amount is not positive.");
                throw new Error("Total payment amount must be positive.");
            }
            // Optional Sanity Check (already present in your code)
            const totalTransferAmount = transferData.reduce((sum, t) => sum + t.amount, 0);
            if (totalTransferAmount !== totalAmountInPaise) { /* ... log and throw ... */ }


            const razorpayOrderOptions = {
                amount: totalAmountInPaise,
                currency: 'INR',
                receipt: `rcpt_${uuidv4()}`, // Unique receipt for this payment attempt
                transfers: transferData,
                notes: {
                    platform_order_ids: JSON.stringify(platformOrderDetailsForMapping.map(o => o.platformOrderId)),
                    customerId: customerId,
                }
            };

            logger.info({ options: razorpayOrderOptions }, "Creating Razorpay order with transfers...");
            const razorpayOrder = await razorpayInstance.orders.create(razorpayOrderOptions);

            if (!razorpayOrder || !razorpayOrder.id) {
                logger.error({ options: razorpayOrderOptions, response: razorpayOrder }, "Failed to create Razorpay order - invalid response from Razorpay.");
                throw new Error('Failed to create Razorpay order with payment gateway.');
            }
            logger.info({ razorpayOrderId: razorpayOrder.id }, "Razorpay order created successfully.");

            // --- >>> NEW: Populate razorpay_order_mapping Table <<< ---
            const mappingInserts = platformOrderDetailsForMapping.map(detail => ({
                razorpayOrderId: razorpayOrder.id, // The aggregate RZP order ID
                platformOrderId: detail.platformOrderId, // Individual platform order ID
                // created_at, updated_at should be handled by DB defaults/timestamps(true,true)
            }));

            if (mappingInserts.length > 0) {
                await knex('razorpay_order_mapping').insert(mappingInserts);
                logger.info({ count: mappingInserts.length, razorpayOrderId: razorpayOrder.id }, "Razorpay order mappings created.");
            }
            // --- >>> END POPULATE MAPPING <<< ---

            return reply.send({
                platformOrders: createdOrders,
                razorpayOrderId: razorpayOrder.id // This is what the frontend needs for Razorpay Checkout
            });

        } catch (error) {
            logger.error({ err: error, customerId }, "Checkout process failed.");
            // Provide a user-friendly error message if possible, log detailed error.
            return reply.status(500).send({ error: 'Failed to process checkout.', details: error.message });
        }
    });
};