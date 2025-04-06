'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { customerId } = request.params;
        const { recipientId, addressId } = request.body;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        if (!recipientId || !addressId) {
            return reply.status(400).send({ error: 'Both recipientId and addressId are required.' });
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

            // Verify that the address belongs to the customer
            const address = await knex('deliveryAddresses')
                .where({
                    addressId,
                    customerId
                })
                .first();

            if (!address) {
                return reply.status(404).send({ error: 'Address not found or does not belong to the customer.' });
            }

            // Verify that the address is associated with the recipient
            const addressAssociation = await knex('recipientAddresses')
                .where({
                    recipientId,
                    addressId
                })
                .first();

            if (!addressAssociation) {
                return reply.status(400).send({ error: 'This address is not associated with the specified recipient.' });
            }

            // Start a transaction to update the default address
            await knex.transaction(async (trx) => {
                // First, set all addresses for this recipient to non-default
                await trx('recipientAddresses')
                    .where({ recipientId })
                    .update({ isDefault: false });

                // Then set the specified address as default
                await trx('recipientAddresses')
                    .where({
                        recipientId,
                        addressId
                    })
                    .update({ isDefault: true });
            });

            return reply.send({
                success: true,
                message: 'Default address updated successfully'
            });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to update default address.' });
        }
    });
};