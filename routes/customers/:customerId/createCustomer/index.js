'use strict';

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid');

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { customerHandle, fullName, phone, email } = request.body;

        // Basic validation
        if (!customerHandle || !fullName || !phone) {
            return reply.status(400).send({
                error: 'Customer handle, full name, and phone are required.'
            });
        }

        try {
            // Check if customer handle or phone already exists
            const existingCustomer = await knex('customers')
                .where({ customerHandle })
                .orWhere({ phone })
                .first();

            if (existingCustomer) {
                if (existingCustomer.customerHandle === customerHandle) {
                    return reply.status(409).send({
                        error: 'Customer handle already exists.'
                    });
                }
                if (existingCustomer.phone === phone) {
                    return reply.status(409).send({
                        error: 'Phone number already registered to another customer.'
                    });
                }
            }

            // Create customer and self-recipient in a transaction
            const customerId = await knex.transaction(async (trx) => {
                const newCustomerId = uuidv4();

                // Create customer
                await trx('customers').insert({
                    customerId: newCustomerId,
                    customerHandle,
                    fullName,
                    email,
                    phone
                });

                // Create SELF recipient
                await trx('recipients').insert({
                    recipientId: uuidv4(),
                    customerId: newCustomerId,
                    fullName: null,
                    phone: null,
                    type: 'SELF',
                    isDefaultRecipient: true
                });

                // Insert customer notification preferences (defaults)
                await trx('customerNotificationPreferences').insert({
                    customerId: newCustomerId,
                    orderStatus: true,
                    orderDelivery: true,
                    chatMessages: true,
                    miscellaneous: true,
                    muteAll: false,
                });


                return newCustomerId;
            });

            return reply.status(201).send({
                success: true,
                customerId
            });

        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: 'Failed to create customer.'
            });
        }
    });
};