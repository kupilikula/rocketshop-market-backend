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

        const { fullName, phone, addressIds = [], isDefaultRecipient } = request.body;

        if (!addressIds.length) {
            return reply.status(400).send({ error: 'At least one address must be assigned to the recipient.' });
        }

        try {
            // Start a transaction for atomicity
            const recipientId = await knex.transaction(async (trx) => {
                if (isDefaultRecipient) {
                    // Clear existing default recipient for the customer
                    await trx('recipients').where({ customerId }).update({ isDefaultRecipient: false });
                }

                const newRecipientId = uuidv4();

                // Insert the new recipient
                await trx('recipients').insert({
                    recipientId: newRecipientId,
                    customerId,
                    fullName,
                    phone,
                    isDefaultRecipient: isDefaultRecipient || false,
                });

                // Insert into `recipientAddresses` for the associated addresses
                const recipientAddresses = addressIds.map((addressId, index) => ({
                    recipientAddressId: uuidv4(),
                    recipientId: newRecipientId,
                    addressId,
                    isDefault: index === 0, // Mark the first address in the list as default for the recipient
                }));
                await trx('recipientAddresses').insert(recipientAddresses);

                return newRecipientId;
            });

            return reply.send({ success: true, recipientId });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to add recipient.' });
        }
    });
};