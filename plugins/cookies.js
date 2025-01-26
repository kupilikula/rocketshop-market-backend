const fastifyCookie = require('@fastify/cookie');

module.exports = async function (fastify, opts) {
    // Register cookie plugin
    fastify.register(fastifyCookie, {
        parseOptions: {}, // Options for cookie parsing
    });
};