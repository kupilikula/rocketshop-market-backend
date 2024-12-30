'use strict'

const knex = require("knex");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { productId } = request.params;

    try {
      const product = await knex('products').where('productId', productId).first();
      if (!product) {
        return reply.status(404).send({ error: 'Product not found.' });
      }

      const mediaItems = await knex('mediaItems')
          .whereIn('mediaId', product.mediaItemIds || []);

      return reply.send({ product, mediaItems });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch product details.' });
    }
  });
}
