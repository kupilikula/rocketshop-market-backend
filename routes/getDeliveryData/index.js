'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        try {
            const customerId = request.user.customerId;

            // Fetch the customer
            const customer = await knex('customers')
                .select('customerId', 'fullName')
                .where({ customerId })
                .first();

            if (!customer) {
                return reply.status(404).send({ error: 'Customer not found.' });
            }

            // Fetch all recipients and their associated addresses
            // Using a subquery to handle SELF recipient data differently
            const recipients = await knex('recipients')
                .select(
                    'recipients.recipientId',
                    'recipients.type',
                    'recipients.isDefaultRecipient',
                    knex.raw(`
                        CASE 
                            WHEN recipients.type = 'SELF' THEN c."fullName" 
                            ELSE recipients."fullName" 
                        END as fullName
                    `),
                    knex.raw(`
                        CASE 
                            WHEN recipients.type = 'SELF' THEN c.phone 
                            ELSE recipients.phone 
                        END as phone
                    `),
                    knex.raw(
                        `COALESCE(json_agg(
                            CASE 
                                WHEN da."addressId" IS NOT NULL THEN
                                    json_build_object(
                                        'addressId', da."addressId",
                                        'street1', da.street1,
                                        'street2', da.street2,
                                        'city', da.city,
                                        'state', da.state,
                                        'country', da.country,
                                        'postalCode', da."postalCode",
                                        'isDefault', ra."isDefault"
                                    )
                                ELSE NULL 
                            END
                        ) FILTER (WHERE da."addressId" IS NOT NULL), '[]') as addresses`
                    )
                )
                .leftJoin('customers as c', 'recipients.customerId', 'c.customerId')
                .leftJoin('recipientAddresses as ra', 'recipients.recipientId', 'ra.recipientId')
                .leftJoin('deliveryAddresses as da', 'ra.addressId', 'da.addressId')
                .where({ 'recipients.customerId': customerId })
                .groupBy(
                    'recipients.recipientId',
                    'recipients.type',
                    'recipients.isDefaultRecipient',
                    'c.fullName',
                    'c.phone'
                )
                .orderBy('recipients.isDefaultRecipient', 'desc')
                .orderBy('recipients.created_at', 'asc');

            // Clean up the addresses array to remove any null values
            const cleanedRecipients = recipients.map(recipient => ({
                ...recipient,
                addresses: recipient.addresses.filter(addr => addr !== null)
            }));

            // Prepare the response data
            const responseData = {
                customerId: customer.customerId,
                customerName: customer.fullName,
                recipients: cleanedRecipients
            };

            return reply.send(responseData);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch delivery data.' });
        }
    });
};