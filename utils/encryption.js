// src/utils/encryption.js (CommonJS format)

const crypto = require('crypto'); // Use require for CommonJS

// Algorithm must match key length (e.g., aes-256-gcm requires a 32-byte key)
const ALGORITHM = 'aes-256-gcm';
// IV length recommended for GCM is 12 bytes
const IV_LENGTH = 12;
// Auth tag length GCM produces (16 bytes for AES-256)
const AUTH_TAG_LENGTH = 16;

// --- Retrieve and validate the encryption key ---
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
    console.error('FATAL ERROR: ENCRYPTION_KEY environment variable is missing or not a 64-character hex string (required for AES-256).');
    // Throwing an error or exiting might be appropriate in a real app during startup
    // For this example, we'll proceed but log a critical error.
    // throw new Error('Invalid ENCRYPTION_KEY configuration.');
}
// Convert hex key to Buffer only once
const key = ENCRYPTION_KEY_HEX ? Buffer.from(ENCRYPTION_KEY_HEX, 'hex') : Buffer.alloc(32); // Use alloc only as fallback during error logging phase
if (key.length !== 32 && process.env.NODE_ENV !== 'test') { // Allow incorrect length in tests if needed, but error otherwise
    console.error('FATAL ERROR: Encryption key buffer length is not 32 bytes.');
    // throw new Error('Invalid encryption key length.');
}
// --- ---

/**
 * Encrypts plaintext using AES-256-GCM.
 * @param {string} textToEncrypt - The plaintext string to encrypt.
 * @returns {string} A string combining IV, auth tag, and ciphertext, hex-encoded (format: ivHex:authTagHex:ciphertextHex). Returns empty string on error.
 */
function encryptText(textToEncrypt) { // Removed 'export' keyword
    if (!textToEncrypt) {
        return '';
    }
    if (!ENCRYPTION_KEY_HEX || key.length !== 32) {
        console.error("Encryption cannot proceed due to invalid key setup.");
        return ''; // Or throw error
    }

    try {
        // 1. Generate a unique Initialization Vector (IV) for each encryption
        const iv = crypto.randomBytes(IV_LENGTH);

        // 2. Create the AES-GCM cipher instance
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        // 3. Encrypt the plaintext (utf8 -> hex)
        let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // 4. Get the authentication tag (verifies integrity)
        const tag = cipher.getAuthTag();

        // 5. Combine IV, auth tag, and ciphertext into a single string for storage
        // Format: iv_hex:authTag_hex:encrypted_hex
        return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;

    } catch (error) {
        console.error('Encryption failed:', error);
        return ''; // Or re-throw error depending on desired handling
    }
}

/**
 * Decrypts text encrypted with encryptToken using AES-256-GCM.
 * @param {string} encryptedText - The encrypted string (format: ivHex:authTagHex:ciphertextHex).
 * @returns {string} The original plaintext string. Returns empty string on error or invalid format/tag.
 */
function decryptText(encryptedText) { // Removed 'export' keyword
    if (!encryptedText) {
        return '';
    }
    if (!ENCRYPTION_KEY_HEX || key.length !== 32) {
        console.error("Decryption cannot proceed due to invalid key setup.");
        return ''; // Or throw error
    }

    try {
        // 1. Split the combined string into parts
        const parts = encryptedText.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted text format.');
        }

        const [ivHex, tagHex, ciphertextHex] = parts;

        // 2. Convert hex parts back to Buffers
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        // Ensure IV and tag lengths are as expected (optional but good sanity check)
        if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
            throw new Error('Invalid IV or auth tag length in encrypted data.');
        }


        // 3. Create the AES-GCM decipher instance
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        // 4. Set the authentication tag (critical for GCM verification)
        decipher.setAuthTag(tag);

        // 5. Decrypt the ciphertext (hex -> utf8)
        let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;

    } catch (error) {
        // Decryption errors often occur if the key is wrong or the data/tag was tampered with.
        console.error('Decryption failed:', error.message); // Log only message for security
        return ''; // Return empty string or null on failure
    }
}

// Export the functions using module.exports for CommonJS
module.exports = {
    encryptText,
    decryptText
};