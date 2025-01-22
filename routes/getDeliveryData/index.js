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

            // Fetch all recipients and their associated addresses
            const recipients = await knex('recipients')
                .select(
                    'recipients.recipientId',
                    'recipients.fullName',
                    'recipients.phone',
                    'recipients.isDefaultRecipient',
                    knex.raw(
                        `json_agg(json_build_object(
                            'addressId', da."addressId",
                            'street1', da.street1,
                            'street2', da.street2,
                            'city', da.city,
                            'state', da.state,
                            'country', da.country,
                            'postalCode', da."postalCode",
                            'isDefault', ra."isDefault"
                        )) as addresses`
                    )
                )
                .leftJoin('recipientAddresses as ra', 'recipients.recipientId', 'ra.recipientId')
                .leftJoin('deliveryAddresses as da', 'ra.addressId', 'da.addressId')
                .where({ 'recipients.customerId': customerId })
                .groupBy('recipients.recipientId')
                .orderBy('recipients.isDefaultRecipient', 'desc') // Default recipient comes first
                .orderBy('recipients.created_at', 'asc');

            // Prepare the response data
            const responseData = {
                customerId: customer.customerId,
                customerName: customer.fullName,
                recipients, // Recipients with their associated addresses
            };

            return reply.send(responseData);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch delivery data.' });
        }
    });
};