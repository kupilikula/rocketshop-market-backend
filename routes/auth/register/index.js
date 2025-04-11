'use strict'

const knex = require("@database/knexInstance");
const {replyWithAuthTokens} = require("../../../services/replyWithAuthTokens");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { phone, otp, fullName, app } = request.body;

        if (!phone || !otp || !fullName || !app || (app !== 'marketplace' && app !== 'merchant') ) {
            return reply.status(400).send({ error: 'Missing required fields' });
        }

        const existingCustomer = await knex('customers').where({ phone }).first();
        if (existingCustomer) {
            return reply.status(400).send({ error: 'User already registered' });
        }

        // Verify latest OTP
        const latestOtpRow = await knex('otp_verification')
            .where({ phone, app })
            .andWhere({ isVerified: true })
            .orderBy('created_at', 'desc')
            .first();

        if (!latestOtpRow || latestOtpRow.otp !== otp) {
            return reply.status(401).send({ error: 'Invalid or expired OTP' });
        }

        //Clear all OTPs for this user
        await knex('otp_verification').where({ phone }).del();

        // Create customer
        const [customer] = await knex('customers').insert({
            phone,
            fullName,
            created_at: knex.fn.now()
        }).returning('*');

        if (!customer) {
            return reply.status(500).send({ error: 'Failed to create customer' });
        }

        await replyWithAuthTokens(reply, customer);
    });
}