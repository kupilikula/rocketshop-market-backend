'use strict'

const knex = require("@database/knexInstance");
const {
    storeRefreshToken,
    generateAccessToken,
    generateRefreshToken
} = require("../../../services/TokenService");
const { decode } = require("jsonwebtoken");
const {replyWithAuthTokens} = require("../../../services/replyWithAuthTokens");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { phone, otp, name, address, app } = request.body;

        if (!phone || !otp || !name || !address || !app || (app !== 'marketplace' && app !== 'merchant') ) {
            return reply.status(400).send({ error: 'Missing required fields' });
        }

        const existingCustomer = await knex('customers').where({ phone }).first();
        if (existingCustomer) {
            return reply.status(400).send({ error: 'User already registered' });
        }

        // Verify latest OTP
        const latestOtpRow = await knex('otp_verification')
            .where({ phone, app })
            .orderBy('created_at', 'desc')
            .first();

        if (!latestOtpRow || latestOtpRow.otp !== otp) {
            return reply.status(401).send({ error: 'Invalid or expired OTP' });
        }

        // Create customer
        const [customerId] = await knex('customers').insert({
            phone,
            name,
            address,
            created_at: knex.fn.now()
        }).returning('customerId');

        const customer = await knex('customers').where({ customerId }).first();

        await replyWithAuthTokens(reply, customer);
    });
}