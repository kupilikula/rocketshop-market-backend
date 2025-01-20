'use strict';
const { v4: uuidv4 } = require('uuid');
const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        try {
            const customerId = request.user.customerId; // Assuming authentication middleware attaches user info

            // Fetch the customer
            const customer = await knex('customers')
                .select('customerId', 'fullName', 'defaultAddressId')
                .where({ customerId })
                .first();

            if (!customer) {
                return reply.status(404).send({ error: 'Customer not found.' });
            }

            // Fetch default address if exists
            const defaultAddress = customer.defaultAddressId
                ? await knex('deliveryAddresses')
                    .where({ addressId: customer.defaultAddressId })
                    .first()
                : null;

            // Fetch all saved delivery addresses
            const deliveryAddresses = await knex('deliveryAddresses')
                .where({ customerId })
                .orderBy('created_at', 'asc');

            // Fetch all saved recipients
            const recipients = await knex('recipients')
                .where({ customerId })
                .orderBy('created_at', 'asc');

            // Prepare the response data
            const responseData = {
                defaultAddress,
                deliveryAddresses,
                recipients,
            };

            return reply.send(responseData);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch delivery data.' });
        }
    });
};