'use strict'

const { Client } = require('@elastic/elasticsearch');

const esClient = new Client({
  node: 'http://localhost:9200', // Replace with your Elasticsearch server URL
});

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { customerId, from = 0, size = 20, lastFetchedAt } = request.query;

    try {
      // Build relevance-based query
      const query = {
        bool: {
          must: [{ term: { isActive: true } }], // Only active products
          should: [
            { terms: { storeId: request.user.followedStoreIds || [] } }, // Boost followed stores
            { terms: { tags: request.user.interests || [] } }, // Boost tags
          ],
          filter: lastFetchedAt
              ? [{ range: { updatedAt: { gt: lastFetchedAt } } }] // Fetch new/updated products
              : [],
        },
      };

      const response = await esClient.search({
        index: 'products',
        body: {
          query,
          sort: [{ creationTime: 'desc' }],
          from: parseInt(from, 10),
          size: parseInt(size, 10),
        },
      });

      const products = response.hits.hits.map((hit) => hit._source);
      return reply.send(products);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch feed data.' });
    }
  });
}
