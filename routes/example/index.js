'use strict'

module.exports = async function (fastify, opts) {
  fastify.get('/health', async function (request, reply) {
    return 'App is running.'
  });
  fastify.post('/invite', async function (request, reply) {
    console.log('request.body:', request.body);
  })
}
