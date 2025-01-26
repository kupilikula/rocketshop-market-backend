const knex = require('@database/knexInstance'); // Adjust the path to your DB instance

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
};
