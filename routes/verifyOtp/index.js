'use strict'

const knex = require("@database/knexInstance");
const {OTP_PUBLIC_CONTEXTS, OTP_PRIVATE_CONTEXTS} = require("../../utils/OtpContexts");
const {OTP_EXPIRY_MINUTES} = require("../../utils/constants");

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
        const { phone, otp, context } = request.body;

        if (!phone || !otp || !context) {
            return reply.status(400).send({ error: 'Phone, OTP and context are required' });
        }

        const isPublicContext = OTP_PUBLIC_CONTEXTS.includes(context);
        const isPrivateContext = OTP_PRIVATE_CONTEXTS.includes(context);

        if (!isPublicContext && !isPrivateContext) {
            return reply.status(400).send({ error: 'Invalid context' });
        }
        // Require authentication for protected contexts
        if (!isPublicContext && !request.user) {
            return reply.status(401).send({ error: 'Unauthorized: This action requires authentication.' });
        }

        // Verify OTP
        const otpRecord = await knex('otp_verification')
            .where({ phone, app: 'marketplace', context })
            .orderBy('created_at', 'desc')
            .first();

        console.log('otpRecord:' , otpRecord);
        console.log('otp:' , otp);

        if (!otpRecord || otpRecord.otp !== otp) {
            if (otpRecord) {
                console.log('otpRecord.attemptCount:', otpRecord.attemptCount);
                await knex('otp_verification')
                    .where({otpId: otpRecord.otpId})
                    .update({attemptCount: otpRecord.attemptCount + 1});

                if ((otpRecord.attemptCount + 1) >= 5) {
                    return reply.status(429).send({error: 'Too many failed attempts. Please request a new OTP.'});
                }
            }
            return reply.status(403).send({ error: 'Invalid OTP' });
        }

        const created_at = new Date(otpRecord.created_at);
        const expires_at = new Date(created_at.getTime() + OTP_EXPIRY_MINUTES * 60000); // 5 min expiry

        if (expires_at < new Date()) {
            return reply.status(400).send({ error: 'OTP expired' });
        }

        if (otpRecord.isVerified) {
            return reply.status(400).send({ error: 'OTP already verified' });
        }

        // Success → mark OTP as verified
        await knex('otp_verification')
            .where({ otpId: otpRecord.otpId })
            .update({ isVerified: true });

        return reply.status(200).send({ success: true });

    });
}
