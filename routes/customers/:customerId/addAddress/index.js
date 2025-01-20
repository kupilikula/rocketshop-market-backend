'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { customerId } = request.params;
    if (customerId !== request.user.customerId) {
      return reply.status(403).send({error: 'Customer Id mismatch! Forbidden'})
    }
    const { street1, street2, city, state, country, postalCode, isPrimary } = request.body;
    try {
      const [addressId] = await knex('deliveryAddresses').insert({
        customerId,
        street1,
        street2,
        city,
        state,
        country,
        postalCode,
      }).returning('addressId');

      if (isPrimary) {
        await knex('customers').where({ customerId }).update({ defaultAddressId: addressId });
      }

      return reply.send({ success: true, addressId });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to add address.' });
    }
  });
}
