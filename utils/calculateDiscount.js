// src/utils/calculateDiscount.js (Example path)
const knex = require('@database/knexInstance'); // Adjust path
const { roundToTwoDecimals } = require('./roundToTwoDecimals'); // Import helper

// --- Assumed isOfferApplicable helper exists here ---
async function isOfferApplicable(productId, offer, offerCodes) { /* ... Your implementation ... */ }

/**
 * Applies Buy N Get K Free discount logic internally.
 * Modifies applicableItemEntries directly (reduces finalQuantity) and returns discount value.
 * @param {Array} applicableItemEntries - Mutable array of item entries ({..., finalPrice, finalQuantity, discountApplied}). MUST be sorted by price ascending.
 * @param {Object} discountDetails - BOGO details { buyN, getK }.
 * @returns {number} - The calculated discount amount for this BOGO offer.
 */
function applyBuyNGetKFreeDiscountInternal(applicableItemEntries, discountDetails) {
    const { buyN, getK } = discountDetails || {};
    if (!buyN || !getK || buyN <= 0 || getK < 0) return 0;

    const totalApplicableQuantity = applicableItemEntries.reduce((sum, entry) => sum + entry.finalQuantity, 0);
    const numberOfSets = Math.floor(totalApplicableQuantity / (buyN + getK));
    const totalFreeItems = numberOfSets * getK;

    if (totalFreeItems <= 0) return 0;

    let offerBogoDiscount = 0;
    let itemsMadeFreeCount = totalFreeItems; // Use this counter within the loop

    // Assumes applicableItemEntries is already sorted by price ascending
    for (const entry of applicableItemEntries) {
        if (itemsMadeFreeCount <= 0) break; // Check the correct counter

        const freeUnitsFromThisItem = Math.min(entry.finalQuantity, itemsMadeFreeCount); // Use correct counter
        const discountValueForItem = freeUnitsFromThisItem * entry.finalPrice;

        offerBogoDiscount += discountValueForItem;
        entry.finalQuantity -= freeUnitsFromThisItem; // Reduce effective quantity
        entry.discountApplied = roundToTwoDecimals(entry.discountApplied + discountValueForItem); // Track discount
        itemsMadeFreeCount -= freeUnitsFromThisItem; // Decrement correct counter
    }
    return roundToTwoDecimals(offerBogoDiscount);
}


/**
 * Calculates discounts, applying them sequentially and returning final item states.
 * @param {string} storeId
 * @param {Array} items - Original cart items [{ product: {...}, quantity }]
 * @param {Array<string>} offerCodes
 * @returns {Promise<{totalDiscount: number, appliedOffers: Array, finalItems: Array}>}
 */
