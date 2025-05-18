'use strict'

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid');
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
        const { identifier, type, otp, fullName } = request.body;

        if (!identifier || !type || !otp || !fullName ) {
            return reply.status(400).send({ error: 'Missing required fields' });
        }

        if (type === 'email' && !isValidEmail(identifier)) {
            return reply.status(400).send({ message: 'Invalid email format.' });
        } else if (type === 'phone' && !isValidE164Phone(identifier)) {
            return reply.status(400).send({ message: 'Invalid phone number format. Expected E.164 (e.g., +919876543210).' });
        }
        if (!fullName.trim()) {
            return reply.status(400).send({ message: 'Full name cannot be empty.' });
        }

        // 2. Check if user already exists
        let existingUserQuery = knex('customers');
        if (type === 'phone') {
            existingUserQuery = existingUserQuery.where({ phone: identifier });
        } else { // type === 'email'
            existingUserQuery = existingUserQuery.where({ email: identifier });
        }

        const existingCustomer = await existingUserQuery.first();
        if (existingCustomer) {
            return reply.status(409).send({ error: 'User already registered' });
        }

        // Verify latest OTP
        let otpQuery = knex('otp_verification')
            .where({
                context: 'AUTH_LOGIN', // Assuming registration flow uses AUTH_LOGIN context
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
        const latestOtpRow = await otpQuery;

        if (!latestOtpRow || latestOtpRow.otp !== otp || !latestOtpRow.isVerified) {
            return reply.status(401).send({ error: 'Invalid or expired OTP' });
        }

        // Optional: Check OTP expiry again for safety
        const createdAt = new Date(latestOtpRow.created_at);
        const expiresAt = new Date(createdAt.getTime() + OTP_EXPIRY_MINUTES * 60000);
        if (expiresAt < new Date()) {
            return reply.status(400).send({ error: 'OTP has expired' });
        }

        //Clear all OTPs for this phone, app and context
        // await knex('otp_verification').where({ phone, app: 'marketplace', context: 'AUTH_LOGIN'}).del();

        const customerId = uuidv4();
        const customerHandle = await generateCustomerHandle(fullName);

            try {
                // Perform all inserts in a single transaction
                const customer = await knex.transaction(async (trx) => {
                    // Insert into customers
                    await trx('customers').insert({
                        customerId,
                        customerHandle,
                        phone: type === 'phone' ? identifier : null,
                        email: type === 'email' ? identifier : null,
                        fullName,
                        created_at: knex.fn.now(),
                        updated_at: knex.fn.now() // Also set updated_at on creation
                    });

                    // Insert default preferences
                    await trx('customerNotificationPreferences').insert({
                        customerId,
                        orderStatus: true,
                        orderDelivery: true,
                        chatMessages: true,
                        miscellaneous: true,
                        muteAll: false,
                        created_at: knex.fn.now(),
                        updated_at: knex.fn.now(),
                    });

                    // Insert default SELF recipient
                    await trx('recipients').insert({
                        recipientId: uuidv4(),
                        customerId,
                        fullName: null,
                        phone: null,
                        type: 'SELF',
                        isDefaultRecipient: true,
                        created_at: knex.fn.now(),
                        updated_at: knex.fn.now(),
                    });

                    // Return created customer (for auth token generation)
                    return trx('customers').where({ customerId }).first();
                });

                if (!customer) {
                    return reply.status(500).send({ error: 'Failed to create customer' });
                }

                await TokenService.replyWithAuthTokens(reply, customer, { cartData: null });

            } catch (error) {
                request.log.error(error);
                return reply.status(500).send({ error: 'Failed to create customer' });
            }
    });
}

const generateCustomerHandle = async (fullName) => {
    const baseHandle = fullName
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '') // remove special chars
        .trim()
        .replace(/\s+/g, ''); // remove spaces

    let handle = baseHandle;
    let suffix = 1;

    while (true) {
        const existing = await knex('customers')
            .where('customerHandle', handle)
            .first();

        if (!existing) {
            return handle;
        }

        handle = `${baseHandle}${suffix}`;
        suffix++;
    }
};