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
            // Get all stores the customer is following with store details
            const followedStores = await knex('customer_followed_stores as cfs')
                .select([
                    's.storeId',
                    's.storeName',
                    's.storeLogoImage',
                    's.storeBrandColor',
                    's.storeDescription',
                    's.storeHandle',
                    's.followerCount',
                    's.storeTags',
                    's.isActive',
                    's.created_at as storeCreatedAt',
                    's.updated_at as storeUpdatedAt',
                    'cfs.created_at as followedAt'
                ])
                .join('stores as s', 's.storeId', 'cfs.storeId')
                .where({
                    'cfs.customerId': customerId,
                    's.isActive': true // Only return active stores
                })
                .orderBy('cfs.created_at', 'desc');

            return reply.send({
                success: true,
                stores: followedStores.map(store => ({
                    ...store,
                    storeTags: JSON.parse(store.storeTags) // Parse JSONB field
                }))
            });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch followed stores.' });
        }
    });
};