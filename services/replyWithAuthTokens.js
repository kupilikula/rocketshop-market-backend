const {
    generateAccessToken,
    generateRefreshToken,
    storeRefreshToken
} = require("./TokenService");
const { decode } = require("jsonwebtoken");

module.exports = async function replyWithAuthTokens(reply, customer) {
    const payload = { customerId: customer.customerId };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken({ userId: customer.customerId });

    const decodedRefreshToken = decode(refreshToken);
    const expiresAt = new Date(decodedRefreshToken.exp * 1000);

    await storeRefreshToken(customer.customerId, refreshToken, expiresAt);

    reply.status(200)
        .setCookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            path: '/auth',
            sameSite: 'Strict',
        })
        .send({ accessToken, customer });
};