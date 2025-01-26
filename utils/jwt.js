const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Generate JWT
function generateJWT(payload, expiresIn = '1d') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Verify JWT
function verifyJWT(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
}

module.exports = { generateJWT, verifyJWT };