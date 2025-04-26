'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.patch('/', async (request, reply) => {
        const customerId = request.user.customerId;

        const allowedFields = ['orderStatus', 'orderDelivery', 'chatMessages', 'miscellaneous', 'muteAll'];

        // Filter input to allowed fields only
        const updates = {};
        for (const key of allowedFields) {
            if (request.body.hasOwnProperty(key)) {
                updates[key] = request.body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return reply.status(400).send({ error: 'No valid fields provided' });
        }

        try {
            const [updated] = await knex('customerNotificationPreferences')
                .insert({
                    customerId,
                    ...updates
                })
                .onConflict('customerId')  // Assumes customerId is a unique key
                .merge({
                    ...updates,
                    updated_at: knex.fn.now()
                })
                .returning('*');
            return reply.status(200).send(updated);
        } catch (err) {
            console.error('Error updating notification preferences:', err);
            return reply.status(500).send({ error: 'Failed to update preferences' });
        }
    });
};