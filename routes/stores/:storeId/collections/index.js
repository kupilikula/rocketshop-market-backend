// routes/storeCollections.js
const knex = require('@database/knexInstance');

// routes/storeCollections.js
module.exports = async function (fastify) {
    fastify.get('/', async (request, reply) => {
        const { storeId } = request.params;

        try {
            const collections = await knex('collections as c')
                .leftJoin('productCollections as pc', 'c.collectionId', 'pc.collectionId')
                .leftJoin('products as p', function () {
                    this.on('pc.productId', '=', 'p.productId')
                        .andOn('p.isActive', '=', knex.raw('true'));
                })
                .where('c.storeId', storeId)
                .andWhere('c.isActive', true)
                .groupBy('c.collectionId')
                .select(
                    'c.collectionId',
                    'c.collectionName',
                    'c.storeFrontDisplay',
                    'c.storeFrontDisplayNumberOfItems',
                    'c.displayOrder',
                    knex.raw('COUNT(DISTINCT p.productId) as productCount')
                )
                .orderBy('c.displayOrder', 'asc');

            return { collections };
        } catch (err) {
            console.log.error(err);
            return reply.status(500).send({ error: 'Failed to fetch collections' });
        }
    });
};