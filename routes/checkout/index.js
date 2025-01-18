'use strict';

const knex = require('@database/knexInstance');
const { v4: uuidv4 } = require('uuid');
const { calculateBilling } = require('../../utils/calculateBilling');

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { cartSummary, customerId, deliveryAddress } = request.body;

        try {
            // Validate request data
            if (!cartSummary || cartSummary.length === 0) {
                return reply.status(400).send({ error: 'Cart summary is missing or empty.' });
            }
            if (!customerId || !deliveryAddress) {
                return reply.status(400).send({ error: 'Customer ID or delivery address is missing.' });
            }

            // Wrap the entire checkout process in a transaction for atomicity
            const createdOrders = await knex.transaction(async (trx) => {
                return await Promise.all(
                    cartSummary.map(async (storeGroup) => {
                        const { storeId, storeName, storeLogoImage, billing, items } = storeGroup;

                        // Revalidate billing details
                        const expectedBilling = await calculateBilling(storeId, items);
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
                                    stock: product.stock - item.quantity,
                                    reservedStock: product.reservedStock + item.quantity,
                                });
                        }

                        // Create a new order
                        const orderId = uuidv4();
                        const orderData = {
                            orderId,
                            storeId,
                            customerId,
                            orderStatus: 'Order Received',
                            orderStatusUpdateTime: new Date(),
                            orderTotal: billing.total,
                            orderDate: new Date(),
                            deliveryAddress: JSON.stringify(deliveryAddress), // Save delivery address as JSON
                            created_at: new Date(),
                            updated_at: new Date(),
                        };

                        await trx('orders').insert(orderData);

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