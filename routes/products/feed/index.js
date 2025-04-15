'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { from = 0, size = 20, lastFetchedAt } = request.query;
    console.log('feed query, from:', from, ', size:', size, ', lastFetchedAt:', lastFetchedAt);

    try {
      const isGuest = !request.user || !request.user.customerId;
      let followedStoreIds = [];
      let interests = [];

      if (!isGuest) {
        const customerId = request.user.customerId;

        // Fetch followed stores
        const followedStores = await knex('customer_followed_stores')
            .select('storeId')
            .where('customerId', customerId);
        followedStoreIds = followedStores.map((row) => row.storeId);

        // Fetch top interests based on previous orders
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

        interests = interestsResult.rows.map((row) => row.tag);
      }

      // Base query
      let query = knex('products as p')
          .select(
              'p.*',
              's.storeName',
              's.storeLogoImage',
          )
          .join('stores as s', 'p.storeId', 's.storeId')
          .where('p.isActive', true);

      // Personalized filtering for logged-in users
      if (!isGuest) {
        if (followedStoreIds.length > 0) {
          query.orWhereIn('p.storeId', followedStoreIds);
        }

        if (interests.length > 0) {
          query.orWhereRaw(
              `EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(p."productTags") AS tag
              WHERE tag = ANY(?)
            )`,
              [interests]
          );
        }
      }

      // lastFetchedAt filter (for refresh)
      if (lastFetchedAt) {
        query.andWhere('p.updated_at', '>', lastFetchedAt);
      }

      // Sorting and pagination
      query.orderBy([
        { column: 'p.created_at', order: 'desc' },
        { column: 'p.productId', order: 'asc' }
      ])
          .limit(parseInt(size, 10));

      if (!lastFetchedAt) {
        query.offset(parseInt(from, 10));
      }

      const productsWithStores = await query;

      return reply.send(productsWithStores);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch feed data.' });
    }
  });
};