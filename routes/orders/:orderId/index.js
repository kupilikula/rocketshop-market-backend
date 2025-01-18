'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { orderId } = request.params;

        try {
            // Fetch the main order details with store info
            const order = await knex('orders as o')
                .join('stores as s', 'o.storeId', 's.storeId')
                .where('o.orderId', orderId)
                .select(
                    'o.*', // Select all columns from the orders table
                    's.storeName',
                    's.storeLogoImage' // Explicitly select store-specific columns
                )
                .first();

            if (!order) {
                return reply.status(404).send({ error: 'Order not found.' });
            }

            // Fetch the order status history
            const statusHistory = await knex('order_status_history')
                .where({ orderId })
                .orderBy('created_at', 'asc');

            // Fetch the order items with product mediaItems
            const items = await knex('order_items as oi')
                .join('products as p', 'oi.productId', 'p.productId')
                .where('oi.orderId', orderId)
                .select(
                    'oi.productId',
                    'oi.quantity',
                    'p.productName',
                    'p.price',
                    'p.mediaItems'
                );

            // Combine all data into a single response
            const response = {
                order,
                statusHistory,
                items,
            };

            return reply.send(response);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch order details.' });
        }
    });
};