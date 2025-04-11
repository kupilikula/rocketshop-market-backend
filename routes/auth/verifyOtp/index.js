'use strict'

const knex = require("@database/knexInstance");

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { phone, otp, app } = request.body;

        if (!phone || !otp || !app || (app !== 'marketplace' && app !== 'merchant')) {
            return reply.status(400).send({ error: 'Phone, OTP and app are required' });
        }

        // Verify OTP
        const otpRecord = await knex('otp_verification')
            .where({ phone, app })
            .orderBy('created_at', 'desc')
            .first();

        console.log('otpRecord:' , otpRecord);
        console.log('otp:' , otp);
        if (!otpRecord || otpRecord.otp !== otp) {
            return reply.status(401).send({ error: 'Invalid OTP' });
        }

        const OTP_EXPIRY_MINUTES = 10;
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
