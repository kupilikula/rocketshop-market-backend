'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { customerId } = request.params;
    if (customerId !== request.user.customerId) {
      return reply.status(403).send({error: 'Customer Id mismatch! Forbidden'})
    }
    const { fullName, addressId, isDefaultRecipient } = request.body;
    try {
      const [recipientId] = await knex('recipients').insert({
        customerId,
        fullName,
        addressId,
        isDefaultRecipient,
      }).returning('recipientId');

      if (isDefaultRecipient) {
        await knex.transaction(async (trx) => {
          // Clear existing default recipient
          await trx('recipients').where({ customerId }).update({ isDefaultRecipient: false });

          // Set the new default recipient
          await trx('recipients').where({ recipientId }).update({ isDefaultRecipient: true });
        });
      }
      return reply.send({ success: true, recipientId });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to add recipient.' });
    }
  });
}
