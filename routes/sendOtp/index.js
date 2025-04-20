'use strict'

const knex = require("@database/knexInstance");
const {OTP_PUBLIC_CONTEXTS, OTP_PRIVATE_CONTEXTS} = require("../../utils/OtpContexts");
const smsService = require("../../services/SMSService");
const {getOtpText} = require("../../utils/getOtpText");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { phone, context } = request.body;

        if (!phone || !context) {
            return reply.status(400).send({ error: 'Phone number and context is required' });
        }

        const isPublicContext = OTP_PUBLIC_CONTEXTS.includes(context);
        const isPrivateContext = OTP_PRIVATE_CONTEXTS.includes(context);

        if (!isPublicContext && !isPrivateContext) {
            return reply.status(400).send({ error: 'Invalid context' });
        }

        // For private contexts, user must be authenticated
        if (isPrivateContext && !request.user) {
            return reply.status(401).send({ error: 'Unauthorized: This action requires authentication.' });
        }

        // Private context specific code
        // if (context==='DELETE_ACCOUNT') {
        //
        // }
        // if (context==='CANCEL_ORDER') {
        //
        // }


        // Generate random 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store in otp_verification table
        await knex('otp_verification').insert({
            phone,
            otp,
            app: 'marketplace',
            context,
            isVerified: false,
            created_at: knex.fn.now()
        });

        // OPTIONAL: Integrate SMS sending here
        console.log(`Sending OTP ${otp} to phone ${phone}`);

        // Generate OTP message and send SMS
        try {
            const message = getOtpText(otp);
            await smsService.sendSMS(request.body.phone, message);
        } catch (error) {
            console.error('Failed to send OTP SMS:', error);
            // Optionally, you might want to delete the OTP record if SMS fails
            await knex('otp_verification')
                .where({ phone: request.body.phone, otp })
                .delete();
            return reply.status(500).send({ error: 'Failed to send OTP' });
        }


        if (context==='AUTH_LOGIN') {
            // Check if user already exists
            const existingCustomer = await knex('customers')
                .where({phone})
                .first();

            return reply.status(200).send({
                isRegistered: !!existingCustomer // true or false
            });
        }
    });
}
