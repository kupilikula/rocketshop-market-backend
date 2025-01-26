const fp = require('fastify-plugin')
const fastifyCookie = require('@fastify/cookie');

module.exports = fp(async function (fastify, opts) {
    // Register cookie plugin
    fastify.register(fastifyCookie, {
        parseOptions: {}, // Options for cookie parsing
    });
});