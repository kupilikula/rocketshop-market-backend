'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const { cart } = request.body;

    try {
      // Group cart items by store
      const groupedCart = cart.reduce((acc, item) => {
        const { storeId } = item;
        if (!acc[storeId]) {
          acc[storeId] = { items: [], storeId };
        }
        acc[storeId].items.push(item);
        return acc;
      }, {});

      const storeDetails = await knex('stores')
          .whereIn('storeId', Object.keys(groupedCart))
          .select('storeId', 'storeName', 'storeLogo');

      const response = await Promise.all(
          storeDetails.map(async (store) => {
            const storeCart = groupedCart[store.storeId];

            // Calculate subtotal
            const subtotal = storeCart.items.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
            );

            // Calculate shipping cost
            const shipping = await calculateShipping(store.storeId, subtotal);

            // Calculate discount
            const discount = await calculateDiscount(store.storeId, subtotal);

            // Calculate GST
            const gst = storeCart.items.reduce(
                (sum, item) =>
                    sum +
                    (item.gstInclusive ? 0 : item.price * item.quantity * item.gstRate / 100),
                0
            );

            // Total cost
            const total = subtotal + shipping - discount + gst;

            return {
              storeId: store.storeId,
              storeName: store.storeName,
              storeLogo: store.storeLogo,
              billing: {
                subtotal,
                shipping,
                discount,
                gst,
                total,
              },
              items: storeCart.items,
            };
          })
      );

      return reply.send(response);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to calculate cart summary.' });
    }
  });
};

// Helper functions for shipping and discount calculation
async function calculateShipping(storeId, subtotal) {
  // Example logic for shipping cost
  return subtotal > 1000 ? 0 : 50; // Free shipping for orders above 1000
}

async function calculateDiscount(storeId, subtotal) {
  // Example logic for discount
  return subtotal > 500 ? 100 : 0; // ₹100 discount for orders above 500
}