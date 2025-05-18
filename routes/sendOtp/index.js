'use strict'

const knex = require("@database/knexInstance");
const {OTP_PUBLIC_CONTEXTS, OTP_PRIVATE_CONTEXTS} = require("../../utils/OtpContexts");
const smsService = require("../../services/SMSService");
// const emailService = require("../../services/EmailService"); // Assuming you create this
const {getOtpText} = require("../../utils/getOtpText");
const {isValidEmail, isValidE164Phone} = require("../../utils/validateIdentifier");


module.exports = async function (fastify, opts) {
    fastify.post('/',
        {
            config: {
                rateLimit: {
                    max: 5,                    // Max 5 OTP requests
                    timeWindow: '10m',  // Per 10 minutes
                }
            }
        },
        async function (request, reply) {
        const { identifier, type, context } = request.body;

        if (!identifier || !type || !context) {
            return reply.status(400).send({ error: 'Identifier (Phone number / Email) and context is required' });
        }

            if (type === 'email' && !isValidEmail(identifier)) {
                return reply.status(400).send({ message: 'Invalid email format.' });
            } else if (type === 'phone' && !isValidE164Phone(identifier)) {
                // Assuming E.164 format for international numbers from your frontend PhoneInput
                // Adjust validation if your phone format expectation is different
                return reply.status(400).send({ message: 'Invalid phone number format. Expected E.164 (e.g., +919876543210).' });
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
            phone: type === 'phone' ? identifier : null,
            email: type === 'email' ? identifier : null,
            otp,
            app: 'marketplace',
            context,
            isVerified: false,
            created_at: knex.fn.now()
        });

        // OPTIONAL: Integrate SMS sending here
        console.log(`Sending OTP ${otp} to phone/email ${identifier}`);

        // Generate OTP message and send SMS
        // try {
        //     const message = getOtpText(otp);
        //      if (type === 'email') {
        //          await emailService.sendOtpEmail(identifier, message); // Pass context if template varies
        //      } else {
        //          await smsService.sendSMS(request.body.phone, message);
        //      }
        // } catch (error) {
        //     console.error('Failed to send OTP :', error, identifier, type, context);
        //     // Optionally, you might want to delete the OTP record if SMS fails
        //      if (type==='phone') {
        //          await knex('otp_verification')
        //         .where({ phone: request.body.identifier, otp })
        //         .delete();
        //      } else if (type==='email') {
        //          await knex('otp_verification')
        //         .where({ email: request.body.identifier, otp })
        //         .delete();
        //
        //      }
        //     return reply.status(500).send({ error: 'Failed to send OTP' });
        // }


        if (context==='AUTH_LOGIN') {
            // Check if user already exists
            try {
                let existingCustomer = null;
                if (type === 'email') {
                    existingCustomer = await knex('customers')
                        .where({email: identifier})
                        .first();
                } else if (type === 'phone') {
                    existingCustomer = await knex('customers')
                        .where({phone: identifier})
                        .first();
                }

                return reply.status(200).send({
                    isRegistered: !!existingCustomer // true or false
                });
            } catch (error) {
                console.error('Failed to check if user exists :', error, identifier, type, context);
                return reply.status(500).send({ error: 'Failed to check if user exists' });
            }
        }
        return reply.status(200).send({ message: 'OTP sent successfully.' });
        });
}
