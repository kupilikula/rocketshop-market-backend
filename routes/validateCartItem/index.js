'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { productId, quantity } = request.body;

        try {
            // Fetch product details
            const product = await knex('products').where('productId', productId).first();

            if (!product) {
                return reply.status(404).send({ error: 'Product not found.' });
            }

            const availableStock = product.stock - product.reservedStock;

            if (quantity > availableStock) {
                return reply.status(400).send({
                    valid: false,
                    message: `Only ${availableStock} units are available.`,
                });
            }

            return reply.send({ valid: true });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to validate cart item.' });
        }
    });
};