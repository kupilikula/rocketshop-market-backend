'use strict'

const {deleteRefreshToken} = require("../../services/TokenService");
module.exports = async function (fastify, opts) {
    fastify.post('/', async (request, reply) => {
        const refreshToken = request.cookies.refreshToken;

        if (refreshToken) {
            await deleteRefreshToken(refreshToken); // Example: Remove from DB
            reply.clearCookie('refreshToken');
        }

        return reply.send({ message: 'Logged out successfully' });
    });
}
