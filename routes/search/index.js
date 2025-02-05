'use strict';

const knex = require("@database/knexInstance");

// **Reusable function to query products**
async function fetchProducts(searchTerm) {
    return knex
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
            ) @@ websearch_to_tsquery(?)
            `,
            [searchTerm]
        )
        .orderBy('created_at', 'desc');
}

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { query: searchTerm, from = 0, size = 20, searchType } = request.query;

        try {
            if (searchType === "products") {
                // ✅ Await first, then apply limit and offset manually
                const allProducts = await fetchProducts(searchTerm);
                const paginatedProducts = allProducts.slice(from, from + size);

                return reply.send({ products: paginatedProducts });
            } else if (searchType === "stores") {
                // ✅ Fetch all products first
                const allProductResults = await fetchProducts(searchTerm);

                // ✅ Count product occurrences per store
                const storeCounts = allProductResults.reduce((acc, result) => {
                    acc[result.storeId] = (acc[result.storeId] || 0) + 1;
                    return acc;
                }, {});

                // ✅ Sort store IDs by the number of relevant products
                const boostedStoreIds = Object.entries(storeCounts)
                    .sort(([, a], [, b]) => b - a) // Sort by frequency
                    .map(([storeId]) => storeId);

                // ✅ Fetch boosted store details
                const boostedStoreDetails = await knex
                    .select('*')
                    .from('stores')
                    .whereIn('storeId', boostedStoreIds);

                // ✅ Fetch independent stores using `websearch_to_tsquery`
                const independentStores = await knex
                    .select('*')
                    .from('stores')
                    .whereRaw(
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
                        ) @@ websearch_to_tsquery(?)
                        `,
                        [searchTerm]
                    );

                // ✅ Combine and sort stores by relevance
                const combinedStores = [
                    ...independentStores,
                    ...boostedStoreDetails.filter(
                        store => !independentStores.some(ind => ind.storeId === store.storeId)
                    ),
                ].sort((a, b) => {
                    return (
                        (b.followerCount || 0) - (a.followerCount || 0) || // Sort by followers
                        new Date(b.created_at) - new Date(a.created_at)   // Secondary sort by date
                    );
                });

                return reply.send({ stores: combinedStores });
            } else {
                return reply.status(400).send({ error: 'Invalid searchType parameter.' });
            }
        } catch (err) {
            request.log.error(err);
            return reply.status(500).send({ error: 'Failed to fetch search results.' });
        }
    });
};