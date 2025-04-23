'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { collectionId } = request.params;

    try {
      // Fetch collection details, ensuring the collection is active
      const collection = await knex('collections')
          .select('*')
          .where({ collectionId, isActive: true })
          .first();

      if (!collection) {
        return reply.status(404).send({ error: 'Collection not found or inactive.' });
      }

      // Get store info (once)
      const store = await knex('stores')
          .select('storeId', 'storeName', 'storeLogoImage')
          .where({ storeId: collection.storeId, isActive: true })
          .first();

      if (!store) {
        return reply.status(404).send({ error: 'Store not found or inactive.' });
      }

      // Fetch active products within the collection using productCollections table
      const products = await knex('productCollections')
          .join('products', 'productCollections.productId', 'products.productId')
          .select(
              'products.*',
              'productCollections.displayOrder'
          )
          .where({ 'productCollections.collectionId': collectionId })
          .andWhere('products.isActive', true)
          .orderBy('productCollections.displayOrder', 'asc');

      return reply.send({ ...collection, products, store });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch products for the collection.' });
    }
  });
}