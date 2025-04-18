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

      // Get total number of active collections (regardless of storeFrontDisplay)
      const [{ count: totalNumberOfCollections }] = await knex('collections')
          .where({ storeId, isActive: true })
          .count('collectionId as count');


      // Fetch active collections for the store
      const collections = await knex('collections')
          .where({ storeId, isActive: true, storeFrontDisplay: true })
          .orderBy('displayOrder', 'asc');

      for (const collection of collections) {
        // Get the total count of active products in the collection
        const [{ count: totalProducts }] = await knex('productCollections')
            .join('products', 'productCollections.productId', 'products.productId')
            .where('productCollections.collectionId', collection.collectionId)
            .andWhere('products.isActive', true)
            .count('products.productId as count');

        // Fetch limited active products for each collection using productCollections table
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

        // Add both the products array and the total count to the collection
        collection.displayProducts = productData;
        collection.totalNumberOfProducts = parseInt(totalProducts);
      }

      return reply.send({ ...store, displayCollections: collections, totalNumberOfCollections: parseInt(totalNumberOfCollections) });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch store front data.' });
    }
  });
}