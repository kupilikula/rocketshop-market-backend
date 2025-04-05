'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get("/", async (request, reply) => {
        const { productId } = request.params;
        const {
            limit = 10,
            offset = 0,
            sort = "latest", // default sort
            minRating,
            hasTextOnly,
        } = request.query;

        if (limit > 100 || offset < 0) {
            return reply.status(400).send({ message: "Invalid limit or offset" });
        }

        let query = knex("product_reviews")
            .join("customers", "product_reviews.customerId", "customers.customerId")
            .where({
                "product_reviews.productId": productId,
                "product_reviews.isVisible": true,
            });



        if (minRating) {
            query = query.andWhere("product_reviews.rating", ">=", minRating);
        }

        if (hasTextOnly === "true") {
            query = query.whereNotNull("product_reviews.review").andWhere("product_reviews.review", "!=", "");
        }

        // Sorting
        if (sort === "latest") {
            query = query.orderBy("product_reviews.created_at", "desc");
        } else if (sort === "oldest") {
            query = query.orderBy("product_reviews.created_at", "asc");
        } else if (sort === "highest") {
            query = query.orderBy("product_reviews.rating", "desc");
        } else if (sort === "lowest") {
            query = query.orderBy("product_reviews.rating", "asc");
        }

// Total count (for client-side pagination)
        const countQuery = query.clone().clearSelect().clearOrder().count("*");
        const [{ count }] = await countQuery;

// Paginated data
        const reviews = await query
            .select(
                "product_reviews.rating",
                "product_reviews.review",
                "product_reviews.created_at",
                "customers.customerId",
                "customers.fullName as customerName"
            )
            .limit(limit)
            .offset(offset);

        return reply.send({
            reviews,
            pagination: {
                total: parseInt(count),
                limit,
                offset,
            },
        });
    });
};