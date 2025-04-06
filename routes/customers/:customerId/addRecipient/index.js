'use strict';

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid'); // Import the uuid library

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { customerId } = request.params;

        // Validate customer ID
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        const { fullName, phone, address, isDefaultRecipient } = request.body;

        // Validate address fields
        const requiredAddressFields = ['street1', 'city', 'state', 'country', 'postalCode'];
        const missingFields = requiredAddressFields.filter((field) => !address?.[field]);
        if (missingFields.length > 0) {
            return reply.status(400).send({
                error: `Address is missing required fields: ${missingFields.join(', ')}`,
            });
        }

        try {
            // Start a transaction for atomicity
            const recipientId = await knex.transaction(async (trx) => {
                if (isDefaultRecipient) {
                    // Clear existing default recipient for the customer
                    await trx('recipients').where({ customerId }).update({ isDefaultRecipient: false });
                }

                const newAddressId = uuidv4();
                const newRecipientId = uuidv4();

                // Insert the new address
                await trx('deliveryAddresses').insert({
                    addressId: newAddressId,
                    customerId,
                    street1: address.street1,
                    street2: address.street2 || null,
                    city: address.city,
                    state: address.state,
                    country: address.country,
                    postalCode: address.postalCode,
                });

                // Insert the new recipient
                await trx('recipients').insert({
                    recipientId: newRecipientId,
                    customerId,
                    type: 'OTHER',
                    fullName,
                    phone,
                    isDefaultRecipient: isDefaultRecipient || false,
                });

                // Associate the recipient with the new address
                await trx('recipientAddresses').insert({
                    recipientAddressId: uuidv4(),
                    recipientId: newRecipientId,
                    addressId: newAddressId,
                    isDefault: true, // This new address is default for the new recipient
                });

                return newRecipientId;
            });

            return reply.send({ success: true, recipientId });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to add recipient.' });
        }
    });
};