'use strict';

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

            // Calculate subtotal
            const subtotal = items.reduce(
                (sum, item) => sum + item.product.price * item.quantity,
                0
            );

            // Calculate shipping cost
            const shipping = await calculateShipping(storeId, subtotal);

            // Calculate discount
            const discount = await calculateDiscount(storeId, subtotal);

            // Calculate GST
            const gst = items.reduce(
                (sum, item) =>
                    sum +
                    (item.product.gstInclusive
                        ? 0
                        : item.product.price * item.quantity * item.product.gstRate / 100),
                0
            );

            return {
              storeId,
              storeName,
              storeLogoImage,
              billing: {
                subtotal,
                shipping,
                discount,
                gst,
                total: subtotal + shipping - discount + gst, // Store-specific total
              },
              items,
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