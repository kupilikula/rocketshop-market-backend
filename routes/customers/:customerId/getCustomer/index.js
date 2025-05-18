'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const customerId = request.user.customerId;

        if (customerId !== request.params.customerId) {
            return reply.status(403).send({ error: 'Forbidden' });
        }

        try {
            const customer = await knex('customers')
                .where({customerId})
                .first()

            return reply.send(customer);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch customer.' });
        }
    });
}