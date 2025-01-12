'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { from = 0, size = 20, lastFetchedAt } = request.query;

    try {
      const customerId = request.user.customerId;

      // Fetch followedStoreIds from the database
      const followedStores = await knex('customer_followed_stores')
          .select('storeId')
          .where('customerId', customerId);

      const followedStoreIds = followedStores.map((row) => row.storeId);

      // Compute interests based on recent purchases or viewed products
      const interestsResult = await knex.raw(`
        SELECT tag
        FROM (
               SELECT jsonb_array_elements_text("productTags") AS tag
               FROM "products"
                      JOIN "order_items" ON "products"."productId" = "order_items"."productId"
                      JOIN "orders" ON "orders"."orderId" = "order_items"."orderId"
               WHERE "orders"."customerId" = ?
             ) AS tags
        GROUP BY tag
        ORDER BY COUNT(tag) DESC
          LIMIT 10
      `, [customerId]);

      const interests = interestsResult.rows.map((row) => row.tag);

      // Build the feed query
      let query = knex('products')
          .select('*')
          .where('isActive', true);

      // Filter for followed stores
      if (followedStoreIds.length > 0) {
        query.orWhereIn('storeId', followedStoreIds);
      }

      // Boost relevance for interests
      if (interests.length > 0) {
        query.orWhereRaw(
            `EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text("productTags") AS tag
            WHERE tag = ANY(?)
          )`,
            [interests]
        );
      }

      // Filter for lastFetchedAt if provided
      if (lastFetchedAt) {
        query.andWhere('updated_at', '>', lastFetchedAt);
      }

      // Apply sorting and pagination
      query
          .orderBy('created_at', 'desc')
          .limit(parseInt(size, 10))
          .offset(parseInt(from, 10));

      const products = await query;

      return reply.send(products);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch feed data.' });
    }
  });
};