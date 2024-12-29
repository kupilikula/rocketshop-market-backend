'use strict'

module.exports = async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    return 'App is running.'
  });
  fastify.post('/', async function (request, reply) {
    console.log('request.body:', request.body);
  })
}
