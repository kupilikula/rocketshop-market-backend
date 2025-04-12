'use strict'

const knex = require("@database/knexInstance");
const { v4: uuidv4 } = require('uuid');
const TokenService = require('../../../services/TokenService')

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

        await TokenService.replyWithAuthTokens(reply, customer);
    });
}

const generateCustomerHandle = async (fullName) => {
    const baseHandle = fullName
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '') // remove special chars
        .trim()
        .replace(/\s+/g, '_'); // replace spaces with underscores

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