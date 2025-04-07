'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { storeId } = request.params;
    const customerId = request.user.customerId; // Assuming customerId is attached to request.user

    try {
      // Query the customer_followed_stores table to check if the customer follows the store
      const result = await knex('customer_followed_stores')
          .where({ customerId, storeId })
          .first();

      // Return true if the record exists, otherwise false
      return reply.send({ isFollowing: !!result });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to check follow status.' });
    }
  });
}
