'use strict';

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid'); // Import the uuid library

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { customerId } = request.params;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        const { street1, street2, city, state, country, postalCode, isPrimary, recipientId } = request.body;

        if (!recipientId) {
            return reply.status(400).send({ error: 'Recipient ID is required to add an address.' });
        }

        try {
            // Validate that the recipient belongs to the customer
            const recipient = await knex('recipients')
                .where({ recipientId, customerId })
                .first();

            if (!recipient) {
                return reply.status(404).send({ error: 'Recipient not found or does not belong to the customer.' });
            }

            // Start a transaction for atomicity
            const addressId = await knex.transaction(async (trx) => {
                // If the new address is marked as primary, update existing addresses for the recipient
                if (isPrimary) {
                    await trx('recipientAddresses')
                        .where({ recipientId })
                        .update({ isDefault: false });
                }

                // Generate a UUID for the new address
                const newAddressId = uuidv4();

                // Insert the new address
                await trx('deliveryAddresses').insert({
                    addressId: newAddressId,
                    customerId,
                    street1,
                    street2,
                    city,
                    state,
                    country,
                    postalCode,
                });

                // Associate the new address with the recipient in the `recipientAddresses` table
                await trx('recipientAddresses').insert({
                    recipientAddressId: uuidv4(),
                    recipientId,
                    addressId: newAddressId,
                    isDefault: isPrimary || false, // Set as default if `isPrimary` is true
                });

                return newAddressId;
            });

            return reply.send({ success: true, addressId });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to add address.' });
        }
    });
};