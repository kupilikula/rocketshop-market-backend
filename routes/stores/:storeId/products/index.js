'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { storeId } = request.params;

    try {
      // Fetch products belonging to the specific store that are both:
      // 1. Active themselves
      // 2. Belong to at least one active collection
      const products = await knex('products as p')
          .select('p.*')
          .where('p.storeId', storeId)
          .andWhere('p.isActive', true)
          .orderBy('p.created_at', 'desc');

      if (!products || products.length === 0) {
        return reply.status(404).send({
          error: 'No active products found in this store.'
        });
      }

      return reply.send(products);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch products for the store.'
      });
    }
  });
}