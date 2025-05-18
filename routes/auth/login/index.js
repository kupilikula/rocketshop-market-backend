'use strict'

const knex = require("@database/knexInstance");
const TokenService = require('../../../services/TokenService')
const {OTP_EXPIRY_MINUTES} = require("../../../utils/constants");
const {isValidEmail, isValidE164Phone} = require("../../../utils/validateIdentifier");

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
        const { identifier, type, otp} = request.body;

        if (!identifier || !type || !otp ) {
            return reply.status(400).send({ error: 'Phone/Email and OTP are required' });
        }

        if (type === 'email' && !isValidEmail(identifier)) {
            return reply.status(400).send({ message: 'Invalid email format.' });
        } else if (type === 'phone' && !isValidE164Phone(identifier)) {
            return reply.status(400).send({ message: 'Invalid phone number format. Expected E.164 (e.g., +919876543210).' });
        }

        // Verify OTP
        let otpQuery = knex('otp_verification')
            .where({
                context: 'AUTH_LOGIN', // Login flow uses AUTH_LOGIN context
                app: 'marketplace',
                identifier_type: type,
                otp: otp // Match the OTP itself
            })
            .orderBy('created_at', 'desc')
            .first();

        if (type === 'phone') {
            otpQuery = otpQuery.andWhere({ phone: identifier });
        } else { // type === 'email'
            otpQuery = otpQuery.andWhere({ email: identifier });
        }
        const otpRecord = await otpQuery;

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
        let userQuery = knex('customers');
        if (type === 'phone') {
            userQuery = userQuery.where({ phone: identifier });
        } else if (type==='email'){
            userQuery = userQuery.where({ email: identifier });
        }
        const customer = await userQuery.first();

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
