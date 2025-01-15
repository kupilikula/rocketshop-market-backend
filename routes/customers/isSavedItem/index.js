'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { productId } = request.query; // Product ID from query parameters
    const customerId = request.user.customerId; // Customer ID from the authenticated user

    if (!productId || !customerId) {
      return reply.status(400).send({ error: "Missing required parameters: productId or customerId" });
    }

    try {
      // Query to check if the product is saved by the customer
      const savedItem = await knex('customer_saved_items')
          .where({ customerId, productId })
          .first();

      const isSavedItem = !!savedItem;

      return reply.send({ isSavedItem });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: "Failed to check if item is saved." });
    }
  });
}