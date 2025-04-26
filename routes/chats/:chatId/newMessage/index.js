'use strict';

const knex = require('@database/knexInstance'); // your knex connection

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const { chatId } = request.params;
        const { messageId, senderId, senderType, message, created_at } = request.body;

        if (!messageId || !chatId || !senderId || !senderType || !message) {
            return reply.code(400).send({ error: 'Missing required fields' });
        }

        try {
            // Check if message already exists
            const existingMessage = await knex('messages')
                .where({ messageId })
                .first();

            if (existingMessage) {
                // Message already saved — safe to treat as success
                return reply.code(200).send({ status: 'duplicate', messageId });
            }

            // Save new message
            await knex('messages').insert({
                messageId,
                chatId,
                senderId,
                senderType,
                message,
                created_at: created_at ? new Date(created_at) : new Date(),
            });

            return reply.code(201).send({ status: 'created', messageId });
        } catch (error) {
            console.error('Error saving new message via API:', error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
};