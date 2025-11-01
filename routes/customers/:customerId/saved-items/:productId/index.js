'use strict'
const { v4: uuidv4 } = require("uuid");
const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { productId } = request.params;
    const customerId = request.user.customerId; // Assuming JWT middleware attaches `user`
    console.log('addsaveditem request.user:', request.user);
    try {
      await knex('customer_saved_items').insert({
        id: uuidv4(),
        customerId,
        productId,
      });

      return reply.send({ success: true, message: 'Item saved successfully.' });
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return reply.status(400).send({ error: 'Item is already saved.' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to save item.' });
    }
  });

  fastify.get('/', async (request, reply) => {
    const { productId } = request.params; // Product ID from query parameters
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

  fastify.delete('/', async (request, reply) => {
    const { productId } = request.params;
    const customerId = request.user.customerId;

    try {
      const deletedRows = await knex('customer_saved_items')
          .where({ customerId, productId })
          .del();

      if (deletedRows === 0) {
        return reply.status(404).send({ error: 'Saved item not found.' });
      }

      return reply.send({ success: true, message: 'Item removed successfully.' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to remove item.' });
    }
  });
}