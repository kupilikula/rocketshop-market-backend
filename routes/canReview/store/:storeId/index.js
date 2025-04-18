'use strict'

const knex = require("@database/knexInstance");
const {getCompletedOrderStatuses} = require("../../../../utils/orderStatusList");
const completedStatuses = getCompletedOrderStatuses();

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { storeId } = request.params;
        const customerId = request.user?.customerId;

        if (!customerId) {
            return reply.status(401).send({ error: 'Authentication required' });
        }

        try {
            // Check if customer has an existing review for this store
            const existingReview = await knex('store_reviews')
                .where({
                    storeId,
                    customerId
                })
                .first();

            // Check if customer has at least one paid order from this store
            const hasPurchased = await knex('orders')
                .where({
                    customerId,
                    storeId,
                })
                .whereIn('orderStatus', completedStatuses)
                .first();


            return reply.status(200).send({
                canReview: !!hasPurchased,
                existingReview
            });

        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: 'Failed to check store review eligibility.'
            });
        }
    });
}