'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        try {
            const customerId = request.user.customerId; // Assuming authentication middleware attaches user info

            // Fetch the customer
            const customer = await knex('customers')
                .select('customerId', 'fullName')
                .where({ customerId })
                .first();

            if (!customer) {
                return reply.status(404).send({ error: 'Customer not found.' });
            }

            // Fetch all delivery addresses for the customer, including the default one
            const deliveryAddresses = await knex('deliveryAddresses')
                .select(
                    'addressId',
                    'street1',
                    'street2',
                    'city',
                    'state',
                    'country',
                    'postalCode',
                    'isDefault', // Indicates whether the address is default
                    'created_at',
                    'updated_at'
                )
                .where({ customerId })
                .orderBy('isDefault', 'desc') // Default address comes first
                .orderBy('created_at', 'asc');

            // Fetch all recipients for the customer
            const recipients = await knex('recipients')
                .join('deliveryAddresses', 'recipients.addressId', '=', 'deliveryAddresses.addressId')
                .select(
                    'recipients.recipientId',
                    'recipients.fullName',
                    'recipients.phone',
                    'recipients.isDefaultRecipient',
                    'recipients.addressId',
                    'deliveryAddresses.street1',
                    'deliveryAddresses.street2',
                    'deliveryAddresses.city',
                    'deliveryAddresses.state',
                    'deliveryAddresses.country',
                    'deliveryAddresses.postalCode',
                    'recipients.created_at',
                    'recipients.updated_at'
                )
                .where({ 'recipients.customerId': customerId })
                .orderBy('recipients.isDefaultRecipient', 'desc') // Default recipient comes first
                .orderBy('recipients.created_at', 'asc');

            // Extract the default address
            const defaultAddress = deliveryAddresses.find((address) => address.isDefault) || null;

            // Prepare the response data
            const responseData = {
                customerId: customer.customerId,
                customerName: customer.fullName,
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