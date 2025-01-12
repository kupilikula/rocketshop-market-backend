'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { storeId } = request.params;

    try {
      // Fetch products belonging to the specific store
      const products = await knex('products')
          .where('storeId', storeId)
          .andWhere('isActive', true) // Optionally filter for active products
          .orderBy('created_at', 'desc'); // Order by creation time (most recent first)

      if (!products || products.length === 0) {
        return reply.status(404).send({ error: 'No products found for this store.' });
      }

      return reply.send(products);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch products for the store.' });
    }
  });
}
