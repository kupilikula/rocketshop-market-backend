const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post("/", async (request, reply) => {
        const { chatId } = request.params;
        const { messageIds } = request.body; // Array of message IDs

        const userId = request.user.customerId;
        const userType = "Customer";

        try {
            console.log("req.user:", request.user);

            // Insert new read records into the message_reads table
            const readRecords = messageIds.map((messageId) => ({
                messageId,
                readerId: userId,
                readerType: userType,
                read_at: new Date(),
            }));

            // Use an `insert ... on conflict` query to avoid duplicate entries
            await knex("message_reads")
                .insert(readRecords)
                .onConflict(["messageId", "readerId", "readerType"]) // Ensure uniqueness for readerId, readerType, and messageId
                .merge({ read_at: new Date() }); // Update the `read_at` timestamp for existing entries

            reply.send({ success: true });
        } catch (error) {
            console.error("Error marking messages as read:", error);
            reply.status(500).send({ error: "Failed to mark messages as read." });
        }
    });
};