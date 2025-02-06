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


    // ✅ **Calculate effective prices after discounts**
    const effectivePrices = calculateEffectiveItemPrices(items, appliedOffers);

    // ✅ **Calculate GST on discounted price (excluding free items)**
    const gst = effectivePrices.reduce((sum, item) => {
        return sum + (item.product.gstInclusive
            ? 0 // GST already included, no extra charge
            : item.discountedPrice * item.quantity * item.product.gstRate / 100);
    }, 0);

    // Calculate total
    const total = parseFloat(subtotal + shipping - totalDiscount + gst);

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

/**
 * Adjusts the price of each item after applying discounts.
 * Ensures free items have ₹0 price, and only paid items contribute to GST.
 * @param {Array} items - The list of cart items.
 * @param {Array} appliedOffers - The list of applied offers.
 * @returns {Array} - Items with their final discounted prices.
 */
function calculateEffectiveItemPrices(items, appliedOffers) {
    const discountedItems = items.map(item => ({
        ...item,
        discountedPrice: item.product.price // Start with original price
    }));

    appliedOffers.forEach(offer => {
        offer.applicableItems.forEach(appliedItem => {
            const matchingItem = discountedItems.find(i => i.product.productId === appliedItem.product.productId);

            if (matchingItem) {
                if (offer.offerType === "Buy N Get K Free") {
                    // Free items should have price = ₹0
                    matchingItem.discountedPrice = matchingItem.product.price;
                    matchingItem.quantity = appliedItem.effectiveQuantity; // Exclude free items
                } else if (offer.offerType === "Percentage Off") {
                    // Apply percentage discount
                    matchingItem.discountedPrice *= (1 - offer.discountDetails.percentage / 100);
                } else if (offer.offerType === "Fixed Amount Off") {
                    // Apply fixed amount discount
                    matchingItem.discountedPrice -= offer.discountDetails.fixedAmount;
                    if (matchingItem.discountedPrice < 0) {
                        matchingItem.discountedPrice = 0; // Avoid negative prices
                    }
                }
            }
        });
    });

    return discountedItems;
}


module.exports = {
    calculateBilling,
    calculateShipping,
};