// services/sendNotificationToStoreMerchants.js

const { Expo } = require('expo-server-sdk');
const expo = new Expo();
const knex = require('@database/knexInstance');
/**
 * Sends a push notification to all merchants associated with a store
 * @param {object} knex - Your Knex instance
 * @param {string} storeId - ID of the store
 * @param {object} messagePayload - The base push notification payload (title, body, data)
 */
async function sendNotificationToStoreMerchants(storeId, messagePayload) {
    // Step 1: Get all merchantIds associated with the store who can receive messages
    const merchants = await knex("merchantStores")
        .join("merchantPushTokens", "merchantStores.merchantId", "merchantPushTokens.merchantId")
        .where("merchantStores.storeId", storeId)
        // .andWhere("merchantStores.canReceiveMessages", true)
        .select("merchantPushTokens.expoPushToken")
        .distinct();

    if (!merchants.length) {
        console.log(`No push tokens found for storeId ${storeId}`);
        return;
    }

    // Step 2: Filter and prepare messages
    const messages = merchants
        .filter((m) => Expo.isExpoPushToken(m.expoPushToken))
        .map((m) => ({
            to: m.expoPushToken,
            sound: 'default',
            title: messagePayload.title,
            body: messagePayload.body,
            data: messagePayload.data || {},
        }));

    // Step 3: Send messages in chunks (Expo recommends batching)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error('Error sending push notifications:', error);
        }
    }

    // Optional: log ticket responses
    console.log('Push notification tickets:', tickets);
}

module.exports = { sendNotificationToStoreMerchants };