'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        let i = request.body.customerIndex || 0;
        let customer = await knex('customers')
            .offset(i)
            .first(); // Get a single row directly

        if (!customer) {
            throw new Error('No row found at the specified index');
        }

        reply.status(200).send(customer);
    });
}
