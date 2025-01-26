const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { chatId } = request.params;
        const { messageIds } = request.body; // Array of message IDs
        console.log('req.user:', request.user);
        // Mark the messages as read
        await knex('messages')
            .whereIn('messageId', messageIds)
            .andWhere('chatId', chatId)
            .update({ read_at: new Date() });

        reply.send({ success: true });
    });
};