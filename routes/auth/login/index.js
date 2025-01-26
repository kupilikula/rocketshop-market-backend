'use strict'

const knex = require("@database/knexInstance");
const {storeRefreshToken, generateAccessToken, generateRefreshToken} = require("../../../services/TokenService");
const {decode} = require("jsonwebtoken");

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
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken({ userId: customer.customerId });
        // Decode new refresh token to get expiresAt
        const decodedRefreshToken = decode(refreshToken);
        const expiresAt = new Date(decodedRefreshToken.exp * 1000); // Convert `exp` to milliseconds

        // Store refresh token in database (or in-memory store)
        await storeRefreshToken(customer.customerId, refreshToken, expiresAt); // Example: Save to DB

        // Return tokens (access token in response, refresh token in HTTP-only cookie)
        reply.status(200)
            .setCookie('refreshToken', refreshToken, {
                httpOnly: true, // Prevent client-side access
                secure: true, // Use HTTPS in production
                path: '/auth', // Restrict usage
                sameSite: 'Strict', // Prevent CSRF attacks
            })
            .send({ accessToken, customer });

    });
}
