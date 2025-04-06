'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.patch('/', async (request, reply) => {
        const { customerId } = request.params;
        const {
            addressId,
            street1,
            street2,
            city,
            state,
            country,
            postalCode
        } = request.body;

        // Ensure the customerId in the request matches the logged-in user
        if (customerId !== request.user.customerId) {
            return reply.status(403).send({ error: 'Customer Id mismatch! Forbidden' });
        }

        if (!addressId) {
            return reply.status(400).send({ error: 'AddressId is required.' });
        }

        try {
            // Verify that the address exists and belongs to the customer
            const address = await knex('deliveryAddresses')
                .where({
                    addressId,
                    customerId
                })
                .first();

            if (!address) {
                return reply.status(404).send({ error: 'Address not found or does not belong to the customer.' });
            }

            // Create an update object with only the provided fields
            const updateFields = {};
            if (street1 !== undefined) updateFields.street1 = street1;
            if (street2 !== undefined) updateFields.street2 = street2;
            if (city !== undefined) updateFields.city = city;
            if (state !== undefined) updateFields.state = state;
            if (country !== undefined) updateFields.country = country;
            if (postalCode !== undefined) updateFields.postalCode = postalCode;

            // If no fields to update were provided
            if (Object.keys(updateFields).length === 0) {
                return reply.status(400).send({ error: 'No fields provided for update.' });
            }

            // Update the address
            await knex('deliveryAddresses')
                .where({
                    addressId,
                    customerId
                })
                .update(updateFields);

            // Fetch the updated address
            const updatedAddress = await knex('deliveryAddresses')
                .where({
                    addressId,
                    customerId
                })
                .first();

            return reply.send({
                success: true,
                message: 'Address updated successfully',
                address: updatedAddress
            });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to update address.' });
        }
    });
};