'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    // ... existing POST endpoint code ...

    fastify.delete('/', async (request, reply) => {
        const { customerId, addressId } = request.params;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        try {
            // First verify that the address belongs to the customer
            const address = await knex('deliveryAddresses')
                .where({
                    addressId,
                    customerId
                })
                .first();

            if (!address) {
                return reply.status(404).send({ error: 'Address not found or does not belong to the customer.' });
            }

            // Check if the address is a default address for any recipient
            const isDefaultAddress = await knex('recipientAddresses')
                .where({
                    addressId,
                    isDefault: true
                })
                .first();

            if (isDefaultAddress) {
                return reply.status(400).send({
                    error: 'Cannot delete a default address. Please set another address as default first.'
                });
            }

            // Start a transaction for atomicity
            await knex.transaction(async (trx) => {
                // First remove the address associations from recipientAddresses
                await trx('recipientAddresses')
                    .where({ addressId })
                    .delete();

                // Then remove the address itself
                await trx('deliveryAddresses')
                    .where({
                        addressId,
                        customerId
                    })
                    .delete();
            });

            return reply.send({
                success: true,
                message: 'Address deleted successfully'
            });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to delete address.' });
        }
    });
};