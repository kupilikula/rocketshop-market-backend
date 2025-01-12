'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.patch('/', async (request, reply) => {
    const { customerId } = request.params;
    const { fullName, email, phoneNumber, address } = request.body;

    try {
      // Authenticate the customer making the request
      const authenticatedCustomerId = request.user.customerId; // Assumes customer ID is extracted from the token
      if (authenticatedCustomerId !== customerId) {
        return reply.status(403).send({ error: 'Unauthorized to update this customer.' });
      }

      // Validate at least one field is provided
      if (!fullName && !email && !phoneNumber && !address) {
        return reply.status(400).send({ error: 'No valid fields provided for update.' });
      }

      // Construct the update object
      const updateFields = {};
      if (fullName) updateFields.fullName = fullName;
      if (email) updateFields.email = email;
      if (phoneNumber) updateFields.phoneNumber = phoneNumber;
      if (address) updateFields.address = address;

      // Update the customer record
      await knex('customers')
          .where({ customerId })
          .update(updateFields);

      return reply.send({ message: 'Customer information updated successfully.' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to update customer information.' });
    }
  });
}
