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
                    'created_at'
                )
                .from('products')
                .where('isActive', true)
                .andWhereRaw(
                    `
    to_tsvector(
      'english',
      coalesce("productName", '') || ' ' ||
      coalesce("description", '') || ' ' ||
      coalesce(
        (SELECT string_agg(tag, ' ') 
         FROM jsonb_array_elements_text("productTags") AS tag), 
        ''
      ) || ' ' ||
      coalesce(
        (SELECT string_agg(attr->>'value', ' ') 
         FROM jsonb_array_elements("attributes") AS attr), 
        ''
      )
    ) @@ to_tsquery(?)
    `,
                    [searchTerm]
                )
                .orderBy('created_at', 'desc')
                .limit(parseInt(size, 10))
                .offset(parseInt(from, 10));

            const storesQuery = knex
                .select(
                    'storeId as id',
                    'storeName as name',
                    'storeDescription as description',
                    'storeTags',
                    'created_at'
                )
                .from('stores')
                .andWhereRaw(
                    `
    to_tsvector(
      'english',
      coalesce("storeName", '') || ' ' ||
      coalesce("storeDescription", '') || ' ' ||
      coalesce(
        (SELECT string_agg(tag, ' ') 
         FROM jsonb_array_elements_text("storeTags") AS tag), 
        ''
      )
    ) @@ to_tsquery(?)
    `,
                    [searchTerm]
                )
                .orderBy('created_at', 'desc')
                .limit(parseInt(size, 10))
                .offset(parseInt(from, 10));


            const [products, stores] = await Promise.all([productsQuery, storesQuery]);
            console.log('line47, products:', products);
            console.log('line47, stores:', stores);

            return reply.send({products, stores});
        } catch (err) {
            request.log.error(err);
            return reply.status(500).send({ error: 'Failed to fetch search results.' });
        }
    });
};