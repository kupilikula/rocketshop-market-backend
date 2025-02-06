'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { storeId, offerCode } = request.body;

        if (!storeId || !offerCode) {
            return reply.status(400).send({ valid: false, error: "Missing storeId or offerCode." });
        }

        try {
            // Fetch the offer that matches the store and code
            const offer = await knex("offers")
                .where({ storeId, offerCode, isActive: true, requireCode: true })
                .andWhereRaw(`("validityDateRange"->>'validFrom')::timestamptz <= ?`, [new Date().toISOString()])
                .andWhereRaw(`("validityDateRange"->>'validUntil')::timestamptz > ?`, [new Date().toISOString()])
                .first();

            if (!offer) {
                return reply.status(404).send({ valid: false, error: "Invalid or expired offer code." });
            }

            return reply.send({ valid: true});

        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ valid: false, error: "Error checking offer code." });
        }
    });
};