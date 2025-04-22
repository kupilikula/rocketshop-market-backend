'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const customerId = request.user?.customerId;

        if (!customerId) {
            return reply.status(401).send({ error: 'Unauthorized: Customer not logged in.' });
        }

        try {
            // Subquery: unread messages per chat
            const unreadMessages = await knex('messages as m')
                .join('chats as c', 'm.chatId', 'c.chatId')
                .leftJoin('message_reads as r', function () {
                    this.on('m.messageId', '=', 'r.messageId')
                        .andOn('r.readerId', '=', knex.raw('?', [customerId]))
                        .andOn('r.readerType', '=', knex.raw('?', ['Customer']));
                })
                .where('c.customerId', customerId)
                .andWhere('m.senderType', 'Merchant') // Only consider messages from merchant
                .andWhereNull('r.read_at') // Not read by customer
                .select(
                    'm.messageId',
                    'm.chatId',
                    'm.senderId',
                    'm.message',
                    'm.created_at'
                );

            // Organize by chatId
            const unreadMessagesByChat = {};
            for (const msg of unreadMessages) {
                if (!unreadMessagesByChat[msg.chatId]) {
                    unreadMessagesByChat[msg.chatId] = [];
                }
                unreadMessagesByChat[msg.chatId].push({
                    messageId: msg.messageId,
                    senderId: msg.senderId,
                    message: msg.message,
                    created_at: msg.created_at,
                });
            }

            // Build unreadCounts from message groups
            const unreadCounts = Object.fromEntries(
                Object.entries(unreadMessagesByChat).map(([chatId, messages]) => [
                    chatId,
                    messages.length,
                ])
            );

            return reply.send({
                unreadCounts,
                unreadMessages: unreadMessagesByChat,
            });

        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch unread messages.' });
        }
    });
};