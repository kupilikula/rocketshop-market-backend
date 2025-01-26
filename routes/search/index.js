'use strict';

const knex = require("@database/knexInstance");

// Reusable function to query products
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
        ) @@ plainto_tsquery(?)
        `,
            [searchTerm]
        );
}

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const { query: searchTerm, from = 0, size = 20, searchType } = request.query;

        try {
            if (searchType === "products") {
                // Fetch products
                const products = await knex
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
                        ) @@ plainto_tsquery(?)
                        `,
                        [searchTerm]
                    )
                    .orderBy('created_at', 'desc')
                    .limit(parseInt(size, 10))
                    .offset(parseInt(from, 10));

                return reply.send({ products });
            } else if (searchType === "stores") {
                // Fetch products for boosting store results
                const productResults = await knex
                    .select('storeId')
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
                        ) @@ plainto_tsquery(?)
                        `,
                        [searchTerm]
                    );

                const storeCounts = productResults.reduce((acc, result) => {
                    acc[result.storeId] = (acc[result.storeId] || 0) + 1;
                    return acc;
                }, {});

                const boostedStoreIds = Object.entries(storeCounts)
                    .sort(([, a], [, b]) => b - a) // Sort by occurrence count
                    .map(([storeId]) => storeId);

                // Fetch boosted stores
                const boostedStoreDetails = await knex
                    .select('*')
                    .from('stores')
                    .whereIn('storeId', boostedStoreIds);

                // Fetch independent stores
                const independentStores = await knex
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
                        ) @@ plainto_tsquery(?)
                        `,
                        [searchTerm]
                    );

                // Combine and sort stores by followerCount and created_at
                const combinedStores = [
                    ...independentStores,
                    ...boostedStoreDetails.filter(
                        store => !independentStores.some(ind => ind.storeId === store.storeId)
                    ),
                ].sort((a, b) => {
                    return (
                        (b.followerCount || 0) - (a.followerCount || 0) || // Sort by follower count
                        new Date(b.created_at) - new Date(a.created_at) // Secondary sort by created_at
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