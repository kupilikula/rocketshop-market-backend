'use strict';

const knex = require("@database/knexInstance");
const { getApplicableOffersForProduct } = require("../../../utils/getApplicableOffersForProduct");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { productId } = request.params;

    try {
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

      const applicableOffers = await getApplicableOffersForProduct(product.productId, product.storeId);

      return reply.send({ ...product, applicableOffers });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch product details.' });
    }
  });
};
