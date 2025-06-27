const crypto = require('crypto');

/**
 * Computes a stable hash for a checkout attempt.
 * This hash uniquely identifies a combination of a customer, a store,
 * the specific items in the cart, and the delivery address.
 * * @param {object} params - The parameters for hashing.
 * @param {string} params.customerId - The ID of the customer.
 * @param {string} params.storeId - The ID of the store.
 * @param {Array} params.cartItems - An array of cart item objects, e.g., [{ product: { productId: '...' }, quantity: 2 }, ...]
 * @param {object} params.deliveryAddress - The delivery address object.
 * @returns {string} A SHA-256 hash digest, or an empty string if inputs are invalid.
 */
function computePerStoreCheckoutHash({ customerId, storeId, cartItems, deliveryAddress }) {
    // 1. Validate essential inputs
    if (!customerId || !storeId || !cartItems || !deliveryAddress || !Array.isArray(cartItems)) {
        console.error("computePerStoreCheckoutHash: Missing required parameters.");
        return '';
    }

    // 2. Normalize cart items to a consistent structure and order
    const normalizedItems = cartItems
        .map(item => ({
            // Ensure we only use the unique identifier and quantity
            productId: item?.product?.productId,
            quantity: item?.quantity ?? 0,
        }))
        // Filter out any malformed or zero-quantity items
        .filter(item => item.productId && item.quantity > 0)
        // Sort the items by productId to ensure hash is consistent regardless of cart order
        .sort((a, b) => a.productId.localeCompare(b.productId));

    // 3. Normalize the delivery address to a consistent structure
    // This prevents issues with key order or extra properties in the object.
    // Use empty strings for any missing fields to ensure stability.
    const normalizedAddress = {
        street1: deliveryAddress.street1 || '',
        street2: deliveryAddress.street2 || '',
        city: deliveryAddress.city || '',
        state: deliveryAddress.state || '',
        postalCode: deliveryAddress.postalCode || '',
    };

    // 4. Combine all normalized parts into a single, stable object
    // Using a version number ('v') is good practice in case you need to change this logic in the future.
    const dataToHash = {
        v: 1,
        customerId,
        storeId,
        items: normalizedItems,
        address: normalizedAddress,
    };

    // 5. Serialize the stable structure to a JSON string
    const serializedData = JSON.stringify(dataToHash);

    // 6. Create the final hash
    return crypto.createHash('sha256').update(serializedData).digest('hex');
}

module.exports = {
    computePerStoreCheckoutHash
};
