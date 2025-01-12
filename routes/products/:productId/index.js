'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { productId } = request.params;
    try {
      const product = await knex('products').where('productId', productId).first();
      if (!product) {
        return reply.status(404).send({ error: 'Product not found.' });
      }

      return reply.send({ product });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch product details.' });
    }
  });
}
