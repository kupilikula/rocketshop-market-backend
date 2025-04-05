'use strict'

const { v4: uuidv4 } = require("uuid");
const knex = require("@database/knexInstance");
const {getCompletedOrderStatuses} = require("../../../../utils/orderStatusList");
const completedStatuses = getCompletedOrderStatuses();

module.exports = async function (fastify, opts) {
  fastify.post("/", async (request, reply) => {
    const { productId } = request.params;
    const { rating, review } = request.body;
    const customerId = request.user?.customerId;

    if (!customerId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return reply.status(400).send({ message: "Invalid rating. Must be 1-5." });
    }

    // 1. Check if the user has purchased this product
    const hasPurchased = await knex("orders")
        .join("order_items", "orders.orderId", "order_items.orderId")
        .where({
          "orders.customerId": customerId,
          "order_items.productId": productId,
        })
        .whereIn("orders.orderStatus", completedStatuses)
        .first();

    if (!hasPurchased) {
      return reply.status(403).send({ message: "You must purchase this product to leave a review." });
    }

    // 2. Upsert into product_reviews
    const existingReview = await knex("product_reviews")
        .where({ productId, customerId })
        .first();

    let defaultReview = null;
    if (!review?.trim()) defaultReview = existingReview?.review || null;

    if (existingReview) {
      await knex("product_reviews")
          .where({ productId, customerId })
          .update({
            rating,
            review: review || defaultReview,
            updated_at: knex.fn.now(),
            isVisible: true,
          });
    } else {
      await knex("product_reviews").insert({
        reviewId: uuidv4(),
        productId,
        customerId,
        rating,
        review: review || defaultReview,
        isVisible: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }

    // 3. Recalculate average rating and count
    const { avg, count } = await knex("product_reviews")
        .where({ productId })
        .andWhere("rating", ">", 0)
        .select(
            knex.raw("AVG(rating)::numeric(3,2) as avg"),
            knex.raw("COUNT(*) as count")
        )
        .first();

    await knex("products")
        .where({ productId })
        .update({
          rating: avg,
          numberOfRatings: count,
        });

    return reply.send({
      message: "Review submitted successfully.",
      rating: Number(avg),
      numberOfRatings: Number(count),
    });
  });
};