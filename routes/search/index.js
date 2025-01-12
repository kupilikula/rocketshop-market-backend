'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { query: searchTerm, from = 0, size = 20 } = request.query;

    try {
      // Construct the query for products and stores
      const productsQuery = knex('products')
          .select(
              'productId',
              'productName',
              'description',
              'productTags',
              'attributes',
              'creationTime',
              knex.raw(`'product' as type`) // Add a type field to differentiate results
          )
          .where('isActive', true) // Ensure only active products are retrieved
          .andWhereRaw(
              `to_tsvector('english', coalesce("productName", '') || ' ' || coalesce("description", '')) @@ to_tsquery(?)`,
              [searchTerm]
          )
          .unionAll(function () {
            this.select(
                'storeId as id',
                'storeName as name',
                'storeDescription as description',
                'storeTags',
                knex.raw(`NULL as attributes`),
                knex.raw(`NULL as creationTime`),
                knex.raw(`'store' as type`) // Add a type field for differentiation
            )
                .from('stores')
                .whereRaw(
                    `to_tsvector('english', coalesce("storeName", '') || ' ' || coalesce("storeDescription", '')) @@ to_tsquery(?)`,
                    [searchTerm]
                );
          })
          .orderBy('creationTime', 'desc') // Prioritize newer products
          .limit(parseInt(size, 10))
          .offset(parseInt(from, 10));

      const results = await productsQuery;

      return reply.send(results);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch search results.' });
    }
  });
};