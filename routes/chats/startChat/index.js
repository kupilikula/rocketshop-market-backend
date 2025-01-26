const knex = require('@database/knexInstance');
const { v4: uuidv4 } = require("uuid");

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        try {
            const { customerId } = request.user; // Extract customerId from the authenticated user
            const { storeId } = request.body; // Extract storeId from the request body

            // Check if the store exists
            const store = await knex('stores').where({ storeId }).first();
            if (!store) {
                return reply.status(404).send({ error: 'Store not found' });
            }

            // Check if a chat already exists between the customer and the store
            let chat = await knex('chats')
                .where({ customerId, storeId })
                .first();

            const chatId = uuidv4();
            // If no chat exists, create a new one
            if (!chat) {
                const [newChat] = await knex('chats')
                    .insert({
                        chatId,
                        customerId,
                        storeId,
                        created_at: new Date(),
                        updated_at: new Date(),
                    })
                    .returning(['chatId', 'storeId', 'customerId', 'updated_at']);

                chat = newChat;
            }

            return reply.send(chat);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to initiate chat' });
        }
    });
};