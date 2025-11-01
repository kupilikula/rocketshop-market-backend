'use strict';

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid');
const {isValidEmail, isValidE164Phone} = require("../../../utils/validateIdentifier");

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

    fastify.get('/', async (request, reply) => {
        const customerId = request.user.customerId;

        if (customerId !== request.params.customerId) {
            return reply.status(403).send({ error: 'Forbidden' });
        }

        try {
            const customer = await knex('customers')
                .where({customerId})
                .first()

            return reply.send(customer);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch customer.' });
        }
    });

    fastify.patch('/', async (request, reply) => {
        const { customerId } = request.params;
        const { fullName, email, phone, customerHandle } = request.body;

        try {
            // Authenticate the customer making the request
            const authenticatedCustomerId = request.user.customerId; // Assumes customer ID is extracted from the token
            if (authenticatedCustomerId !== customerId) {
                return reply.status(403).send({ error: 'Unauthorized to update this customer.' });
            }

            // Validate at least one field is provided
            if (!fullName && !email && !phone && !customerHandle) {
                return reply.status(400).send({ error: 'No valid fields provided for update.' });
            }

            if (email && !isValidEmail(email)) {
                return reply.status(400).send({ error: 'Invalid email address.' });
            }

            if (phone && !isValidE164Phone(phone)) {
                return reply.status(400).send({ error: 'Invalid phone number.' });
            }

            // If customerHandle is provided, check for uniqueness
            if (customerHandle) {
                const existingCustomer = await knex('customers')
                    .where({ customerHandle })
                    .andWhereNot({ customerId }) // Exclude the current customer
                    .first();

                if (existingCustomer) {
                    return reply.status(400).send({ error: 'Customer handle is already taken.' });
                }
            }

            // Construct the update object
            const updateFields = {};
            if (fullName) updateFields.fullName = fullName;
            if (email) updateFields.email = email;
            if (phone) updateFields.phone = phone;
            if (customerHandle) updateFields.customerHandle = customerHandle;

            // Update the customer record

            const [newCustomerData] = await knex('customers')
                .where({ customerId })
                .update(updateFields)
                .returning('*');

            return reply.status(200).send({customer: newCustomerData});
        } catch (error) {
            request.log.error(error);
            // Check for unique constraint violation
            if (error.code === '23505' && error.constraint === 'customers_email_unique') {
                return reply.status(400).send({
                    error: 'Email address is already in use by another customer.'
                });
            }
            if (error.code === '23505' && error.constraint === 'customers_phone_unique') {
                return reply.status(400).send({
                    error: 'Phone number is already in use by another customer.'
                });
            }

            return reply.status(500).send({ error: 'Failed to update customer information.' });
        }
    });
};