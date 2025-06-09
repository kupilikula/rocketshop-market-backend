// Example Path: routes/checkout/create-order.js

'use strict';

const knex = require('@database/knexInstance');
const Razorpay = require('razorpay');
const { decryptText } = require('../../utils/encryption');
const { computePerStoreCartHash } = require('../../utils/computePerStoreCartHash');
const { getCanceledOrFailedOrderStatuses } = require('../../utils/orderStatusList');
const { v4: uuidv4 } = require('uuid');

module.exports = async function(fastify, opts) {
    // This route assumes that authentication has been handled globally or by a parent plugin,
    // as it relies on `request.user.customerId` being available.
    fastify.post('/', async (request, reply) => {
        const logger = fastify.log;
        const customerId = request.user.customerId;
        const { storeId, cartItems, deliveryAddress, recipient } = request.body; // Renamed to deliveryAddress

        // 1. --- Input Validation ---
        if (!storeId || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || !deliveryAddress || !recipient) {
            return reply.status(400).send({ error: "A storeId, cart items, recipient, and delivery address are required." });
        }

        // 2. --- Duplicate Checkout Detection ---
        try {
            // Using deliveryAddress in hash
            const checkoutHash = computePerStoreCartHash({ customerId, storeId, cartItems, deliveryAddress });
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

            const recentAttempt = await knex('customer_cart_checkouts')
                .where({ customerId, checkoutHash: checkoutHash })
                .andWhere('created_at', '>', tenMinutesAgo)
                .orderBy('created_at', 'desc')
                .first();

            if (recentAttempt && recentAttempt.platformOrderId) {
                const previousOrder = await knex('orders')
                    .where('orderId', recentAttempt.platformOrderId)
                    .first('orderStatus');

                if (previousOrder && !getCanceledOrFailedOrderStatuses().includes(previousOrder.orderStatus)) {
                    logger.warn({ customerId, checkoutHash }, "Blocking duplicate checkout: Previous attempt is still active.");
                    return reply.status(409).send({ error: 'A recent checkout attempt for this cart is already in progress.' });
                }
            }
        } catch(hashError) {
            logger.error({ err: hashError }, "Error during duplicate checkout detection. Proceeding without check.");
        }

        const trx = await knex.transaction();
        try {
            // 3. --- Fetch Store's Razorpay Credentials ---
            const storeCredentials = await trx('razorpay_credentials as rc')
                .join('store_razorpay_links as srl', 'rc.credentialId', 'srl.razorpayCredentialId')
                .where('srl.storeId', storeId)
                .first('rc.accessToken', 'rc.razorpayLinkedAccountId', 'rc.public_token');

            if (!storeCredentials?.accessToken || !storeCredentials?.razorpayLinkedAccountId || !storeCredentials?.public_token) {
                throw new Error('This store is not configured for payments.');
            }
            const decryptedAccessToken = decryptText(storeCredentials.accessToken);
            const decryptedPublicToken = decryptText(storeCredentials.public_token);
            if (!decryptedAccessToken || !decryptedPublicToken) {
                throw new Error('Could not prepare payment credentials for this store.');
            }
            logger.info({ storeId }, "Fetched and decrypted Razorpay credentials for store.");

            // 4. --- Create Platform Order, Items, and Reserve Stock ---
            const orderId = uuidv4();
            await trx('orders').insert({
                orderId,
                storeId,
                customerId,
                orderTotal: 0,
                deliveryAddress: JSON.stringify(deliveryAddress), // Renamed to deliveryAddress
                recipient: JSON.stringify(recipient),
                orderStatus: 'Order Created',
            });

            await trx('order_status_history').insert({
                orderStatusId: uuidv4(), orderId, orderStatus: 'Order Created'
            });

            let totalAmount = 0;
            for (const item of cartItems) {
                const product = await trx('products').where({ productId: item.productId, storeId: storeId }).forUpdate().first();
                if (!product) throw new Error(`Product ${item.productId} not found for store ${storeId}.`);
                const availableStock = product.stock - product.reservedStock;
                if (item.quantity > availableStock) throw new Error(`Insufficient stock for ${product.productName}.`);

                await trx('products').where('productId', item.productId).increment('reservedStock', item.quantity);
                totalAmount += product.price * item.quantity;

                await trx('order_items').insert({
                    orderId, productId: item.productId,
                    quantity: item.quantity, price: product.price
                });
            }
            if (totalAmount <= 0) throw new Error("Order total must be greater than zero.");
            logger.info({ orderId, totalAmount }, "Platform order and items created, stock reserved.");

            const checkoutHash = computePerStoreCartHash({ customerId, storeId, cartItems, deliveryAddress });
            await trx('customer_cart_checkouts').insert({
                customerId, checkoutHash, platformOrderId: orderId
            });

            // 5. --- Create Razorpay Order ---
            const razorpayInstance = new Razorpay({ oauthToken: decryptedAccessToken });
            console.log('decrypted access token:', decryptedAccessToken);
            const totalAmountInPaise = Math.round(totalAmount * 100);
            const transferData = [{ account: storeCredentials.razorpayLinkedAccountId, amount: totalAmountInPaise, currency: "INR" }];
            const razorpayOrderPayload = { amount: totalAmountInPaise, currency: "INR", receipt: orderId, transfers: transferData };
            const razorpayOrder = await razorpayInstance.orders.create(razorpayOrderPayload);

            // 6. --- Finalize Platform Order and Commit ---
            await trx('orders').where('orderId', orderId).update({
                orderTotal: totalAmount,
                razorpayOrderId: razorpayOrder.id
            });
            await trx.commit();

            // 7. --- Return details to frontend to open checkout ---
            return reply.send({
                success: true,
                platformOrder: { orderId: orderId, totalAmount: totalAmount },
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                key: process.env.RAZORPAY_KEY_ID,
                publicToken: decryptedPublicToken
            });

        } catch (error) {
            if (trx && !trx.isCompleted()) await trx.rollback();
            logger.error({ err: error, storeId, customerId }, "Per-store order creation failed.");
            return reply.status(500).send({ error: error.message || "Failed to create order." });
        }
    });
};