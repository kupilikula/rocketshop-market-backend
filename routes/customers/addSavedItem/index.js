'use strict'
const { v4: uuidv4 } = require("uuid");
const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { productId } = request.body;
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
}