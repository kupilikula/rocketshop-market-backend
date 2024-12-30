'use strict'

const knex = require("knex");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { collectionId } = request.params;

    try {
      const collection = await knex('collections').where('collectionId', collectionId).first();
      if (!collection) {
        return reply.status(404).send({ error: 'Collection not found.' });
      }

      const products = await knex('products')
          .join('productCollections', 'products.productId', 'productCollections.productId')
          .where('productCollections.collectionId', collectionId)
          .orderBy('productCollections.displayOrder', 'asc');

      return reply.send({ collection, products });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch collection data.' });
    }
  });
}
