const crypto = require('crypto');
const knex = require("@database/knexInstance");
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

const TokenService = {
// Generate JWT

    generateAccessToken(payload) {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '1m' }); // Short-lived access token
    },

    generateRefreshToken(payload) {
        return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '5m' }); // Long-lived refresh token
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
};

module.exports = TokenService;