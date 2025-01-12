'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { collectionId } = request.params;

    try {
      // Fetch collection details, ensuring the collection is active
      const collection = await knex('collections')
          .where({ collectionId, isActive: true })
          .first();

      if (!collection) {
        return reply.status(404).send({ error: 'Collection not found or inactive.' });
      }

      // Fetch active products within the collection
      const products = await knex('products')
          .where({ isActive: true })
          .andWhereRaw('? = ANY(collectionIds)', [collectionId]) // Match collectionId in collectionIds array
          .orderBy('displayOrder', 'asc');

      products.forEach(product => {
        product.mediaItems = JSON.parse(product.mediaItems || '[]');
      });

      return reply.send({ ...collection, products });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch products for the collection.' });
    }
  });
}
