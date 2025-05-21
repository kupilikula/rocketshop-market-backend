'use strict'

const path = require('node:path')
const AutoLoad = require('@fastify/autoload')
const cors = require('@fastify/cors')
const {verifyAccessToken} = require("./services/TokenService");


// Pass --options via CLI arguments in command to enable these options.
const options = {}

module.exports = async function (fastify, opts) {
  // Place here your custom code!

  const allowedOrigins = [
    'http://localhost:8082', // Your Expo web dev server (default port)
    'http://localhost:8081', // Your Expo web dev server (default port)
    'http://localhost:8080', // Another common Expo web port
    'http://localhost:19006',// Another common Expo web port for Metro
    'https://qa.rocketshop.in',   // Your production frontend domain
    'https://rocketshop.in',   // Your production frontend domain
    // Add any other origins you need to support (e.g., staging domains)
  ];

  fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      // or if the origin is in our allowlist
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true); // Reflects the request origin in Access-Control-Allow-Origin
                              // or you can pass the specific 'origin' value: callback(null, origin);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Ensure OPTIONS is included
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    // exposedHeaders: ['Content-Length', 'X-Kuma-Revision'], // Optional: if your frontend needs to access other headers
  });

  fastify.register(require('@fastify/rate-limit'), {
    global: true,              // ✅ Apply to all routes by default
    max: 100,                  // ✅ Default: 100 requests
    timeWindow: '1 minute',    // ✅ Per minute
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true
    }
  });

  fastify.decorateRequest('user', null); // Decorate the request with a user property

  fastify.addHook('onRequest', async (request, reply) => {
    const publicRoutes = [
        '/health',
      '/auth/login',
      '/auth/refreshToken',
      '/auth/logout',
      '/auth/register',
      '/sendOtp',
      '/verifyOtp',
      '/cartSummary',
      '/checkOfferCode',
      '/collections',
      '/getApplicableOffers',
      '/products',
      '/stores',
      '/search',
      '/validateCartItem'
      // add more guest-allowed routes as needed
    ];

    const routePath = request.raw.url.split('?')[0]; // Get the path without query params
    console.log('routePath:', routePath);

    const isPublic = publicRoutes.some(publicRoute =>
        routePath === publicRoute || routePath.startsWith(publicRoute + '/')
    );
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      if (isPublic) {
        console.log('Guest access allowed:', routePath);
        request.user = null; // treat as guest
        return;
      } else {
        return reply.status(401).send({ error: 'Unauthorized: Missing token',  tryTokenRefresh: true });
      }
    }

    const token = authHeader.split(' ')[1];

    try {
      const user = verifyAccessToken(token); // your existing JWT verification function
      console.log('jwt user:', user);
      request.user = user;
    } catch (error) {
      if (isPublic) {
        console.log('No valid token, treating as guest for public route:', routePath);
        request.user = null; // treat as guest if it's a public route
      } else {
        return reply.status(401).send({ error: 'Unauthorized: Invalid token',  tryTokenRefresh: true });
      }
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
