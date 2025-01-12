'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { query: searchTerm, from = 0, size = 20 } = request.query;

    try {
      // Construct the query for products and stores
        const productsQuery = knex
            .select(
                'productId as id',
                'productName as name',
                'description',
                'productTags',
                'attributes',
                'created_at',
                knex.raw(`'product' as type`)
            )
            .from('products')
            .where('isActive', true)
            .andWhereRaw(
                `to_tsvector(
      'english',
      coalesce("productName", '') || ' ' ||
      coalesce("description", '') || ' ' ||
      coalesce((SELECT string_agg(tag, ' ') FROM jsonb_array_elements_text("productTags") AS tag), '') || ' ' ||
      coalesce((SELECT string_agg(attr->>'value', ' ') FROM jsonb_array_elements("attributes") AS attr), '')
    ) @@ to_tsquery(?)`,
                [searchTerm]
            )
            .unionAll(
                knex
                    .select(
                        'storeId as id',
                        'storeName as name',
                        'storeDescription as description',
                        'storeTags',
                        knex.raw('NULL as attributes'),
                        '"created_at"',
                        knex.raw(`'store' as type`)
                    )
                    .from('stores')
                    .whereRaw(
                        `to_tsvector(
          'english',
          coalesce("storeName", '') || ' ' ||
          coalesce("storeDescription", '') || ' ' ||
          coalesce((SELECT string_agg(tag, ' ') FROM jsonb_array_elements_text("storeTags") AS tag), '')
        ) @@ to_tsquery(?)`,
                        [searchTerm]
                    )
            )
            .orderBy('"created_at"', 'desc')
            .limit(parseInt(size, 10))
            .offset(parseInt(from, 10));
      console.log('line45, productsQuery:', productsQuery.toString());
      const results = await productsQuery;
      console.log('line47, results:', results);

      return reply.send(results);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch search results.' });
    }
  });
};