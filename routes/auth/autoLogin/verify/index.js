'use strict';

const knex = require('@database/knexInstance');
const TokenService = require('../../../../services/TokenService'); // Your Customer TokenService

module.exports = async function (fastify, opts) {
    // Verifies a token and logs in a customer
    fastify.post('/', async (request, reply) => {
        const { token } = request.body;
        if (!token) return reply.status(400).send({ error: 'Token is required.' });

        const tokenRecord = await knex('autoLoginTokens').where({ token }).first();

        // Security checks
        if (!tokenRecord || tokenRecord.isUsed || new Date(tokenRecord.expiresAt) < new Date()) {
            return reply.status(401).send({ error: 'Invalid or expired login link.' });
        }

        // CRITICAL: Ensure this token was generated for the marketplace app
        if (tokenRecord.app !== 'marketplace' || !tokenRecord.customerId) {
            return reply.status(403).send({ error: 'This login link is not valid for this application.' });
        }

        await knex('autoLoginTokens').where({ id: tokenRecord.id }).update({ isUsed: true });

        const customer = await knex('customers').where({ customerId: tokenRecord.customerId }).first();
        if (!customer) return reply.status(404).send({ error: 'Associated customer account not found.' });

        // Get saved cartData (if any)
        const cartRow = await knex('customer_carts')
            .where({ customerId: customer.customerId })
            .orderBy('updated_at', 'desc')
            .first();

        const cartData = cartRow?.cartData || null;
        console.log('cartData:', cartData);

        // Use a specific token service for customers to generate their session
        await TokenService.replyWithAuthTokens(reply, customer, { cartData });
    });
};