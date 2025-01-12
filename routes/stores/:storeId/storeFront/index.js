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
        // Fetch active products for each collection using productCollections table
        const productData = await knex('productCollections')
            .join('products', 'productCollections.productId', 'products.productId')
            .select(
                'products.*',
                'productCollections.displayOrder'
            )
            .where('productCollections.collectionId', collection.collectionId)
            .andWhere('products.isActive', true)
            .orderBy('productCollections.displayOrder', 'asc')
            .limit(collection.storeFrontDisplayNumberOfItems);

        collection.products = productData;
      }

      return reply.send({ ...store, collections });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch store front data.' });
    }
  });
}