'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.delete('/', async (request, reply) => {
        const { customerId, recipientId } = request.params;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        try {
            // First verify that the recipient exists and belongs to the customer
            const recipient = await knex('recipients')
                .where({
                    recipientId,
                    customerId
                })
                .first();

            if (!recipient) {
                return reply.status(404).send({ error: 'Recipient not found or does not belong to the customer.' });
            }

            // Cannot delete SELF recipient
            if (recipient.type==='SELF') {
                return reply.status(400).send({
                    error: 'Cannot delete the customer as recipient.'
                });
            }

            // Check if the recipient is the default recipient
            if (recipient.isDefaultRecipient) {
                return reply.status(400).send({
                    error: 'Cannot delete the default recipient. Please set another recipient as default first.'
                });
            }

            // Start a transaction for atomicity
            await knex.transaction(async (trx) => {
                // First remove all address associations for this recipient
                await trx('recipientAddresses')
                    .where({ recipientId })
                    .delete();

                // Then remove the recipient
                await trx('recipients')
                    .where({
                        recipientId,
                        customerId
                    })
                    .delete();
            });

            return reply.send({
                success: true,
                message: 'Recipient deleted successfully'
            });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to delete recipient.' });
        }
    });
};