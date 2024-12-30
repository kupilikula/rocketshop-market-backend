'use strict'

const knex = require("knex");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { storeId } = request.params;

    try {
      const store = await knex('stores').where('storeId', storeId).first();
      if (!store) {
        return reply.status(404).send({ error: 'Store not found.' });
      }

      const collections = await knex('collections')
          .where({ storeId, storeFrontDisplay: true })
          .orderBy('displayOrder', 'asc');

      const storefront = await Promise.all(
          collections.map(async (collection) => {
            const products = await knex('products')
                .join('productCollections', 'products.productId', 'productCollections.productId')
                .where('productCollections.collectionId', collection.collectionId)
                .orderBy('productCollections.displayOrder', 'asc')
                .limit(collection.storeFrontDisplayNumberOfItems);

            return { collection, products };
          })
      );

      return reply.send({ store, storefront });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch storefront data.' });
    }
  });
}
