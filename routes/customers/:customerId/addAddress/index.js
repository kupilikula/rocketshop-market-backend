'use strict'

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid'); // Import the uuid library

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { customerId } = request.params;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        const { street1, street2, city, state, country, postalCode, isPrimary } = request.body;

        try {
            // If the new address is marked as primary, update existing addresses to no longer be primary
            if (isPrimary) {
                await knex('deliveryAddresses')
                    .where({ customerId, isDefault: true })
                    .update({ isDefault: false });
            }

            // Generate a UUID for the new address
            const addressId = uuidv4();

            // Insert the new address
            await knex('deliveryAddresses')
                .insert({
                    addressId, // Use the generated UUID
                    customerId,
                    street1,
                    street2,
                    city,
                    state,
                    country,
                    postalCode,
                    isDefault: isPrimary || false, // Set as default if isPrimary is true
                });

            return reply.send({ success: true, addressId });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to add address.' });
        }
    });
};