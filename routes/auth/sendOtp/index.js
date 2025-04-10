'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { phone, app } = request.body;

        if (!phone || !app || (app !== 'marketplace' && app !== 'merchant')) {
            return reply.status(400).send({ error: 'Phone number and app name is required' });
        }


        // Generate random 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store in otp_verification table
        await knex('otp_verification').insert({
            phone,
            otp,
            app,
            created_at: knex.fn.now()
        });

        // OPTIONAL: Integrate SMS sending here
        console.log(`Sending OTP ${otp} to phone ${phone}`);

        // Check if user already exists
        const existingCustomer = await knex('customers')
            .where({ phone })
            .first();

        return reply.status(200).send({
            isRegistered: !!existingCustomer // true or false
        });
    });
}
