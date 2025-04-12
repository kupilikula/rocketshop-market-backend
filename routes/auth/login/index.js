'use strict'

const knex = require("@database/knexInstance");
const TokenService = require('../../../services/TokenService')

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { phone, otp, app } = request.body;

        if (!phone || !otp || !app || (app !== 'marketplace')) {
            return reply.status(400).send({ error: 'Phone, OTP and app are required' });
        }

        // Verify OTP
        const otpRecord = await knex('otp_verification')
            .where({ phone, app })
            .andWhere({ isVerified: true })
            .orderBy('created_at', 'desc')
            .first();

        if (!otpRecord || otpRecord.otp !== otp) {
            return reply.status(401).send({ error: 'Invalid OTP' });
        }

        await knex('otp_verification').where({ phone }).del();

        // Check if user exists
        const customer = await knex('customers')
            .where({ phone })
            .first();

        if (!customer) {
            // New user — Frontend should call /auth/register next
            return reply.status(200).send({ isRegistered: false });
        }


        // Existing customer — Generate Tokens
        await TokenService.replyWithAuthTokens(reply, customer);
    });
}
