// utils/cartHash.js

const crypto = require('crypto');

/**
 * Computes a stable hash for a single store's cart items.
 * Only includes productId and quantity per item to ensure the hash
 * represents the contents of the cart, ignoring metadata like price, etc.
 * @param {Array} cartItems - An array of cart item objects, e.g., [{ product: { productId: '...' }, quantity: 2 }, ...]
 * @returns {string} A SHA-256 hash digest.
 */
function computePerStoreCartHash(cartItems) {
    if (!cartItems || !Array.isArray(cartItems)) {
        return '';
    }

    // 1. Normalize the items to a consistent structure
    const normalizedItems = cartItems
        .map(item => ({
            productId: item?.product?.productId,
            quantity: item?.quantity ?? 0,
        }))
        // 2. Filter out any malformed or zero-quantity items
        .filter(item => item.productId && item.quantity > 0)
        // 3. Sort the items by productId to ensure hash is consistent regardless of order
        .sort((a, b) => a.productId.localeCompare(b.productId));

    // 4. Serialize the stable structure to a string
    const serialized = JSON.stringify(normalizedItems);

    // 5. Create the hash
    return crypto.createHash('sha256').update(serialized).digest('hex');
}

module.exports = {
    // Export the new function. You can remove the old one if it's no longer used.
    computePerStoreCartHash
};