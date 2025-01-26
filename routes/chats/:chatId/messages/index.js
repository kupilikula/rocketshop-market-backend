const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { chatId } = request.params;
        // Fetch messages from the database
        const messages = await knex('messages')
            .where({ chatId })
            .orderBy('created_at', 'asc');

        return reply.send(messages);
    });
};
