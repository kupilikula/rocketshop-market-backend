const { Expo } = require('expo-server-sdk');
const expo = new Expo();
const knex = require('@database/knexInstance');

// --- Notification Templates ---

const MerchantNotificationTypes = {
    NEW_ORDER: ({ orderId, orderTotal, customerName }) => ({
        type: 'NEW_ORDER',
        title: 'New Order',
        body: `Order from ${customerName} for ₹${orderTotal}`,
        data: { orderId },
    }),

    NEW_MESSAGE: ({ chatId, customerName }) => ({
        type: 'NEW_MESSAGE',
        title: 'New Message',
        body: `You received a message from ${customerName}`,
        data: { chatId },
    }),

    ORDER_RETURN_REQUESTED: ({ orderId }) => ({
        type: 'ORDER_RETURN_REQUESTED',
        title: 'Return Requested',
        body: `Customer has requested a return for order #${orderId}`,
        data: { orderId },
    }),

    ORDER_CANCELED_BY_CUSTOMER: ({ orderId }) => ({
        type: 'ORDER_CANCELED_BY_CUSTOMER',
        title: 'Order Canceled',
        body: `Order #${orderId} was canceled by the customer`,
        data: { orderId },
    }),

    PLATFORM_MESSAGE: ({ messageId, headline, summary }) => ({
        type: 'PLATFORM_MESSAGE',
        title: headline,
        body: summary,
        data: { messageId },
    }),

    PRODUCT_RATING_RECEIVED: ({ productId, productName, customerId, rating }) => ({
        type: 'PRODUCT_RATING_RECEIVED',
        title: 'Product Rating Received',
        body: `Your product received a ${rating}-⭐ rating`,
        data: { productId, productName, customerId },
    }),

    STORE_RATING_RECEIVED: ({ storeId, customerId, rating }) => ({
        type: 'STORE_RATING_RECEIVED',
        title: 'Store Rating Received',
        body: `Your store received a ${rating}-⭐ rating`,
        data: { storeId, customerId },
    }),

    NEW_FOLLOWER: ({ storeId, customerId, customerName }) => ({
        type: 'NEW_FOLLOWER',
        title: 'New Follower',
        body: `${customerName} followed your store`,
        data: { storeId, customerId },
    }),
};

// --- Android Channel Mapping ---

const NotificationChannels = {
    MERCHANT: {
        NEW_ORDER: 'orders',
        NEW_MESSAGE: 'chat',
        ORDER_RETURN_REQUESTED: 'orders',
        ORDER_CANCELED_BY_CUSTOMER: 'orders',
        PLATFORM_MESSAGE: 'miscellaneous',
        PRODUCT_RATING_RECEIVED: 'ratings',
        STORE_RATING_RECEIVED: 'ratings',
        NEW_FOLLOWER: 'social',
    },
};

// --- Preference Check ---

async function shouldNotifyMerchant(knex, merchantId, notificationType) {
    const prefs = await knex('merchantNotificationPreferences')
        .where({ merchantId })
        .first();

    if (!prefs) return true;
    if (prefs.muteAll) return false;

    switch (notificationType) {
        case 'NEW_ORDER':
            return prefs.newOrders;
        case 'NEW_MESSAGE':
            return prefs.messages;
        case 'ORDER_RETURN_REQUESTED':
            return prefs.returnRequests;
        case 'ORDER_CANCELED_BY_CUSTOMER':
            return prefs.orderCancellations;
        case 'PLATFORM_MESSAGE':
            return prefs.platformMessages;
        case 'PRODUCT_RATING_RECEIVED':
        case 'STORE_RATING_RECEIVED':
            return prefs.ratingsAndReviews;
        case 'NEW_FOLLOWER':
            return prefs.newFollowers;
        default:
            return true;
    }
}

// --- Main Notification Sender ---

/**
 * Sends a typed notification to all merchants associated with a store (respecting preferences).
 * @param {string} storeId - The store ID
 * @param {function} notificationTemplateFunction - NotificationTypes.<TYPE> function
 * @param {object} data - Args for the template function
 */
async function checkPreferencesAndSendNotificationToStoreMerchants(storeId, notificationTemplateFunction, data) {
    const messagePayload = notificationTemplateFunction(data);
    const { type } = messagePayload;

    // Step 1: Get merchants associated with store and their tokens
// Start building the query
    let query = knex('merchantStores')
        .join('merchantPushTokens', 'merchantStores.merchantId', 'merchantPushTokens.merchantId')
        .where('merchantStores.storeId', storeId)
        .select('merchantStores.merchantId', 'merchantPushTokens.expoPushToken')
        .distinct();

// Add condition if type is NEW_MESSAGE
    if (type === 'NEW_MESSAGE') {
        query = query.andWhere('merchantStores.canReceiveMessages', true);
    }

    const merchants = await query;

    if (!merchants.length) {
        console.log(`No push tokens found for storeId ${storeId}`);
        return;
    }

    const channelId = NotificationChannels.MERCHANT[type] || undefined;
    const validMessages = [];

    // Step 2: Check preferences and prepare messages
    for (const merchant of merchants) {
        if (!(await shouldNotifyMerchant(knex, merchant.merchantId, type))) continue;
        if (!Expo.isExpoPushToken(merchant.expoPushToken)) continue;

        validMessages.push({
            to: merchant.expoPushToken,
            sound: 'default',
            title: messagePayload.title,
            body: messagePayload.body,
            data: messagePayload.data,
            channelId,
        });
    }

    if (!validMessages.length) {
        console.log(`No eligible merchants to notify for storeId ${storeId} and type ${type}`);
        return;
    }

    // Step 3: Send in chunks
    const chunks = expo.chunkPushNotifications(validMessages);
    const tickets = [];

    for (const chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error('Error sending push notifications:', error);
        }
    }

    console.log(`Push notifications sent to storeId ${storeId}, type: ${type}`, tickets);
}

// --- Exports ---

module.exports = {
    checkPreferencesAndSendNotificationToStoreMerchants,
    shouldNotifyMerchant,
    MerchantNotificationTypes,
    NotificationChannels,
};