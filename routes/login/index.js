'use strict'

const knex = require("@database/knexInstance");
const {generateJWT} = require("../../utils/jwt");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {

        const {phone, otp, customerIndex} = request.body;

        // Validate user credentials here (e.g., check in database)
        const isValid = true; // Replace with actual validation logic

        if (!isValid) {
            return reply.status(401).send({ error: 'Invalid credentials' });
        }

        let i = customerIndex || 0;
        let customer = await knex('customers')
            .offset(i)
            .first(); // Get a single row directly

        if (!customer) {
            throw new Error('No row found at the specified index');
        }

        // Create payload (e.g., customerId or merchantId)
        const payload = { customerId: customer.customerId };

        // Generate JWT
        const token = generateJWT(payload);

        reply.status(200).send({token, customer});
    });
}
