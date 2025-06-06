// Example Path: routes/checkout/create-order.js

'use strict';

const knex = require('@database/knexInstance');
const Razorpay = require('razorpay');
const { decryptText } = require('../../utils/encryption');
const { computePerStoreCartHash } = require('../../utils/computePerStoreCartHash');
const { getCanceledOrFailedOrderStatuses } = require('../../utils/orderStatusList');

module.exports = async function(fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const logger = fastify.log;
        const customerId = request.user.customerId;
        const { storeId, cartItems, shippingAddress } = request.body;

        // 1. --- Input Validation (Unchanged) ---
        if (!storeId || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || !shippingAddress) {
            return reply.status(400).send({ error: "A storeId, cart items, and shipping address are required." });
        }

        // 2. --- Duplicate Checkout Detection (Unchanged) ---
        try {
            const checkoutHash = computePerStoreCartHash({ customerId, storeId, cartItems, shippingAddress });
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

            const recentAttempt = await knex('customer_cart_checkouts')
                .where({ customerId, checkoutHash })
                .andWhere('created_at', '>', tenMinutesAgo)
                .orderBy('created_at', 'desc')
                .first();

            if (recentAttempt && recentAttempt.platformOrderId) {
                const previousOrder = await knex('orders')
                    .where('orderId', recentAttempt.platformOrderId)
                    .first('status');

                if (previousOrder && !getCanceledOrFailedOrderStatuses().includes(previousOrder.status)) {
                    logger.warn({ customerId, checkoutHash }, "Blocking duplicate checkout: Previous attempt is still processing or was successful.");
                    return reply.status(409).send({ error: 'A recent checkout attempt for this cart is already in progress.' });
                }
            }
        } catch(hashError) {
            logger.error({ err: hashError }, "Error during duplicate checkout detection. Proceeding without check.");
        }

        const trx = await knex.transaction();
        try {
            // 3. --- Fetch Store's Razorpay Credentials (MODIFIED) ---
            const storeCredentials = await trx('razorpay_credentials as rc')
                .join('store_razorpay_links as srl', 'rc.credentialId', 'srl.razorpayCredentialId')
                .where('srl.storeId', storeId)
                .first(
                    'rc.accessToken',
                    'rc.razorpayLinkedAccountId',
                    'rc.public_token' // <<< ADDED: Fetch the public_token
                );

            if (!storeCredentials || !storeCredentials.accessToken || !storeCredentials.razorpayLinkedAccountId || !storeCredentials.public_token) {
                throw new Error('This store is not fully configured for payments.');
            }

            const decryptedAccessToken = decryptText(storeCredentials.accessToken);
            const decryptedPublicToken = decryptText(storeCredentials.public_token); // <<< ADDED: Decrypt the public_token

            if (!decryptedAccessToken || !decryptedPublicToken) {
                throw new Error('Could not prepare payment credentials for this store.');
            }
            logger.info({ storeId }, "Fetched and decrypted Razorpay credentials for store.");

            // 4. --- Create Platform Order, Items, and Reserve Stock (Unchanged) ---
            const [order] = await trx('orders').insert({
                customerId,
                totalAmount: 0,
                shippingAddress: JSON.stringify(shippingAddress),
                status: 'pending_payment'
            }).returning('*');

            let totalAmount = 0;
            for (const item of cartItems) {
                const product = await trx('products').where({ productId: item.productId, storeId: storeId }).forUpdate().first();
                if (!product) throw new Error(`Product ${item.productId} not found for store ${storeId}.`);

                const availableStock = product.stock - product.reservedStock;
                if (item.quantity > availableStock) {
                    throw new Error(`Insufficient stock for ${product.productName}. Available: ${availableStock}.`);
                }

                await trx('products').where('productId', item.productId).increment('reservedStock', item.quantity);
                totalAmount += product.price * item.quantity;
                await trx('order_items').insert({
                    orderId: order.orderId, storeId: storeId, productId: item.productId,
                    quantity: item.quantity, priceAtTimeOfOrder: product.price
                });
            }
            if (totalAmount <= 0) throw new Error("Order total must be greater than zero.");
            logger.info({ orderId: order.orderId, totalAmount }, "Platform order created and stock reserved.");

            const checkoutHash = computePerStoreCartHash({ customerId, storeId, cartItems, shippingAddress });
            await trx('customer_cart_checkouts').insert({
                customerId,
                checkoutHash: checkoutHash, // Renamed column
                platformOrderId: order.orderId
            });

            // 5. --- Create Razorpay Order using the Store's OAuth Token (Unchanged) ---
            const razorpayInstance = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID, // Your Platform's Key ID is still needed here
                oauthToken: decryptedAccessToken
            });

            const totalAmountInPaise = Math.round(totalAmount * 100);
            const transferData = [{
                account: storeCredentials.razorpayLinkedAccountId,
                amount: totalAmountInPaise,
                currency: "INR",
                notes: { store_id: storeId, platform_order_id: order.orderId }
            }];
            const razorpayOrderPayload = { amount: totalAmountInPaise, currency: "INR", receipt: order.orderId, transfers: transferData };

            logger.info({ receipt: order.orderId, amount: totalAmountInPaise }, "Creating Razorpay Order with OAuth token...");
            const razorpayOrder = await razorpayInstance.orders.create(razorpayOrderPayload);
            logger.info({ razorpayOrderId: razorpayOrder.id }, "Razorpay order created successfully.");

            // 6. --- Finalize Platform Order and Commit (Unchanged) ---
            await trx('orders').where('orderId', order.orderId).update({
                totalAmount: totalAmount,
                razorpayOrderId: razorpayOrder.id
            });
            await trx.commit();

            // 7. --- Return details to frontend to open checkout (MODIFIED) ---
            return reply.send({
                success: true,
                platformOrder: { orderId: order.orderId, totalAmount: totalAmount },
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                key: process.env.RAZORPAY_KEY_ID,
                publicToken: decryptedPublicToken // <<< ADDED: Include the decrypted public_token
            });

        } catch (error) {
            if (trx && !trx.isCompleted()) await trx.rollback();
            logger.error({ err: error, storeId, customerId }, "Per-store order creation failed.");
            return reply.status(500).send({ error: error.message || "Failed to create order." });
        }
    });
};