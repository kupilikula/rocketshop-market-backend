'use strict'

const path = require('node:path')
const AutoLoad = require('@fastify/autoload')
const cors = require('@fastify/cors')
const {verifyAccessToken} = require("./services/TokenService");


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
    const publicRoutes = ['/login', '/refreshToken'];
    const routePath = request.raw.url.split('?')[0]; // Get the path without query parameters
    console.log('routePath:', routePath);
    // Check if the current route is public
    if (publicRoutes.includes(routePath)) {
      console.log('skipping auth for login');
      return; // Skip authentication for public routes
    }
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split(' ')[1]; // Extract token from Bearer header
    try {
      const user = verifyAccessToken(token); // Verify token
      console.log('jwt user:', user);
      request.user = user; // Attach user to request object
    } catch (error) {
      return reply.status(401).send({ error: 'Unauthorized: Invalid token' });
    }
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
