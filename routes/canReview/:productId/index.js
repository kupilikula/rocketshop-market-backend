'use strict'

const knex = require("@database/knexInstance");
const {getCompletedOrderStatuses} = require("../../../utils/orderStatusList");
const completedStatuses = getCompletedOrderStatuses();

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { productId } = request.params;
    const customerId = request.user.customerId;
    try {

      const hasPurchased = await knex("orders")
          .join("order_items", "orders.orderId", "order_items.orderId")
          .where({
            "orders.customerId": customerId,
            "order_items.productId": productId,
          })
          .whereIn("orders.orderStatus", completedStatuses)
          .first();

        return reply.status(200).send({ canReview: !!hasPurchased });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to get review eligibility.' });
    }
  });
};