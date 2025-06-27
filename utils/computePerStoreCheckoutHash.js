const crypto = require('crypto');

/**
 * Computes a stable hash for a checkout attempt.
 * This hash uniquely identifies a combination of a customer, a store,
 * the specific items in the cart, the applied offers, and the delivery address.
 *
 * @param {object} params - The parameters for hashing.
 * @param {string} params.customerId - The ID of the customer.
 * @param {string} params.storeId - The ID of the store.
 * @param {Array} params.cartItems - An array of cart item objects.
 * @param {Array} params.appliedOffers - An array of applied offer objects from billing.
 * @param {object} params.deliveryAddress - The delivery address object.
 * @returns {string} A SHA-256 hash digest, or an empty string if inputs are invalid.
 */
function computePerStoreCheckoutHash({ customerId, storeId, cartItems, deliveryAddress, appliedOffers }) {
    // 1. Validate essential inputs
    // Added appliedOffers to the validation.
    if (!customerId || !storeId || !cartItems || !deliveryAddress || !appliedOffers || !Array.isArray(cartItems) || !Array.isArray(appliedOffers)) {
        console.error("computePerStoreCheckoutHash: Missing required parameters.");
        return '';
    }

    // 2. Normalize cart items to a consistent structure and order
    const normalizedItems = cartItems
        .map(item => ({
            productId: item?.product?.productId || item?.productId, // Handle both cart structures
            quantity: item?.quantity ?? 0,
        }))
        .filter(item => item.productId && item.quantity > 0)
        .sort((a, b) => a.productId.localeCompare(b.productId));

    // --- NEW: Step 3: Normalize applied offers to a consistent structure and order ---
    const normalizedOffers = appliedOffers
        .map(offer => ({
            // Use the stable, unique primary key of the offer
            offerId: offer?.offerId,
        }))
        .filter(offer => offer.offerId) // Filter out any malformed offer objects
        // Sort by offerId to ensure hash is consistent regardless of application order
        .sort((a, b) => a.offerId.localeCompare(b.offerId));

    // 4. Normalize the delivery address to a consistent structure
    const normalizedAddress = {
        street1: deliveryAddress.street1 || '',
        street2: deliveryAddress.street2 || '',
        city: deliveryAddress.city || '',
        state: deliveryAddress.state || '',
        postalCode: deliveryAddress.postalCode || '',
        // Use only a subset of fields to avoid hashing trivial changes
    };

    // 5. Combine all normalized parts into a single, stable object
    // --- REFACTORED: Incremented version and added offers ---
    const dataToHash = {
        v: 1,
        customerId,
        storeId,
        items: normalizedItems,
        offers: normalizedOffers, // Add the normalized offers to the hash data
        address: normalizedAddress,
    };

    // 6. Serialize the stable structure to a JSON string
    const serializedData = JSON.stringify(dataToHash);

    // 7. Create the final hash
    return crypto.createHash('sha256').update(serializedData).digest('hex');
}

module.exports = {
    computePerStoreCheckoutHash
};