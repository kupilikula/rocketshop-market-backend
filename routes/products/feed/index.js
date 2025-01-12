'use strict';

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { from = 0, size = 20, lastFetchedAt } = request.query;

    try {
      const customerId = request.user.customerId;

      // Fetch followedStoreIds from the database
      const followedStores = await fastify.knex('customer_followed_stores')
          .select('storeId')
          .where('customerId', customerId);

      const followedStoreIds = followedStores.map((row) => row.storeId);

      // Compute interests based on recent purchases or viewed products
      const interestsResult = await fastify.knex.raw(`
        SELECT DISTINCT UNNEST("productTags") AS tag
        FROM products
        JOIN orders ON products."productId" = orders."productId"
        WHERE orders."customerId" = ?
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `, [customerId]);

      const interests = interestsResult.rows.map((row) => row.tag);

      // Build the feed query
      let query = fastify.knex('products')
          .select('*')
          .where('isActive', true);

      // Filter for followed stores
      if (followedStoreIds.length > 0) {
        query.orWhereIn('storeId', followedStoreIds);
      }

      // Boost relevance for interests
      if (interests.length > 0) {
        query.orWhereRaw('productTags && ?', [interests]);
      }

      // Filter for lastFetchedAt if provided
      if (lastFetchedAt) {
        query.andWhere('updatedAt', '>', lastFetchedAt);
      }

      // Apply sorting and pagination
      query.orderBy('creationTime', 'desc')
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