'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const customerId = request.user.customerId;

    try {
      const savedItems = await knex('customer_saved_items')
          .join('products', 'customer_saved_items.productId', '=', 'products.productId')
          .where('customer_saved_items.customerId', customerId)
          .select('products.*', 'customer_saved_items.saved_at');

      return reply.send(savedItems);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch saved items.' });
    }
  });
}