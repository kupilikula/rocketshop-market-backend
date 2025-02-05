'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { productId } = request.params;
    try {
      // Fetch product with store details
      const product = await knex('products')
          .join('stores', 'products.storeId', 'stores.storeId')
          .where('products.productId', productId)
          .select(
              'products.*',
              'stores.storeName',
              'stores.storeLogoImage'
          )
          .first();

      if (!product) {
        return reply.status(404).send({ error: 'Product not found.' });
      }

      return reply.send(product);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch product details.' });
    }
  });
};