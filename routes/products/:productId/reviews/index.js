'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get("/", async (request, reply) => {
        const { productId } = request.params;
        const {
            limit = 10,
            offset = 0,
            sort = "latest", // default sort
            rating,
            hasTextOnly,
        } = request.query;

        if (limit > 100 || offset < 0) {
            return reply.status(400).send({ message: "Invalid limit or offset" });
        }

        // Base query with joins and filters
        let query = knex("product_reviews")
            .join("customers", "product_reviews.customerId", "customers.customerId")
            .where({
                "product_reviews.productId": productId,
                "product_reviews.isVisible": true,
            });

        // Filters
        if (rating) {
            query = query.where("product_reviews.rating", "=", parseInt(rating));
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

        // Count of reviews matching current filters
        const countQuery = query.clone().clearSelect().clearOrder().count("*");
        const [{ count: filteredCount }] = await countQuery;

        // Count of all visible reviews for this product (unfiltered)
        const totalCountQuery = knex("product_reviews")
            .where({
                productId,
                isVisible: true,
            })
            .count("*");
        const [{ count: totalCount }] = await totalCountQuery;

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
                totalCount: parseInt(totalCount),       // all visible reviews
                filteredCount: parseInt(filteredCount), // count after filters
                limit,
                offset,
            },
        });
    });
};