'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.get('/', async function (request, reply) {
        const { customerId } = request.params;

        if (!request.user || request.user.customerId !== customerId) {
            return reply.status(403).send({ error: 'Forbidden: Invalid customer access.' });
        }

        try {
            const cartRow = await knex('customer_carts')
                .where({ customerId })
                .orderBy('updated_at', 'desc')
                .first();

            if (!cartRow || !cartRow.cartData) {
                return reply.send({ cartData: null }); // Explicit null if not found
            }

            return reply.send({ cartData: cartRow.cartData });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch cart data.' });
        }
    });
};