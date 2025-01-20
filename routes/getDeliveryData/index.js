'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        try {
            const customerId = request.user.customerId; // Assuming authentication middleware attaches user info

            // Fetch the customer, including the default address details
            const customer = await knex('customers')
                .select('customerId', 'fullName', 'defaultAddressId')
                .where({ customerId })
                .first();

            if (!customer) {
                return reply.status(404).send({ error: 'Customer not found.' });
            }

            // Fetch all saved delivery addresses for the customer
            const deliveryAddresses = await knex('deliveryAddresses')
                .select(
                    'addressId',
                    'street1',
                    'street2',
                    'city',
                    'state',
                    'country',
                    'postalCode',
                    'created_at',
                    'updated_at'
                )
                .where({ customerId })
                .orderBy('created_at', 'asc');

            // Fetch all saved recipients for the customer
            const recipients = await knex('recipients')
                .join('deliveryAddresses', 'recipients.addressId', '=', 'deliveryAddresses.addressId')
                .select(
                    'recipients.recipientId',
                    'recipients.fullName',
                    'recipients.phone',
                    'recipients.isDefaultRecipient',
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
                .orderBy('recipients.created_at', 'asc');

            // Fetch the default address if exists
            const defaultAddress = customer.defaultAddressId
                ? deliveryAddresses.find((address) => address.addressId === customer.defaultAddressId)
                : null;

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