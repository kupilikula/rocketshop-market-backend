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
};