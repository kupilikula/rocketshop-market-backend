'use strict';

const crypto = require('crypto');
const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {

    // Generates a token for a logged-in customer
    fastify.post('/', async (request, reply) => {
        const { customerId } = request.user;
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minute expiry

        await knex('autoLoginTokens').insert({
            token,
            expiresAt,
            app: 'marketplace', // Hardcoded for this backend
            customerId: customerId,
        });

        return reply.send({ token });
    });
};