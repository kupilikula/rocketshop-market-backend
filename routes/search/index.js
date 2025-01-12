'use strict';

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { query: searchTerm, from = 0, size = 20 } = request.query;

        try {
            // Fetch products
            const productsQuery = knex
                .select('*')
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

            // Fetch independent stores
            const storesQuery = knex
                .select('*')
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

            const [products, independentStores] = await Promise.all([productsQuery, storesQuery]);

            // Get storeId counts from product results
            const storeCounts = products.reduce((acc, product) => {
                acc[product.storeId] = (acc[product.storeId] || 0) + 1;
                return acc;
            }, {});

            // Get top storeIds from product results
            const topStoreIds = Object.entries(storeCounts)
                .sort(([, a], [, b]) => b - a) // Sort by occurrence count
                .slice(0, 5) // Take top 5 stores (adjust as needed)
                .map(([storeId]) => storeId);

            // Fetch details for top stores
            const topStoresQuery = knex
                .select('*')
                .from('stores')
                .whereIn('storeId', topStoreIds);

            const topStores = await topStoresQuery;

            // Combine top stores with independent stores, ensuring no duplicates
            const storeSet = new Set(topStores.map(store => store.storeId));
            const combinedStores = [
                ...topStores,
                ...independentStores.filter(store => !storeSet.has(store.storeId))
            ];

            return reply.send({ products, stores: combinedStores });
        } catch (err) {
            request.log.error(err);
            return reply.status(500).send({ error: 'Failed to fetch search results.' });
        }
    });
};