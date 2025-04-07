'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { customerId } = request.params;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        try {
            const followedStores = await knex('customer_followed_stores as cfs')
                .select([
                    's.*',
                    'cfs.followed_at as followed_at'
                ])
                .join('stores as s', 's.storeId', 'cfs.storeId')
                .where({
                    'cfs.customerId': customerId,
                    's.isActive': true
                })
                .orderBy('cfs.followed_at', 'desc');

            return reply.send({
                success: true,
                stores: followedStores
            });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch followed stores.' });
        }
    });
};