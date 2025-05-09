// routes/checkout/index.js (Example path - assuming this is the customer app's checkout)

'use strict';

const knex = require('@database/knexInstance'); // Adjust path if needed
const { v4: uuidv4 } = require('uuid');
const { calculateBilling } = require('../../utils/calculateBilling'); // Adjust path
const { checkPreferencesAndSendNotificationToStoreMerchants, MerchantNotificationTypes } = require("../../services/PushNotificationsToMerchantsService"); // Adjust path
const { computeCartSummaryHash } = require("../../utils/cartSummaryHash"); // Adjust path
const Razorpay = require('razorpay');
const { getCanceledOrFailedOrderStatuses } = require("../../utils/orderStatusList"); // Adjust path

// Initialize Razorpay SDK (using your Platform/Partner keys)
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        // Assuming authentication middleware adds request.user.customerId
        const { cartSummary, customerId: requestCustomerId, recipient, deliveryAddress, cartSummaryHash } = request.body;
        const logger = fastify.log;
        const customerId = request.user?.customerId; // Get customerId from authenticated user

        // Authorization check
        if (!customerId || customerId !== requestCustomerId) {
            logger.warn({ requestCustomerId, authenticatedCustomerId: customerId }, "Unauthorized checkout attempt.");
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        try {
            // --- Input Validations ---
            if (!cartSummary || !Array.isArray(cartSummary) || cartSummary.length === 0) {
                return reply.status(400).send({ error: 'Cart summary is missing or empty.' });
            }
            if (!recipient || !deliveryAddress) {
                return reply.status(400).send({ error: 'Recipient or delivery address is missing.' });
            }
            if (!cartSummaryHash) {
                return reply.status(400).send({ error: 'Cart summary hash is missing.' });
            }

            const backendCartSummaryHash = computeCartSummaryHash(cartSummary);
            if (cartSummaryHash !== backendCartSummaryHash) {
                logger.warn({ clientHash: cartSummaryHash, serverHash: backendCartSummaryHash }, "Cart summary hash mismatch.");
                return reply.status(400).send({ error: 'Cart summary hash mismatch. Please refresh your cart.' });
            }

            // --- Modified Duplicate Checkout Check ---
            const failedOrCancelledStatuses = getCanceledOrFailedOrderStatuses();
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

            const recentAttempt = await knex('customer_cart_checkouts')
                .select('platformOrderIds')
                .where({ customerId, cartSummaryHash })
                .andWhere('created_at', '>', thirtyMinutesAgo)
                .orderBy('created_at', 'desc')
                .first();

            if (recentAttempt) {
                logger.info({ customerId, cartSummaryHash }, "Found recent checkout attempt. Checking statuses...");
                const previousOrderIds = recentAttempt.platformOrderIds; // Expecting JSON array from DB

                if (Array.isArray(previousOrderIds) && previousOrderIds.length > 0) {
                    const previousOrders = await knex('orders')
                        .select('orderStatus')
                        .whereIn('orderId', previousOrderIds);

                    if (previousOrders.length > 0) {
                        const allPreviousFailedOrCancelled = previousOrders.every(order =>
                            failedOrCancelledStatuses.includes(order.orderStatus)
                        );
                        if (!allPreviousFailedOrCancelled) {
                            logger.warn({ customerId, cartSummaryHash }, "Blocking duplicate checkout: Previous attempt orders not failed/cancelled.");
                            return reply.status(409).send({ error: 'A recent checkout attempt for this cart is still processing or was successful.' });
                        } else {
                            logger.info({ customerId, cartSummaryHash }, "Previous attempt failed/cancelled. Allowing new checkout.");
                        }
                    } else { logger.info({ customerId, cartSummaryHash }, "Previous checkout attempt orders not found. Allowing new checkout."); }
                } else { logger.info({ customerId, cartSummaryHash }, "Previous checkout attempt has no linked orders. Allowing new checkout."); }
            }
            // --- End Duplicate Check ---


            // --- Create Platform Orders and Reserve Stock (Transaction) ---
            let platformOrderIdsCreated = []; // Capture newly created IDs
            const createdOrders = await knex.transaction(async (trx) => {
                // Use Promise.all for parallel execution of independent store order creations
                const mappedOrders = await Promise.all(
                    cartSummary.map(async (storeGroup) => {
                        const { storeId, storeName, storeLogoImage, items } = storeGroup;

                        // Pass trx to calculateBilling if it needs to query within the transaction
                        const recomputedBilling = await calculateBilling(storeId, items, null, deliveryAddress /*, trx */);

                        // Reserve stock within transaction
                        for (const item of items) {
                            const product = await trx('products')
                                .where('productId', item.product.productId)
                                .forUpdate() // Lock row
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

                        // Create order record
                        const orderId = uuidv4();
                        platformOrderIdsCreated.push(orderId); // Capture the ID
                        await trx('orders').insert({
                            orderId, storeId, customerId,
                            orderStatus: 'Order Created', orderStatusUpdateTime: knex.fn.now(), // Use DB now
                            orderTotal: recomputedBilling.total, orderDate: knex.fn.now(), // Use DB now
                            recipient: JSON.stringify(recipient),
                            deliveryAddress: JSON.stringify(deliveryAddress),
                            // paymentId column assumed to exist, remains null initially
                            // created_at, updated_at handled by timestamps(true, true)
                        });

                        // Create history record
                        await trx('order_status_history').insert({
                            orderStatusId: uuidv4(), orderId, orderStatus: 'Order Created'
                            // notes column assumed to exist, null initially
                        });

                        // Create order items
                        const orderItemsData = items.map(item => ({
                            orderId, productId: item.product.productId,
                            price: item.product.price, quantity: item.quantity,
                        }));
                        await trx('order_items').insert(orderItemsData);

                        // Send notification (outside transaction or carefully managed)
                        // Consider moving notification logic outside the main transaction if it involves external calls
                        try {
                            const customer = await trx('customers').where('customerId', customerId).first(); // Fetch inside trx if needed
                            await checkPreferencesAndSendNotificationToStoreMerchants(
                                storeId, MerchantNotificationTypes.NEW_ORDER,
                                { orderId, orderTotal: recomputedBilling.total, customerName: customer.fullName }
                            );
                        } catch (notificationError) {
                            logger.error({ err: notificationError, storeId, orderId }, "Failed to send new order notification within transaction.");
                            // Decide if this should fail the transaction - likely not.
                        }

                        // Return data needed later
                        return {
                            orderId, storeId, storeName, storeLogoImage,
                            billing: recomputedBilling,
                            items, // Keep items if needed downstream, otherwise omit
                        };
                    }) // End map
                ); // End Promise.all
                return mappedOrders;
            }); // End Transaction
            logger.info({ customerId, orderCount: createdOrders.length }, "Platform orders created and stock reserved successfully.");

            // --- Record checkout attempt ---
            await knex('customer_cart_checkouts').insert({
                customerId,
                cartSummaryHash,
                platformOrderIds: JSON.stringify(platformOrderIdsCreated), // Store created order IDs
                created_at: new Date()
            });
            logger.info({ customerId, cartSummaryHash, createdOrderCount: platformOrderIdsCreated.length }, "Checkout attempt recorded.");

            // --- Prepare Data for Razorpay Order with Conditional Transfers ---
            let totalAmountInPaise = 0;
            const transferData = [];
            let expectedTransferTotalInPaise = 0; // Track expected transfer total

            // Fetch ownership status for all stores involved
            const storeIdsInOrder = createdOrders.map(o => o.storeId);
            const storeDetailsMap = new Map();
            if (storeIdsInOrder.length > 0) {
                const storesData = await knex('stores')
                    .select('storeId', 'isPlatformOwned') // Get the flag
                    .whereIn('storeId', storeIdsInOrder);
                storesData.forEach(s => storeDetailsMap.set(s.storeId, s));
            }

            for (const order of createdOrders) {
                const storeId = order.storeId;
                const orderTotalInPaise = Math.round(parseFloat(order.billing.total) * 100);
                if (isNaN(orderTotalInPaise)) {
                    throw new Error(`Invalid billing total for order ${order.orderId}`);
                }
                totalAmountInPaise += orderTotalInPaise;

                const storeInfo = storeDetailsMap.get(storeId);
                // Default to false (third-party) if store info somehow missing after creation
                const isPlatformStore = storeInfo?.isPlatformOwned || false;

                if (isPlatformStore) {
                    // Platform-owned store: Skip transfer
                    logger.info({ storeId, platformOrderId: order.orderId }, "Skipping Razorpay transfer for platform-owned store.");
                } else {
                    // Third-party store: Find linked Razorpay account and add transfer
                    logger.info({ storeId, platformOrderId: order.orderId }, "Adding transfer for third-party store.");
                    const accountLink = await knex('store_razorpay_links as srl')
                        .innerJoin('razorpay_credentials as rc', 'srl.razorpayCredentialId', 'rc.credentialId')
                        .select('rc.razorpayAccountId') // The 'acc_...' ID
                        .where('srl.storeId', storeId)
                        .first();

                    if (!accountLink || !accountLink.razorpayAccountId) {
                        logger.error(`Razorpay account link not found for third-party storeId: ${storeId}. Checkout cannot proceed.`);
                        throw new Error(`Store ${order.storeName || storeId} is not configured for payments.`);
                    }

                    transferData.push({
                        account: accountLink.razorpayAccountId,
                        amount: orderTotalInPaise,
                        currency: 'INR',
                        notes: { platform_order_id: order.orderId }
                    });
                    expectedTransferTotalInPaise += orderTotalInPaise; // Add to expected transfer sum
                }
            } // End for loop

            // Basic validation checks
            if (totalAmountInPaise <= 0) { throw new Error("Total payment amount must be positive."); }
            const actualTransferTotal = transferData.reduce((sum, t) => sum + t.amount, 0);
            if (actualTransferTotal !== expectedTransferTotalInPaise) {
                logger.error({ expectedTransferTotalInPaise, actualTransferTotal }, "Transfer amount calculation mismatch!");
                throw new Error('Internal calculation error: Transfer amount mismatch.');
            }

            // --- Create Razorpay Order ---
            const razorpayOrderOptions = {
                amount: totalAmountInPaise,
                currency: 'INR',
                receipt: uuidv4(), // Use simple UUID for receipt
                notes: {
                    platform_order_ids: JSON.stringify(platformOrderIdsCreated),
                    customerId: customerId,
                }
            };

            // Only add transfers key if there are actual transfers to make
            if (transferData.length > 0) {
                razorpayOrderOptions.transfers = transferData;
                logger.info({ transferCount: transferData.length }, "Creating Razorpay order WITH transfers...");
            } else {
                logger.info("Creating Razorpay order WITHOUT transfers (all platform items).");
            }

            console.log('razorpayOrderOptions: ', razorpayOrderOptions);
            let razorpayOrder;
            try {
                razorpayOrder = await razorpayInstance.orders.create(razorpayOrderOptions);
                console.log('razorpayOrder: ', razorpayOrder);
            } catch (razorpayError) {
                console.log('razorpayError: ', razorpayError);
                logger.error({ err: razorpayError }, "Failed to create Razorpay order.");
                throw new Error('Failed to create Razorpay order.');
            }

            if (!razorpayOrder || !razorpayOrder.id) {
                logger.error({ options: razorpayOrderOptions, response: razorpayOrder }, "Invalid response from Razorpay order creation.");
                throw new Error('Failed to create Razorpay order.');
            }
            logger.info({ razorpayOrderId: razorpayOrder.id }, "Razorpay order created successfully.");

            // --- Populate razorpay_order_mapping Table ---
            const mappingInserts = platformOrderIdsCreated.map(orderId => ({
                razorpayOrderId: razorpayOrder.id,
                platformOrderId: orderId,
            }));
            if (mappingInserts.length > 0) {
                await knex('razorpay_order_mapping').insert(mappingInserts);
                logger.info({ count: mappingInserts.length, razorpayOrderId: razorpayOrder.id }, "Razorpay order mappings created.");
            }
            // --- End Populate Mapping ---

            // --- Final Success Response ---
            return reply.send({
                platformOrders: createdOrders.map(({ items, ...order }) => order), // Maybe exclude full items list from response?
                razorpayOrderId: razorpayOrder.id
            });

        } catch (error) {
            logger.error({ err: error, customerId }, "Checkout process failed.");
            // Consider more specific status codes based on error type if possible
            return reply.status(500).send({ error: 'Failed to process checkout.', details: error.message });
        }
    });
};