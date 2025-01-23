'use strict'

const path = require('node:path')
const AutoLoad = require('@fastify/autoload')
const cors = require('@fastify/cors')


// Pass --options via CLI arguments in command to enable these options.
const options = {}

module.exports = async function (fastify, opts) {
  // Place here your custom code!

  fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], // Headers allowed
    credentials: true // Allow cookies and Authorization headers
  });

  fastify.decorateRequest('user', null); // Decorate the request with a user property

  fastify.addHook('onRequest', async (request, reply) => {
    // const token = request.headers.authorization?.split(' ')[1]; // Extract token from Bearer header
    // if (!token) {
    //   return reply.status(401).send({ error: 'Unauthorized' });
    // }

    // try {
    // const user = jwt.verify(token, JWT_SECRET); // Verify the token
    console.log('authorization:', request.headers.authorization);
    console.log('auth:', request.headers.authorization.split('='));
    const auth = request.headers.authorization.split('=');
    console.log('auth:', auth);
    if (auth[0]==='merchantId') {
      request.user = {merchantId: auth[1]}
    } else if (auth[0]==='customerId') {
      request.user = {customerId: auth[1]}
    }

    // const customerId = request.headers.authorization;
    // request.user = {customerId: customerId}; // Attach the user to the request object
    // } catch (err) {
    //   return reply.status(401).send({ error: 'Invalid token' });
    // }
  });

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: Object.assign({}, opts)
  })

  // This loads all plugins defined in routes
  // define your routes in one of these
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: Object.assign({}, opts)
  })
}

module.exports.options = options
