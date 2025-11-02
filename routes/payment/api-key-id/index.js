'use strict'

module.exports = async function (fastify, opts) {
    fastify.get('/', async function (request, reply) {
        const keyId = process.env.RAZORPAY_KEY_ID; // Use your exact env variable name

        if (!keyId) {
            fastify.log.error("RAZORPAY_KEY_ID environment variable is not set.");
            // Don't send detailed errors to client about server config
            reply.status(500).send({ error: 'Configuration error' });
            return;
        }

        // Return as JSON object
        // NOTE: Ensure this returns the TEST key ID for testing environments
        // and the LIVE key ID for production environments.
        // You might need logic here based on process.env.NODE_ENV
        return reply.status(200).send({ apiKeyId: keyId });

    });
}
