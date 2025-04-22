const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get("/", async (request, reply) => {
        const { chatId } = request.params;

        const customerId = request.user.customerId;

        if (!customerId) {
            return reply.status(401).send({ error: "Unauthorized: Only customers can access this endpoint." });
        }

        try {
            const messages = await knex("messages as m")
                .leftJoin("message_reads as r", function () {
                    this.on("m.messageId", "=", "r.messageId")
                        .andOn("r.readerId", "=", knex.raw("?", [customerId]))
                        .andOn("r.readerType", "=", knex.raw("?", ["Customer"]));
                })
                .select(
                    "m.messageId",
                    "m.chatId",
                    "m.senderId",
                    "m.senderType",
                    "m.message",
                    "m.created_at",
                    "m.updated_at",
                    "r.read_at"
                )
                .where("m.chatId", chatId)
                .orderBy("m.created_at", "asc");

            return reply.send(messages);
        } catch (error) {
            console.error("Error fetching customer chat messages:", error);
            return reply.status(500).send({ error: "Failed to fetch chat messages." });
        }
    });
};