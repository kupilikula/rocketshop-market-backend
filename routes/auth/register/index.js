'use strict'

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid');
const TokenService = require('../../../services/TokenService')
const {OTP_EXPIRY_MINUTES} = require("../../../utils/constants");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { phone, otp, fullName } = request.body;

        if (!phone || !otp || !fullName ) {
            return reply.status(400).send({ error: 'Missing required fields' });
        }

        const existingCustomer = await knex('customers').where({ phone }).first();
        if (existingCustomer) {
            return reply.status(400).send({ error: 'User already registered' });
        }

        // Verify latest OTP
        const latestOtpRow = await knex('otp_verification')
            .where({ phone, app: 'marketplace', context: 'AUTH_LOGIN' })
            .orderBy('created_at', 'desc')
            .first();

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
        await knex('otp_verification').where({ phone, app: 'marketplace', context: 'AUTH_LOGIN'}).del();

        const customerId = uuidv4();
        const customerHandle = await generateCustomerHandle(fullName);

        // Create customer
        const [customer] = await knex('customers').insert({
            customerId,
            customerHandle,
            phone,
            fullName,
            created_at: knex.fn.now()
        }).returning('*');

        if (!customer) {
            return reply.status(500).send({ error: 'Failed to create customer' });
        }

        //Create recipient for the new customer
        await knex('recipients').insert({
            recipientId: uuidv4(),
            customerId: customer.customerId,
            fullName: null,
            phone: null,
            type: 'SELF',
            isDefaultRecipient: true,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now()
        });

        await TokenService.replyWithAuthTokens(reply, customer, {cartData: null});
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