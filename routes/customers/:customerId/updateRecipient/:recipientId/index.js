'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.patch('/', async (request, reply) => {
        const { customerId, recipientId } = request.params;
        const { fullName, phone } = request.body;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        if (!recipientId) {
            return reply.status(400).send({ error: 'RecipientId is required.' });
        }

        try {
            // Verify that the recipient exists and belongs to the customer
            const recipient = await knex('recipients')
                .where({
                    recipientId,
                    customerId
                })
                .first();

            if (!recipient) {
                return reply.status(404).send({ error: 'Recipient not found or does not belong to the customer.' });
            }

            // Create an update object with only the provided fields
            const updateFields = {};
            if (fullName !== undefined) updateFields.fullName = fullName;
            if (phone !== undefined) updateFields.phone = phone;

            // If no fields to update were provided
            if (Object.keys(updateFields).length === 0) {
                return reply.status(400).send({ error: 'No fields provided for update.' });
            }

            if (recipient.type === 'SELF') {
                // For SELF recipients, update the customers table
                // Check if phone number is unique (excluding current customer)
                if (phone) {
                    const existingCustomerWithPhone = await knex('customers')
                        .where('phone', phone)
                        .whereNot('customerId', customerId)
                        .first();

                    if (existingCustomerWithPhone) {
                        return reply.status(409).send({
                            error: 'Phone number already registered to another customer.'
                        });
                    }
                }

                await knex('customers')
                    .where({ customerId })
                    .update(updateFields);

                const updatedCustomer = await knex('customers')
                    .where({ customerId })
                    .first();

                // Return customer data for SELF recipient
                return reply.send({
                    success: true,
                    message: 'Customer updated successfully',
                    recipient: {
                        ...recipient,
                        fullName: updatedCustomer.fullName,
                        phone: updatedCustomer.phone
                    }
                });
            } else {
                // For non-SELF recipients, update the recipients table as before
                await knex('recipients')
                    .where({
                        recipientId,
                        customerId
                    })
                    .update(updateFields);

                const updatedRecipient = await knex('recipients')
                    .where({
                        recipientId,
                        customerId
                    })
                    .first();

                return reply.send({
                    success: true,
                    message: 'Recipient updated successfully',
                    recipient: updatedRecipient
                });
            }
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to update recipient.' });
        }
    });
};