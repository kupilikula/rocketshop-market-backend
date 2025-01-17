'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { customerId } = request.params;
    const { status, startDate, endDate, limit = 20, offset = 0 } = request.query;

    try {
      // Validate customer exists
      const customer = await knex('customers').where({ customerId }).first();
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found.' });
      }

      // Construct the query
      let query = knex('orders').where({ customerId });

      if (status) {
        query = query.andWhere({ orderStatus: status });
      }

      if (startDate) {
        query = query.andWhere('orderDate', '>=', new Date(startDate));
      }

      if (endDate) {
        query = query.andWhere('orderDate', '<=', new Date(endDate));
      }

      const orders = await query
          .orderBy('orderDate', 'desc') // Default sorting by order date
          .limit(parseInt(limit))
          .offset(parseInt(offset));

      if (!orders.length) {
        return reply.status(404).send({ error: 'No orders found.' });
      }

      // Fetch order items for each order
      const orderDetails = await Promise.all(
          orders.map(async order => {
            const items = await knex('order_items as oi')
                .join('products as p', 'oi.productId', 'p.productId')
                .where('oi.orderId', order.orderId)
                .select(
                    'oi.productId',
                    'oi.quantity',
                    'p.productName',
                    'p.price',
                    'p.mediaItems'
                );

            return {
              ...order,
              items,
            };
          })
      );
      console.log('line61, orderDetails: ', orderDetails);
      return reply.send(orderDetails);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch order history.' });
    }
  });
}
