const knex = require('@database/knexInstance');
const {v4: uuidv4} = require("uuid"); // Adjust the path to your DB instance

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        try {
            const { customerId } = request.user; // Extract customerId or merchantId from authenticated user
            // console.log('line8, customerId:', customerId, ' , merchantId:', merchantId, ' , storeId:', storeId);
            // Handle request for customers
            if (customerId) {
                const chats = await knex('chats')
                    .select(
                        'chats.chatId',
                        'chats.storeId',
                        'stores.storeName',
                        'stores.storeLogoImage',
                        'chats.updated_at as lastMessageTime',
                        knex('messages')
                            .select('message')
                            .whereRaw('messages."chatId" = chats."chatId"')
                            .orderBy('messages.created_at', 'desc')
                            .limit(1)
                            .as('lastMessage')
                    )
                    .join('stores', 'chats.storeId', 'stores.storeId')
                    .where({ 'chats.customerId': customerId })
                    .orderBy('chats.updated_at', 'desc');

                return reply.send(chats);
            }

            return reply.status(400).send({ error: 'Invalid request: No customerId found.' });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch chats' });
        }
    });

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
