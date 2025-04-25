'use strict'

const knex = require('@database/knexInstance');
const {deleteRefreshToken, verifyRefreshToken, deleteAllRefreshTokensForUser} = require("../../../services/TokenService");

module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const refreshToken = request.cookies.refreshToken;
        const {expoPushToken} = request.body;
        const { customerId } = request.user;

        if (!refreshToken || !customerId) {
            return reply.status(400).send({ error: 'Bad Request: No refresh token  or customerId found' });
        }

        try {
            // Verify the refresh token to extract the userId
            const payload = verifyRefreshToken(refreshToken);

            // Delete all refresh tokens for the user
            await deleteAllRefreshTokensForUser(payload.userId);

            // 🧹 Delete the push token if provided
            if (expoPushToken) {
                await knex("customerPushTokens")
                    .where({ customerId, expoPushToken })
                    .del();
            }
            // Clear the refreshToken cookie
            reply.clearCookie('refreshToken', {
                httpOnly: true,
                secure: true, // Ensure this is true in production
                sameSite: 'Strict',
                path: '/auth',
            });

            return reply.send({ message: 'Logged out successfully' });
        } catch (error) {
            console.error('Error during logout:', error);
            return reply.status(401).send({ error: 'Unauthorized: Invalid or expired refresh token' });
        }
    });
}
