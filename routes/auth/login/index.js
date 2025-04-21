'use strict'

const knex = require("@database/knexInstance");
const TokenService = require('../../../services/TokenService')
const {OTP_EXPIRY_MINUTES} = require("../../../utils/constants");

module.exports = async function (fastify, opts) {
    fastify.post('/',
        {
            config: {
                rateLimit: {
                    max: 10,                    // Max 5 OTP requests
                    timeWindow: '10m',  // Per 10 minutes
                }
            }
        },
        async function (request, reply) {
        const { phone, otp} = request.body;

        if (!phone || !otp ) {
            return reply.status(400).send({ error: 'Phone and OTP are required' });
        }

        // Verify OTP
        const otpRecord = await knex('otp_verification')
            .where({ phone, app: 'marketplace', context: 'AUTH_LOGIN' })
            .orderBy('created_at', 'desc')
            .first();

        if (!otpRecord || otpRecord.otp !== otp || !otpRecord.isVerified) {
            return reply.status(401).send({ error: 'Invalid OTP' });
        }

        // Optional: Check OTP expiration again for safety (if you want)
        const createdAt = new Date(otpRecord.created_at);
        const expiresAt = new Date(createdAt.getTime() + OTP_EXPIRY_MINUTES * 60000);
        if (expiresAt < new Date()) {
            return reply.status(400).send({ error: 'OTP has expired' });
        }

        // Check if user exists
        const customer = await knex('customers')
            .where({ phone })
            .first();

        if (!customer) {
            // New user — Frontend should call /auth/register next
            return reply.status(200).send({ isRegistered: false });
        }

        // Clear all tokens for this context, phone and app
        // await knex('otp_verification').where({ phone, app: 'marketplace', context: 'AUTH_LOGIN' }).del();

        // Get saved cartData (if any)
        const cartRow = await knex('customer_carts')
            .where({ customerId: customer.customerId })
            .orderBy('updated_at', 'desc')
            .first();

        const cartData = cartRow?.cartData || null;
        console.log('cartData:', cartData);

        // Existing customer — Generate Tokens
        await TokenService.replyWithAuthTokens(reply, customer, { cartData });
    });
}
