'use strict'

const {checkRefreshToken, storeRefreshToken, deleteRefreshToken, verifyRefreshToken, generateAccessToken, generateRefreshToken} = require("../../../services/TokenService");
const {decode} = require("jsonwebtoken");


module.exports = async function (fastify, opts) {
    fastify.post('/',
        {
            config: {
                rateLimit: {
                    max: 1,                    // Max 5 OTP requests
                    timeWindow: '1m',  // Per 10 minutes
                }
            }
        },
        async (request, reply) => {
        const refreshToken = request.cookies.refreshToken; // Read token from HTTP-only cookie

        if (!refreshToken) {
            return reply.status(401).send({ error: 'Unauthorized: Missing refresh token' });
        }

        try {
            // Verify refresh token
            const payload = verifyRefreshToken(refreshToken);

            // Check if refresh token exists in the database
            const isValid = await checkRefreshToken(payload.userId, refreshToken); // Example: Check DB
            if (!isValid) {
                return reply.status(401).send({ error: 'Unauthorized: Invalid refresh token' });
            }

            // Generate new access token
            const newAccessToken = generateAccessToken({ customerId: payload.userId });
            const newRefreshToken = generateRefreshToken({ userId: payload.userId });

            // Decode new refresh token to get expiresAt
            const decodedRefreshToken = decode(newRefreshToken);
            const expiresAt = new Date(decodedRefreshToken.exp * 1000); // Convert `exp` to milliseconds

            //Store new refresh token and delete old one
            await storeRefreshToken(payload.userId, newRefreshToken, expiresAt);
            await deleteRefreshToken(payload.userId, refreshToken); // Invalidate old token

            return reply.setCookie('refreshToken', newRefreshToken, {
                httpOnly: true, // Prevent client-side access
                secure: true, // Use HTTPS in production
                path: '/auth', // Restrict usage
                sameSite: 'None', // Prevent CSRF attacks
            }).send({ accessToken: newAccessToken });
        } catch (error) {
            return reply.status(401).send({ error: 'Unauthorized: Invalid or expired refresh token' });
        }
    });
}
