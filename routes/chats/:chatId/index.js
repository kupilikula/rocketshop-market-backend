'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { chatId } = request.params;

        try {
            const store = await knex('chats')
                .join('stores', 'chats.storeId', '=', 'stores.storeId')
                .where('chats.chatId', chatId)
                .select('stores.storeId', 'stores.storeName', 'stores.storeLogoImage')
                .first();

            if (!store) {
                return reply.status(404).send({ error: 'Store not found' });
            }

            return reply.send( store);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });
};