async function calculateDiscount(storeId, items, offerCodes) {
    const offers = await knex("offers")
        .where({ storeId, isActive: true })
        .andWhereRaw(`("validityDateRange"->>'validFrom')::timestamptz <= ?`, [new Date().toISOString()])
        .andWhereRaw(`("validityDateRange"->>'validUntil')::timestamptz > ?`, [new Date().toISOString()])
        .orderByRaw(`
            CASE
                WHEN "offerType" = 'Buy N Get K Free' THEN 1
                WHEN "offerType" = 'Percentage Off' THEN 2
                WHEN "offerType" = 'Fixed Amount Off' THEN 3
                ELSE 4
            END
        `);

    let runningTotalDiscount = 0;
    const appliedOffersDetails = [];
    // Mutable state for items, tracking final price and quantity after discounts
    const itemsState = items.map(i => ({
        ...i, // Spread original item ({ product: {...}, quantity })
        finalPrice: roundToTwoDecimals(i.product.price), // Start with rounded original price
        finalQuantity: i.quantity, // Start with original quantity
        discountApplied: 0 // Track discount applied to this specific item entry
    }));

    for (const offer of offers) {
        // Find original items applicable to this offer
        const applicableItemsOriginal = (await Promise.all(
            items.map(async item => ({ item, isApplicable: await isOfferApplicable(item.product.productId, offer, offerCodes) }))
        )).filter(entry => entry.isApplicable).map(entry => entry.item);

        // Find the corresponding mutable entries in itemsState
        const applicableItemEntries = itemsState.filter(entry =>
            applicableItemsOriginal.some(orig => orig.product.productId === entry.product.productId)
        );

        if (applicableItemEntries.length === 0) continue;

        // Check conditions based on original data if needed
        const subtotalForConditions = applicableItemsOriginal.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const totalItemsForConditions = applicableItemsOriginal.reduce((sum, item) => sum + item.quantity, 0);
        const { minimumPurchaseAmount, minimumItems } = offer.conditions || {};
        if (minimumPurchaseAmount && subtotalForConditions < minimumPurchaseAmount) continue;
        if (minimumItems && totalItemsForConditions < minimumItems) continue;

        let currentOfferDiscountAmount = 0;

        // --- Apply Discounts Sequentially and Modify itemsState directly ---
        if (offer.offerType === "Buy N Get K Free") {
            // Sort by current price before applying BOGO internally
            applicableItemEntries.sort((a, b) => a.finalPrice - b.finalPrice);
            currentOfferDiscountAmount = applyBuyNGetKFreeDiscountInternal(applicableItemEntries, offer.discountDetails);
        } else if (offer.offerType === "Percentage Off") {
            const percentage = offer.discountDetails?.percentage;
            if (!percentage || percentage <= 0) continue;
            let discountSumForThisOffer = 0;
            applicableItemEntries.forEach(entry => {
                if (entry.finalQuantity > 0) { // Only apply to items with remaining quantity
                    const discountPerUnit = roundToTwoDecimals(entry.finalPrice * (percentage / 100));
                    const totalDiscountForItemEntry = roundToTwoDecimals(discountPerUnit * entry.finalQuantity);
                    discountSumForThisOffer += totalDiscountForItemEntry;
                    entry.finalPrice = roundToTwoDecimals(entry.finalPrice - discountPerUnit); // Update price for NEXT offer
                    entry.discountApplied = roundToTwoDecimals(entry.discountApplied + totalDiscountForItemEntry);
                }
            });
            currentOfferDiscountAmount = discountSumForThisOffer; // Already rounded
        } else if (offer.offerType === "Fixed Amount Off") {
            const fixedAmount = offer.discountDetails?.fixedAmount;
            if (!fixedAmount || fixedAmount <= 0) continue;
            // Assumption: Fixed amount applies PER UNIT, up to the item's current final price
            let discountSumForThisOffer = 0;
            applicableItemEntries.forEach(entry => {
                if (entry.finalQuantity > 0) {
                    const discountPerUnit = Math.min(entry.finalPrice, fixedAmount); // Discount cannot exceed current price
                    const totalDiscountForItemEntry = roundToTwoDecimals(discountPerUnit * entry.finalQuantity);
                    discountSumForThisOffer += totalDiscountForItemEntry;
                    entry.finalPrice = roundToTwoDecimals(entry.finalPrice - discountPerUnit); // Update price for NEXT offer
                    entry.discountApplied = roundToTwoDecimals(entry.discountApplied + totalDiscountForItemEntry);
                }
            });
            currentOfferDiscountAmount = discountSumForThisOffer; // Already rounded
        }
        // --- End Discount Application ---

        // No need to round currentOfferDiscountAmount again if sub-calcs are rounded

        if (currentOfferDiscountAmount > 0) {
            runningTotalDiscount += currentOfferDiscountAmount; // Accumulate discounts
            appliedOffersDetails.push({
                offerId: offer.offerId,
                offerName: offer.offerName,
                discountAmount: currentOfferDiscountAmount, // Store amount for this specific offer
                // Add other details...
            });
        }
    } // End offer loop

    // Final total discount is the sum of rounded intermediate discounts
    const finalTotalDiscount = roundToTwoDecimals(runningTotalDiscount);

    // Optionally sanity check: finalTotalDiscount should roughly equal sum of itemEntry.discountApplied
    const checkDiscount = roundToTwoDecimals(itemsState.reduce((sum, entry) => sum + entry.discountApplied, 0));
    if(Math.abs(finalTotalDiscount - checkDiscount) > 0.001) { // Allow for tiny floating point diffs
        console.warn("Discrepancy between runningTotalDiscount and summed item discounts", { finalTotalDiscount, checkDiscount });
    }

    return {
        totalDiscount: finalTotalDiscount,
        appliedOffers: appliedOffersDetails,
        finalItems: itemsState // Items now have finalPrice/finalQuantity after all sequential discounts
    };
}

// Export if needed
module.exports = { calculateDiscount, isOfferApplicable };