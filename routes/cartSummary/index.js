'use strict';

const { calculateBilling } = require('../../utils/calculateBilling');
const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { cart } = request.body;

    try {
      // Group cart items by store
      const groupedCart = cart.reduce((acc, item) => {
        const { storeId, storeName, storeLogoImage } = item.product;
        if (!acc[storeId]) {
          acc[storeId] = { items: [], storeId, storeName, storeLogoImage };
        }
        acc[storeId].items.push(item);
        return acc;
      }, {});

      // Build response for each store group
      const response = await Promise.all(
          Object.values(groupedCart).map(async (storeGroup) => {
            const { storeId, storeName, storeLogoImage, items } = storeGroup;

            const validatedItems = await Promise.all(
                items.map(async (item) => {
                  const product = await knex('products')
                      .where('productId', item.product.productId)
                      .first();

                  if (!product) {
                    throw new Error(`Product not found: ${item.product.productId}`);
                  }

                  const availableStock = product.stock - product.reservedStock;

                  if (item.quantity > availableStock) {
                    // Adjust quantity to the maximum available stock
                    return {
                      ...item,
                      quantity: availableStock,
                      adjusted: true, // Mark as adjusted for frontend display
                    };
                  }

                  return { ...item, adjusted: false };
                })
            );

            // Calculate billing based on adjusted items
            const billing = await calculateBilling(
                storeId,
                validatedItems.filter((item) => item.quantity > 0) // Exclude items with zero quantity
            );

            return {
              storeId,
              storeName,
              storeLogoImage,
              billing,
              items: validatedItems,
            };
          })
      );

      return reply.send(response);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to calculate cart summary.', details: error.message });
    }
  });
};