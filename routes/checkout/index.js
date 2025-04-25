'use strict';

const knex = require('@database/knexInstance');
const { v4: uuidv4 } = require('uuid');
const { calculateBilling } = require('../../utils/calculateBilling');
const {checkPreferencesAndSendNotificationToStoreMerchants, MerchantNotificationTypes} = require("../../services/PushNotificationsToMerchantsService");

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { cartSummary, customerId, recipient, deliveryAddress } = request.body;

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

            // Wrap the entire checkout process in a transaction for atomicity
            const createdOrders = await knex.transaction(async (trx) => {
                return await Promise.all(
                    cartSummary.map(async (storeGroup) => {
                        const { storeId, storeName, storeLogoImage, billing, items } = storeGroup;

                        // Revalidate billing details
                        const expectedBilling = await calculateBilling(storeId, items, null, deliveryAddress);
                        if (
                            billing.subtotal !== expectedBilling.subtotal ||
                            billing.shipping !== expectedBilling.shipping ||
                            billing.discount !== expectedBilling.discount ||
                            billing.gst !== expectedBilling.gst ||
                            billing.total !== expectedBilling.total
                        ) {
                            throw new Error(
                                `Billing mismatch for store ${storeId}. Expected: ${JSON.stringify(
                                    expectedBilling
                                )}, Received: ${JSON.stringify(billing)}`
                            );
                        }

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
                            orderTotal: billing.total,
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

                        await checkPreferencesAndSendNotificationToStoreMerchants(storeId, MerchantNotificationTypes.NEW_ORDER, {orderId, orderTotal: billing.total, customerName: customer.fullName})

                        return {
                            orderId,
                            storeId,
                            storeName,
                            storeLogoImage,
                            billing,
                            items,
                        };
                    })
                );
            });

            return reply.send(createdOrders);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to process checkout.', details: error.message });
        }
    });
};