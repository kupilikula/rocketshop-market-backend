'use strict'

const knex = require("@database/knexInstance");
const {sendNotificationToStoreMerchants, checkPreferencesAndSendNotificationToStoreMerchants, MerchantNotificationTypes} = require("../../../services/PushNotificationsToMerchantsService");

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { storeId } = request.params;
    const customerId = request.user.customerId;

    try {
      // Check if the store exists
      const store = await knex('stores').where({ storeId }).first();
      if (!store) {
        return reply.status(404).send({ error: 'Store not found.' });
      }

      // Check if the customer is already following the store
      const existingFollow = await knex('customer_followed_stores')
          .where({ customerId, storeId })
          .first();

      if (existingFollow) {
        return reply.status(400).send({ error: 'Already following this store.' });
      }

      // Add a new follow
      await knex('customer_followed_stores').insert({
        customerId,
        storeId,
        followed_at: new Date(),
      });

      // Increment the followerCount in the stores table
      await knex('stores')
          .where({ storeId })
          .increment('followerCount', 1);

      const customer = await knex('customers')
          .select('fullName')
          .where('customerId', customerId)
          .first();

      await checkPreferencesAndSendNotificationToStoreMerchants(storeId, MerchantNotificationTypes.NEW_FOLLOWER, {storeId, customerId, customerName: customer.fullName});

      return reply.status(200).send({ message: 'Followed the store successfully.' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to follow the store.' });
    }
  });
}
