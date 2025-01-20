'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { customerId } = request.params;
    if (customerId !== request.user.customerId) {
      return reply.status(403).send({error: 'Customer Id mismatch! Forbidden'})
    }
    try {
      const addresses = await knex('deliveryAddresses').where({ customerId });
      const recipients = await knex('recipients')
          .where({ customerId })
          .join('deliveryAddresses', 'recipients.addressId', 'deliveryAddresses.addressId')
          .select('recipients.*', 'deliveryAddresses.*');
      return reply.send({ addresses, recipients });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch addresses and recipients.' });
    }
  });
}
