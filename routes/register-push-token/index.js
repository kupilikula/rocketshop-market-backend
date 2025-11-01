// For customer app or merchant app — choose one version per app

const knex = require('@database/knexInstance');
const { v4: uuidv4 } = require('uuid');

module.exports = async function (fastify) {
    fastify.post("/", async (request, reply) => {
            const { expoPushToken, deviceInfo } = request.body;
            const {customerId} = request.user;
            // Detect app context (customer or merchant)

            if (!customerId) {
                return reply.code(401).send({ error: "Invalid user context" });
            }

            try {
                if (customerId) {
                    const existing = await knex("customerPushTokens")
                        .where({ customerId, expoPushToken })
                        .first();
                    if (existing) {
                        await knex("customerPushTokens")
                            .where({ pushTokenId: existing.pushTokenId })
                            .update({ updated_at: knex.fn.now(), deviceInfo });
                } else {
                        await knex("customerPushTokens").insert({
                            pushTokenId: uuidv4(),
                            customerId,
                            expoPushToken,
                            deviceInfo,
                        });
                    }
                }

                return reply.code(200).send({ success: true });
            } catch (err) {
                request.log.error(err);
                return reply.code(500).send({ error: "Failed to register push token" });
            }
        },
    );
};