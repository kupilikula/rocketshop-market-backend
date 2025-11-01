'use strict';

const knex = require('@database/knexInstance');

module.exports = async function (fastify, opts) {
  fastify.post('/', async (request, reply) => {
    const {
      storeId,
      customerId,
      orderItems,
      orderSubTotal,
      gst,
      discount = 0,
      shipping = 0,
      orderTotal,
      orderDate = new Date(),
      orderCurrentStatus = 'open',
    } = request.body;

    try {
      // Validate the store exists and is active
      const store = await knex('stores')
          .where({ storeId, isActive: true })
          .first();

      if (!store) {
        return reply.status(404).send({ error: 'Store not found or inactive.' });
      }

      // Ensure the customer exists
      const customer = await knex('customers')
          .where({ customerId })
          .first();

      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found.' });
      }

      // Validate products in the orderItems array
      const productIds = orderItems.map(item => item.productId);
      const products = await knex('products')
          .whereIn('productId', productIds)
          .andWhere({ isActive: true });

      if (products.length !== productIds.length) {
        return reply.status(400).send({ error: 'Some products are not available or inactive.' });
      }

      // Insert the order into the orders table
      const [newOrderId] = await knex('orders')
          .insert({
            storeId,
            customerId,
            orderDate,
            orderCurrentStatus,
            orderCurrentStatusUpdateTimestamp: new Date(),
            orderSubTotal,
            gst,
            discount,
            shipping,
            orderTotal,
          })
          .returning('orderId');

      // Insert items into the order_items table
      const orderItemInserts = orderItems.map(item => ({
        orderId: newOrderId,
        productId: item.productId,
        quantity: item.quantity,
      }));
      await knex('order_items').insert(orderItemInserts);

      return reply.send({
        message: 'Order created successfully.',
        orderId: newOrderId,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to create order.' });
    }
  });

  fastify.get('/', async (request, reply) => {
    const customerId = request.user.customerId;
    const { status, startDate, endDate, limit = 20, offset = 0 } = request.query;

    try {
      // Validate customer exists
      const customer = await knex('customers').where({ customerId }).first();
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found.' });
      }

      // Construct the query to fetch orders with store details
      let query = knex('orders as o')
          .join('stores as s', 'o.storeId', 's.storeId') // Join with stores table
          .where('o.customerId', customerId)
          .select(
              'o.*', // All columns from orders
              's.storeName',
              's.storeLogoImage' // Include store name and logo
          );

      if (status) {
        query = query.andWhere({ 'o.orderStatus': status });
      }

      if (startDate) {
        query = query.andWhere('o.orderDate', '>=', new Date(startDate));
      }

      if (endDate) {
        query = query.andWhere('o.orderDate', '<=', new Date(endDate));
      }

      const orders = await query
          .orderBy('o.orderDate', 'desc') // Default sorting by order date
          .limit(parseInt(limit))
          .offset(parseInt(offset));

      // if (!orders.length) {
      //   return reply.status(404).send({ error: 'No orders found.' });
      // }

      // Fetch order items for each order
      const orderDetails = await Promise.all(
          orders.map(async (order) => {
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

      return reply.send(orderDetails);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch order history.' });
    }
  });
};