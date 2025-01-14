'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { storeId } = request.body;
    const customerId = request.user.customerId;

    try {
      // Check if the store exists
      const store = await knex('stores').where({ storeId }).first();
      if (!store) {
        return reply.status(404).send({ error: 'Store not found.' });
      }

      // Check if the customer is following the store
      const existingFollow = await knex('customer_followed_stores')
          .where({ customerId, storeId })
          .first();

      if (!existingFollow) {
        return reply.status(400).send({ error: 'You are not following this store.' });
      }

      // Remove the follow
      await knex('customer_followed_stores')
          .where({ customerId, storeId })
          .del();

      // Decrement the followerCount in the stores table
      await knex('stores')
          .where({ storeId })
          .decrement('followerCount', 1);

      return reply.status(200).send({ message: 'Unfollowed the store successfully.' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to unfollow the store.' });
    }
  });
}
