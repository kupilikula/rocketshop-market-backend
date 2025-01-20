'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { customerId } = request.params;

    // Ensure the customerId in the request matches the logged-in user
    if (customerId !== request.user.customerId) {
      return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
    }

    const { street1, street2, city, state, country, postalCode, isPrimary } = request.body;

    try {
      // If the new address is marked as primary, update existing addresses to no longer be primary
      if (isPrimary) {
        await knex('deliveryAddresses')
            .where({ customerId, isDefault: true })
            .update({ isDefault: false });
      }

      // Insert the new address
      const [addressId] = await knex('deliveryAddresses')
          .insert({
            customerId,
            street1,
            street2,
            city,
            state,
            country,
            postalCode,
            isDefault: isPrimary || false, // Set as default if isPrimary is true
          })
          .returning('addressId');

      return reply.send({ success: true, addressId });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to add address.' });
    }
  });
};