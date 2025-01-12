'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { storeId } = request.params;

    try {
      // Fetch store details, ensuring the store is active
      const store = await knex('stores')
          .where({ storeId, isActive: true })
          .first();

      if (!store) {
        return reply.status(404).send({ error: 'Store not found or inactive.' });
      }

      // Fetch active collections for the store
      const collections = await knex('collections')
          .where({ storeId, isActive: true, storeFrontDisplay: true })
          .orderBy('displayOrder', 'asc');

      for (const collection of collections) {
        // Fetch active products for each collection
        const products = await knex('products')
            .where({ storeId, isActive: true })
            .andWhereRaw('? = ANY(collectionIds)', [collection.collectionId]) // Match collectionId in collectionIds array
            .orderBy('displayOrder', 'asc')
            .limit(collection.storeFrontDisplayNumberOfItems);

        // Parse mediaItems from JSON
        products.forEach(product => {
          product.mediaItems = JSON.parse(product.mediaItems || '[]');
        });

        collection.products = products;
      }

      return reply.send({ ...store, collections });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch store front data.' });
    }
  });
}
