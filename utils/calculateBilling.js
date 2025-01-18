/**
 * Calculates the billing details for a store.
 * @param {string} storeId - The store's ID.
 * @param {Array} items - The list of items in the cart for the store.
 * @returns {Object} - The billing details including subtotal, shipping, discount, GST, and total.
 */
async function calculateBilling(storeId, items) {
    // Calculate subtotal
    const subtotal = items.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
    );

    // Calculate shipping cost
    const shipping = await calculateShipping(storeId, subtotal);

    // Calculate discount
    const discount = await calculateDiscount(storeId, subtotal);

    // Calculate GST
    const gst = items.reduce(
        (sum, item) =>
            sum +
            (item.product.gstInclusive
                ? 0
                : item.product.price * item.quantity * item.product.gstRate / 100),
        0
    );

    // Calculate total
    const total = subtotal + shipping - discount + gst;

    return {
        subtotal,
        shipping,
        discount,
        gst,
        total,
    };
}

/**
 * Example logic for calculating shipping cost.
 * @param {string} storeId - The store's ID.
 * @param {number} subtotal - The subtotal for the store.
 * @returns {number} - The shipping cost.
 */
async function calculateShipping(storeId, subtotal) {
    return subtotal > 1000 ? 0 : 50; // Free shipping for orders above ₹1000
}

/**
 * Example logic for calculating discount.
 * @param {string} storeId - The store's ID.
 * @param {number} subtotal - The subtotal for the store.
 * @returns {number} - The discount amount.
 */
async function calculateDiscount(storeId, subtotal) {
    return subtotal > 500 ? 100 : 0; // ₹100 discount for orders above ₹500
}

module.exports = {
    calculateBilling,
    calculateShipping,
    calculateDiscount,
};