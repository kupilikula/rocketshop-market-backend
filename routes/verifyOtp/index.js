'use strict'

const knex = require("@database/knexInstance");
const {OTP_PUBLIC_CONTEXTS, OTP_PRIVATE_CONTEXTS} = require("../../utils/OtpContexts");
const {OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS} = require("../../utils/constants");
const {isValidEmail, isValidE164Phone} = require("../../utils/validateIdentifier");

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
        const { identifier, type, otp, context } = request.body;

        if (!identifier || !type || !otp || !context) {
            return reply.status(400).send({ error: 'Phone, OTP and context are required' });
        }

        // 1. Validate input (partially handled by schema, but good for explicit checks)
        if (type === 'email' && !isValidEmail(identifier)) {
            return reply.status(400).send({ message: 'Invalid email format.' });
        } else if (type === 'phone' && !isValidE164Phone(identifier)) {
            return reply.status(400).send({ message: 'Invalid phone number format. Expected E.164 (e.g., +919876543210).' });
        }

        const isPublicContext = OTP_PUBLIC_CONTEXTS.includes(context);
        const isPrivateContext = OTP_PRIVATE_CONTEXTS.includes(context);

        if (!isPublicContext && !isPrivateContext) {
            return reply.status(400).send({ error: 'Invalid context' });
        }
        // Require authentication for protected contexts
        if (isPrivateContext && !request.user) {
            return reply.status(401).send({ error: 'Unauthorized: This action requires authentication.' });
        }

        // Verify OTP
            // 2. Build query to find the OTP record
        let otpQuery = knex('otp_verification')
            .where({
                context,
                app: 'marketplace', // Use app from request or default
                identifier_type: type
            })
            .orderBy('created_at', 'desc')
            .first();

        if (type === 'phone') {
            otpQuery = otpQuery.andWhere({ phone: identifier });
        } else if (type==='email') {
            otpQuery = otpQuery.andWhere({ email: identifier });
        }

        const otpRecord = await otpQuery;

        console.log('otpRecord:' , otpRecord);
        console.log('otp:' , otp);

// 3. Validate OTP
            if (!otpRecord) {
                // No OTP record found for this identifier/type/context/app combination
                return reply.status(404).send({ message: 'OTP not found or initial details mismatch. Please request a new OTP.' });
            }

            // Check if already verified
            if (otpRecord.isVerified) {
                return reply.status(400).send({ message: 'OTP has already been verified.' });
            }

            // Check for expiry
            const createdAt = new Date(otpRecord.created_at);
            const expiresAt = new Date(createdAt.getTime() + OTP_EXPIRY_MINUTES * 60000);

            if (expiresAt < new Date()) {
                return reply.status(400).send({ message: 'OTP has expired. Please request a new one.' });
            }

            // Check OTP match and attempt counts
            if (otpRecord.otp !== otp) {
                const newAttemptCount = otpRecord.attemptCount + 1;
                await knex('otp_verification')
                    .where({ otpId: otpRecord.otpId })
                    .update({ attemptCount: newAttemptCount });

                if (newAttemptCount >= MAX_OTP_ATTEMPTS) { // Use constant for max attempts
                    // Optionally, you might want to invalidate this OTP record permanently now
                    // await knex('otp_verification').where({ otpId: otpRecord.otpId }).update({ isVerified: true, /* or a new status like 'locked' */ });
                    return reply.status(429).send({ message: 'Too many failed attempts. Please request a new OTP.' });
                }
                return reply.status(403).send({ message: 'Invalid OTP. Please try again.' });
            }

            // 4. Success: Mark OTP as verified
            try {
                await knex('otp_verification')
                    .where({ otpId: otpRecord.otpId })
                    .update({ isVerified: true });

                return reply.status(200).send({ success: true, message: 'OTP verified successfully.' });
            } catch (dbError) {
                fastify.log.error({ msg: 'Failed to update OTP as verified', error: dbError, otpId: otpRecord.otpId });
                return reply.status(500).send({ message: 'Failed to finalize OTP verification due to a server error.' });
            }
    });
}
