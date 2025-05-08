// src/utils/calculateBilling.js (Example path)
const { calculateDiscount } = require('./calculateDiscount'); // Import refactored discount function
const { calculateShipping } = require('./calculateShipping'); // Import shipping function (assumed correct)
const { roundToTwoDecimals } = require('./roundToTwoDecimals'); // Import helper

/**
 * Calculates final billing details using item-level prices post-discount.
 * @param {string} storeId
 * @param {Array} items - Original cart items
 * @param {Array<string>} offerCodes
 * @param {Object} deliveryAddress
 * @returns {Promise<Object>} - Billing details
 */
async function calculateBilling(storeId, items, offerCodes, deliveryAddress = null) {
    // Calculate original subtotal (sum of original prices * original quantities) for reference
    const subtotal = roundToTwoDecimals(items.reduce(
        (sum, item) => sum + item.product.price * item.quantity, 0
    ));

    // Calculate shipping (assume it returns a rounded value)
    const shipping = await calculateShipping(storeId, items, deliveryAddress);

    // Calculate discounts and get the final state of items after all discounts applied
    const { totalDiscount, appliedOffers, finalItems } = await calculateDiscount(storeId, items, offerCodes);

    // --- Calculate GST based on FINAL item prices and quantities ---
    // itemGst here represents *only* the tax explicitly added for tax-exclusive items
    let itemGst = roundToTwoDecimals(finalItems.reduce((sum, itemEntry) => {
        // Use the final effective price and quantity for tax base
        const itemFinalTaxableValue = itemEntry.finalPrice * itemEntry.finalQuantity;
        // Only add GST if the product price did NOT already include it
        const itemGstPortion = itemEntry.product.gstInclusive
            ? 0 // GST already in finalPrice, don't add again
            : itemFinalValue * (itemEntry.product.gstRate / 100); // Calculate explicit tax
        return sum + itemGstPortion;
    }, 0));

    // --- Calculate GST on Shipping ---
    let shippingGst = 0;
    if (shipping > 0) {
        // *** ASSUMPTION: Using the highest GST rate from the original items ***
        // *** CONSULT A TAX ADVISOR FOR THE CORRECT RULE for composite supply ***
        let shippingGstRate = 0;
        if (items.length > 0) {
            shippingGstRate = items.reduce((maxRate, item) => Math.max(maxRate, item.product.gstRate || 0), 0);
        }
        shippingGst = roundToTwoDecimals(shipping * (shippingGstRate / 100));
        // console.log(`Applying ${shippingGstRate}% GST to shipping cost ${shipping}. GST: ${shippingGst}`);
    }

    // --- Total Explicitly Added GST (for tax-exclusive items + shipping) ---
    const totalGst = roundToTwoDecimals(itemGst + shippingGst);

    // --- Calculate Final Total Payable ---
    // This should be: Original Subtotal + Shipping + Total Explicit GST - Total Discount
    // This formula correctly accounts for inclusive/exclusive pricing because:
    // - 'subtotal' is based on listed prices (which might include tax implicitly)
    // - 'totalGst' ONLY includes tax added explicitly for exclusive items + shipping
    // - 'totalDiscount' is subtracted from the overall value.
    const total = roundToTwoDecimals(subtotal + shipping + totalGst - totalDiscount);

    // --- Sanity Check (Optional): Sum final item values + shipping + explicit shipping GST ---
    // const finalItemValueTotal = roundToTwoDecimals(finalItems.reduce((sum, itemEntry) => sum + itemEntry.finalPrice * itemEntry.finalQuantity, 0));
    // const checkTotal = roundToTwoDecimals(finalItemValueTotal + shipping + shippingGst); // Note: itemGst for exclusive items is already reflected in finalItemValueTotal difference from original subtotal if discounts applied
    // console.log("Total Check:", { total, checkTotal, subtotal, shipping, totalGst, totalDiscount });
    // --- End Sanity Check ---

    return {
        subtotal,       // Original subtotal, rounded
        shipping,       // Rounded
        discount: totalDiscount, // Total discount applied, rounded
        appliedOffers,
        gst: totalGst,  // Total EXPLICITLY ADDED GST, rounded
        total,          // Final total payable, rounded
        _finalItems_debug: finalItems // Return final item state for debugging if needed
    };
}

// Export if needed
module.exports = { calculateBilling };