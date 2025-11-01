'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const customerId = request.user.customerId;

        try {
            // Verify customer exists
            const customer = await knex('customers').where({ customerId }).first();
            if (!customer) {
                return reply.status(404).send({ error: 'Customer not found' });
            }

            let preferences = await knex('customerNotificationPreferences')
                .where({ customerId })
                .first();

            if (!preferences) {
                return reply.status(404).send({error: 'Preferences not found'})
            }

            return reply.status(200).send(preferences);
        } catch (err) {
            console.error('Error fetching customer notification preferences:', err);
            return reply.status(500).send({ error: 'Failed to fetch preferences' });
        }
    });

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