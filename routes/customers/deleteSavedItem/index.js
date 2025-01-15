'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { productId } = request.body;
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