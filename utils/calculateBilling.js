const {calculateDiscount} = require("./calculateDiscount");

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
    const shipping = (await calculateShipping(storeId, items));

    // Calculate discount
    const {totalDiscount, appliedOffers} = (await calculateDiscount(storeId, items));

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
    const total = parseFloat(subtotal + shipping - discount + gst);

    return {
        subtotal,
        shipping,
        discount: totalDiscount,
        appliedOffers,
        gst,
        total,
    };
}

async function calculateShipping(storeId, items) {
    return 0; // Free shipping for orders above ₹1000`
}


module.exports = {
    calculateBilling,
    calculateShipping,
};