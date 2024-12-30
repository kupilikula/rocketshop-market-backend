'use strict';

const { Client } = require('@elastic/elasticsearch');

const esClient = new Client({
  node: 'http://localhost:9200', // Replace with your Elasticsearch server URL
});

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { query, from = 0, size = 20 } = request.query;

    try {
      // Perform a search across products and stores
      const response = await esClient.search({
        index: ['products', 'stores'],
        body: {
          query: {
            bool: {
              must: [
                { match: { isActive: true } }, // Ensure only active documents are retrieved
                {
                  multi_match: {
                    query,
                    fields: [
                      'productName^2',
                      'description',
                      'productTags^2',
                      'attributes.value^2',
                      'storeName^2',
                      'storeDescription',
                      'storeTags^1.5',
                    ],
                  },
                },
              ],
            },
          },
          from: parseInt(from, 10),
          size: parseInt(size, 10),
        },
      });

      // Extract and return the combined results
      const results = response.hits.hits.map((hit) => hit._source);
      return reply.send(results);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch search results.' });
    }
  });
};