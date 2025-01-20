'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { customerId } = request.params;

    // Validate customer ID
    if (customerId !== request.user.customerId) {
      return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
    }

    const { fullName, phone, addressId, isDefaultRecipient } = request.body;

    try {
      // Start a transaction for atomicity
      const recipientId = await knex.transaction(async (trx) => {
        if (isDefaultRecipient) {
          // Clear existing default recipient for the customer
          await trx('recipients').where({ customerId }).update({ isDefaultRecipient: false });
        }

        // Insert the new recipient
        const [newRecipientId] = await trx('recipients')
            .insert({
              customerId,
              fullName,
              phone, // Add phone field for the recipient
              addressId,
              isDefaultRecipient: isDefaultRecipient || false,
            })
            .returning('recipientId');

        return newRecipientId;
      });

      return reply.send({ success: true, recipientId });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to add recipient.' });
    }
  });
};