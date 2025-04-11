const crypto = require('crypto');
const knex = require("@database/knexInstance");
const jwt = require('jsonwebtoken');
const {decode} = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

const TokenService = {
// Generate JWT

    generateAccessToken(payload) {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '6h' }); // Short-lived access token
    },

    generateRefreshToken(payload) {
        return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' }); // Long-lived refresh token
    },

    verifyAccessToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    },

    verifyRefreshToken(token) {
        try {
            return jwt.verify(token, JWT_REFRESH_SECRET);
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    },

    async storeRefreshToken(userId, refreshToken, expiresAt) {
        const tokenHash = hashToken(refreshToken);
        await knex('refresh_tokens').insert({
            userId: userId,
            tokenHash: tokenHash,
            expires_at: expiresAt,
        });
    },

    async checkRefreshToken(userId, refreshToken) {
        const tokenHash = hashToken(refreshToken);
        const token = await knex('refresh_tokens')
            .where({
                userId: userId,
                tokenHash: tokenHash,
            })
            .andWhere('expires_at', '>', new Date())
            .first();

        return token !== undefined;
    },

    async deleteRefreshToken(userId, refreshToken) {
        const tokenHash = hashToken(refreshToken);
        await knex('refresh_tokens')
            .where({
                userId: userId,
                tokenHash: tokenHash,
            })
            .del();
    },

    async deleteAllRefreshTokensForUser(userId) {
        await knex('refresh_tokens')
            .where({
                userId: userId,
            })
            .del();
    },
    async replyWithAuthTokens(reply, customer) {
        const payload = { customerId: customer.customerId };

        const accessToken = this.generateAccessToken(payload);
        const refreshToken = this.generateRefreshToken({ userId: customer.customerId });

        const decodedRefreshToken = decode(refreshToken);
        const expiresAt = new Date(decodedRefreshToken.exp * 1000);

        await this.storeRefreshToken(customer.customerId, refreshToken, expiresAt);

        reply.status(200)
            .setCookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: true,
                path: '/auth',
                sameSite: 'Strict',
            })
            .send({ accessToken, customer });
    }
};

module.exports = TokenService;