'use strict';

const knex = require("@database/knexInstance");

/**
 * Converts a search term into a PostgreSQL `to_tsquery`-compatible format.
 * - Splits the term into words.
 * - Appends `:*` to enable prefix matching on **all words**.
 * - Joins words with `&` for **better multi-word search**.
 * @param {string} searchTerm - User input search term.
 * @returns {string} - Processed search query for PostgreSQL FTS.
 */
function formatTsQuery(searchTerm) {
    return searchTerm
        .trim()
        .split(/\s+/) // Split by spaces
        .map(word => `${word}:*`) // Append `:*` to each word
        .join(' & '); // Join words using `&`
}

// **Reusable function to query products**
async function fetchProducts(searchTerm) {
    const formattedQuery = formatTsQuery(searchTerm);

    return await knex
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
            ) @@ to_tsquery('english', ?)
            `,
            [formattedQuery]
        )
        .orderBy('created_at', 'desc');
}

module.exports = async function (fastify, opts) {
    fastify.get('/', async (request, reply) => {
        const {
            query: searchTerm,
            from = 0,
            size = 20,
            searchType,
        } = request.query;

        try {
            if (!searchTerm || searchTerm.trim().length === 0) {
                return reply.status(400).send({ error: 'Search query cannot be empty.' });
            }

            const formattedQuery = formatTsQuery(searchTerm);

            if (searchType === 'products') {
                const allProducts = await fetchProducts(searchTerm);
                const paginatedProducts = allProducts.slice(from, from + size);
                return reply.send({ products: paginatedProducts });
            }

            if (searchType === 'stores') {
                // Boosted stores (based on product match)
                const allProducts = await fetchProducts(searchTerm);
                const storeCounts = allProducts.reduce((acc, result) => {
                    acc[result.storeId] = (acc[result.storeId] || 0) + 1;
                    return acc;
                }, {});
                const boostedStoreIds = Object.entries(storeCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([storeId]) => storeId);

                const boostedStores = boostedStoreIds.length
                    ? await knex('stores').whereIn('storeId', boostedStoreIds)
                    : [];

                // FTS stores
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
          ) @@ to_tsquery('english', ?)
          `,
                        [formattedQuery]
                    );

                // Combine + dedupe + sort
                const combinedStores = [
                    ...independentStores,
                    ...boostedStores.filter(
                        store => !independentStores.some(ind => ind.storeId === store.storeId)
                    ),
                ].sort((a, b) => {
                    return (
                        (b.followerCount || 0) - (a.followerCount || 0) ||
                        new Date(b.created_at) - new Date(a.created_at)
                    );
                });

                // Paginate combined stores
                const paginatedStores = combinedStores.slice(from, from + size);
                return reply.send({ stores: paginatedStores });
            }

            return reply.status(400).send({ error: 'Invalid searchType parameter.' });
        } catch (err) {
            request.log.error(err);
            return reply.status(500).send({ error: 'Failed to fetch search results.' });
        }
    });
};