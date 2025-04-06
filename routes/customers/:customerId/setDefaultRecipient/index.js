'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { customerId } = request.params;
        const { recipientId } = request.body;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        if (!recipientId) {
            return reply.status(400).send({ error: 'RecipientId is required.' });
        }

        try {
            // Verify that the recipient belongs to the customer
            const recipient = await knex('recipients')
                .where({
                    recipientId,
                    customerId
                })
                .first();

            if (!recipient) {
                return reply.status(404).send({ error: 'Recipient not found or does not belong to the customer.' });
            }

            // Start a transaction to update the default recipient
            await knex.transaction(async (trx) => {
                // First, set all recipients for this customer to non-default
                await trx('recipients')
                    .where({ customerId })
                    .update({ isDefaultRecipient: false });

                // Then set the specified recipient as default
                await trx('recipients')
                    .where({
                        recipientId,
                        customerId
                    })
                    .update({ isDefaultRecipient: true });
            });

            return reply.send({
                success: true,
                message: 'Default recipient updated successfully'
            });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to update default recipient.' });
        }
    });
};