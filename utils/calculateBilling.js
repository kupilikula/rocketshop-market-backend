// src/utils/calculateBilling.js (Example path)
const { calculateDiscount } = require('./calculateDiscount'); // Import refactored discount function
const { calculateShipping } = require('./calculateShipping'); // Import shipping function (assumed correct)
const Decimal = require("decimal.js");

// Set precision for decimal.js for financial calculations
Decimal.set({ precision: 10, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calculates final billing details using item-level prices post-discount.
 * @param {string} storeId
 * @param {Array} items - Original cart items
 * @param {Array<string>} offerCodes
 * @param {Object} deliveryAddress
 * @returns {Promise<Object>} - Billing details
 */
async function calculateBilling(storeId, items, offerCodes, deliveryAddress = null) {
    // 1. Calculate original subtotal using Decimal for precision
    const subtotalDecimal = items.reduce(
        (sum, item) => sum.plus(new Decimal(item.product.price).times(item.quantity)),
        new Decimal(0)
    );

    // 2. Calculate shipping (result is a number, will be converted to Decimal for calculations)
    const shippingCost = await calculateShipping(storeId, items, deliveryAddress) || 0;
    if (shippingCost === null) {
        console.log('International Shipping Not Available For Some Items.');
    }
    const shippingDecimal = new Decimal(shippingCost);

    // 3. Calculate discounts. `totalDiscount` and `finalItems` values are numbers.
    const { totalDiscount, appliedOffers, finalItems } = await calculateDiscount(storeId, items, offerCodes);
    const totalDiscountDecimal = new Decimal(totalDiscount);

    // 4. Calculate GST based on FINAL item prices and quantities using Decimal
    const itemGstDecimal = finalItems.reduce((sum, itemEntry) => {
        const finalPriceDecimal = new Decimal(itemEntry.finalPrice);
        const gstRateDecimal = new Decimal(itemEntry.product.gstRate || 0);

        const itemFinalTaxableValue = finalPriceDecimal.times(itemEntry.finalQuantity);

        const itemGstPortion = itemEntry.product.gstInclusive
            ? new Decimal(0) // GST already in finalPrice, don't add again
            : itemFinalTaxableValue.times(gstRateDecimal.div(100)); // Calculate explicit tax

        return sum.plus(itemGstPortion);
    }, new Decimal(0));

    // 5. Calculate GST on Shipping using Decimal
    let shippingGstDecimal = new Decimal(0);
    if (shippingCost > 0) {
        // Correctly find the highest GST rate from original items using Decimal.max
        const shippingGstRate = items.reduce(
            (maxRate, item) => Decimal.max(maxRate, new Decimal(item.product.gstRate || 0)),
            new Decimal(0)
        );

        if (shippingGstRate.greaterThan(0)) {
            shippingGstDecimal = shippingDecimal.times(shippingGstRate.div(100));
        }
    }

    // 6. Calculate Total Explicitly Added GST using Decimal
    const totalGstDecimal = itemGstDecimal.plus(shippingGstDecimal);

    // 7. Calculate Final Total Payable using Decimal
    // Formula: Subtotal + Shipping + Total Explicit GST - Total Discount
    const totalDecimal = subtotalDecimal.plus(shippingDecimal).plus(totalGstDecimal).minus(totalDiscountDecimal);

    // --- Sanity Check using Decimal (Optional) ---
    // const finalItemValueTotal = finalItems.reduce((sum, item) => sum.plus(new Decimal(item.finalPrice).times(item.finalQuantity)), new Decimal(0));
    // const checkTotal = finalItemValueTotal.plus(shippingDecimal).plus(shippingGstDecimal);
    // console.log("Total Check (Decimal):", { total: totalDecimal.toString(), checkTotal: checkTotal.toString() });
    // --- End Sanity Check ---

    // 8. Return final object with all values converted back to numbers
    return {
        subtotal: subtotalDecimal.toDP(2).toNumber(),
        shipping: shippingCost, // Already a number
        discount: totalDiscount, // Already a number
        appliedOffers,
        gst: totalGstDecimal.toDP(2).toNumber(),
        total: totalDecimal.toDP(2).toNumber(),
    };
}

// Export if needed
module.exports = { calculateBilling };