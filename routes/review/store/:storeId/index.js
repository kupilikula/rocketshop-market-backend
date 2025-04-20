'use strict'

const { v4: uuidv4 } = require("uuid");
const knex = require("@database/knexInstance");
const { getReviewEligibleOrderStatuses} = require("../../../../utils/orderStatusList");
const reviewEligibleOrderStatuses = getReviewEligibleOrderStatuses();

module.exports = async function (fastify, opts) {
    fastify.post("/", async (request, reply) => {
        const { storeId } = request.params;
        const { rating, review } = request.body;
        const customerId = request.user?.customerId;

        if (!customerId) {
            return reply.status(401).send({ message: "Unauthorized" });
        }

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return reply.status(400).send({ message: "Invalid rating. Must be 1-5." });
        }

        // 1. Check if the user has purchased from this store
        const hasPurchased = await knex("orders")
            .where({
                customerId,
                storeId,
            })
            .whereIn("orderStatus", reviewEligibleOrderStatuses)
            .first();

        if (!hasPurchased) {
            return reply.status(403).send({ message: "You must have a completed order from this store to leave a review." });
        }

        // 2. Upsert into store_reviews
        const existingReview = await knex("store_reviews")
            .where({ storeId, customerId })
            .first();

        let defaultReview = null;
        if (!review?.trim()) defaultReview = existingReview?.review || null;

        if (existingReview) {
            await knex("store_reviews")
                .where({ storeId, customerId })
                .update({
                    rating,
                    review: review || defaultReview,
                    updated_at: knex.fn.now(),
                    isVisible: true,
                });
        } else {
            await knex("store_reviews").insert({
                reviewId: uuidv4(),
                storeId,
                customerId,
                rating,
                review: review || defaultReview,
                isVisible: true,
                created_at: knex.fn.now(),
                updated_at: knex.fn.now(),
            });
        }

        // 3. Recalculate average rating and count for the store
        const { avg, count } = await knex("store_reviews")
            .where({ storeId })
            .andWhere("rating", ">", 0)
            .select(
                knex.raw("AVG(rating)::numeric(3,2) as avg"),
                knex.raw("COUNT(*) as count")
            )
            .first();

        await knex("stores")
            .where({ storeId })
            .update({
                rating: avg,
                numberOfRatings: count,
            });

        return reply.send({
            message: "Store review submitted successfully.",
            rating: Number(avg),
            numberOfRatings: Number(count),
        });
    });
};