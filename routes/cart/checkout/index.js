'use strict';

const knex = require('@database/knexInstance');
const Razorpay = require('razorpay');
const { decryptText } = require('../../utils/encryption');
const { computePerStoreCheckoutHash } = require('../../utils/computePerStoreCheckoutHash');
const { getCanceledOrFailedOrderStatuses } = require('../../utils/orderStatusList');
const { v4: uuidv4 } = require('uuid');
// --- NEW: Import the billing function ---
const { calculateBilling } = require('../../utils/calculateBilling');

module.exports = async function(fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const logger = fastify.log;
        const customerId = request.user.customerId;
        // --- REFACTORED: appliedOffers is now included ---
        const { storeId, cartItems, deliveryAddress, recipient, appliedOffers } = request.body;

        // 1. --- Input Validation ---
        if (!storeId || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || !deliveryAddress || !recipient) {
            return reply.status(400).send({ error: "A storeId, cart items, recipient, and delivery address are required." });
        }

        // 2. --- Duplicate Checkout Detection (Now includes appliedOffers) ---
        try {
            // --- REFACTORED: Hash now includes appliedOffers for better accuracy ---
            const checkoutHash = computePerStoreCheckoutHash({ customerId, storeId, cartItems, deliveryAddress, appliedOffers });
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

            const recentAttempt = await knex('customer_cart_checkouts')
                .where({ customerId, checkoutHash: checkoutHash })
                .andWhere('created_at', '>', tenMinutesAgo)
                .orderBy('created_at', 'desc')
                .first();

            if (recentAttempt && recentAttempt.platformOrderId) {
                const previousOrder = await knex('orders').where('orderId', recentAttempt.platformOrderId).first('orderStatus');
                if (previousOrder && !getCanceledOrFailedOrderStatuses().includes(previousOrder.orderStatus)) {
                    logger.warn({ customerId, checkoutHash }, "Blocking duplicate checkout: Previous attempt is still active.");
                    return reply.status(409).send({ error: 'A recent checkout attempt for this cart is already in progress.' });
                }
            }
        } catch (hashError) {
            logger.error({ err: hashError }, "Error during duplicate checkout detection. Proceeding without check.");
        }

        // --- NEW: Step 3: Fetch full product data and validate stock BEFORE the transaction ---
        let fullCartItems;
        try {
            const productIds = cartItems.map(item => item.productId);
            const products = await knex('products').whereIn('productId', productIds).andWhere({ storeId });
            const productsMap = new Map(products.map(p => [p.productId, p]));

            fullCartItems = cartItems.map(item => {
                const product = productsMap.get(item.productId);
                if (!product) {
                    throw new Error(`Product ${item.productId} not found for store ${storeId}.`);
                }
                const availableStock = product.stock - product.reservedStock;
                if (item.quantity > availableStock) {
                    throw new Error(`Insufficient stock for ${product.productName}. Available: ${availableStock}, Requested: ${item.quantity}`);
                }
                return { product, quantity: item.quantity };
            });
        } catch (error) {
            logger.error({ err: error, storeId, customerId }, "Checkout failed during product validation.");
            return reply.status(400).send({ error: error.message });
        }

        const trx = await knex.transaction();
        try {
            // --- NEW: Step 4: Re-calculate all billing details using the trusted util ---
            // Extract offer codes from the appliedOffers objects received from the frontend
            const offerCodes = appliedOffers.map(offer => offer.offerCode).filter(Boolean);
            const billingDetails = await calculateBilling(storeId, fullCartItems, offerCodes, deliveryAddress);

            if (billingDetails.total <= 0) {
                throw new Error("Order total must be greater than zero.");
            }
            logger.info({ billingDetails }, "Billing re-calculated successfully at checkout.");

            // 5. --- Fetch Store's Razorpay Credentials ---
            const storeCredentials = await trx('razorpay_credentials as rc')
                .join('store_razorpay_links as srl', 'rc.credentialId', 'srl.razorpayCredentialId')
                .where('srl.storeId', storeId)
                .first('rc.accessToken', 'rc.razorpayLinkedAccountId', 'rc.public_token');
            if (!storeCredentials?.accessToken) {
                throw new Error('This store is not configured for payments.');
            }
            const decryptedAccessToken = decryptText(storeCredentials.accessToken);
            const decryptedPublicToken = decryptText(storeCredentials.public_token);
            if (!decryptedAccessToken || !decryptedPublicToken) {
                throw new Error('Could not prepare payment credentials for this store.');
            }

            // 6. --- Create Platform Order with Full Billing Details ---
            const orderId = uuidv4();
            await trx('orders').insert({
                orderId,
                storeId,
                customerId,
                // --- REFACTORED: Use precise billing details ---
                subtotal: billingDetails.subtotal,
                shipping: billingDetails.shipping,
                discount: billingDetails.discount,
                gst: billingDetails.gst,
                orderTotal: billingDetails.total,
                appliedOffers: JSON.stringify(appliedOffers), // Store the applied offers
                deliveryAddress: JSON.stringify(deliveryAddress),
                recipient: JSON.stringify(recipient),
                orderStatus: 'Order Created',
            });
            await trx('order_status_history').insert({ orderStatusId: uuidv4(), orderId, orderStatus: 'Order Created' });

            // --- REFACTORED: Reserve stock and create order items in a separate loop ---
            for (const item of fullCartItems) {
                await trx('products').where('productId', item.product.productId).increment('reservedStock', item.quantity);
                await trx('order_items').insert({
                    orderId,
                    productId: item.product.productId,
                    quantity: item.quantity,
                    price: item.product.price // Record price at time of purchase
                });
            }
            logger.info({ orderId, total: billingDetails.total }, "Platform order and items created, stock reserved.");

            const checkoutHash = computePerStoreCheckoutHash({ customerId, storeId, cartItems, deliveryAddress, appliedOffers });
            await trx('customer_cart_checkouts').insert({ customerId, checkoutHash, platformOrderId: orderId });

            // 7. --- Create Razorpay Order with the correct total ---
            const razorpayInstance = new Razorpay({ oauthToken: decryptedAccessToken });
            const totalAmountInPaise = Math.round(billingDetails.total * 100);
            const razorpayOrderPayload = { amount: totalAmountInPaise, currency: "INR", receipt: orderId };
            const razorpayOrder = await razorpayInstance.orders.create(razorpayOrderPayload);

            // 8. --- Finalize Platform Order and Commit ---
            await trx('orders').where('orderId', orderId).update({ razorpayOrderId: razorpayOrder.id });
            await trx.commit();

            // 9. --- Return details to frontend to open checkout ---
            return reply.send({
                success: true,
                platformOrder: { orderId: orderId, totalAmount: billingDetails.total },
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