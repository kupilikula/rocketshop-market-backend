// src/utils/calculateDiscount.js
const knex = require("@database/knexInstance"); // Adjust path as needed

/**
 * A simple helper to round a number to two decimal places.
 * @param {number} num - The number to round.
 * @returns {number} - The rounded number.
 */
function roundToTwoDecimals(num) {
    if (typeof num !== 'number' || isNaN(num)) {
        return 0;
    }
    return Math.round((num + Number.EPSILON) * 100) / 100;
}


/**
 * Checks if an offer is applicable to a given product.
 * Fetches product's collections and tags if not available in the object.
 * @param {string} productId - The product ID.
 * @param {Object} offer - The offer object.
 * @param {Array<string>} offerCodes - List of user-provided offer codes.
 * @returns {Promise<boolean>} - Whether the offer applies to this product.
 */
async function isOfferApplicable(productId, offer, offerCodes) {
    // Check if the offer requires a code and if the user has provided it.
    if (offer.requireCode && (!offerCodes || !offerCodes.includes(offer.offerCode))) {
        return false;
    }

    // If the offer applies to the entire store, no further checks are needed.
    if (offer.applicableTo.storeWide) {
        return true;
    }

    // Fetch product details to check against applicability rules.
    const product = await knex("products")
        .where("productId", productId)
        .select("productId", "productTags")
        .first();

    if (!product) return false; // Product does not exist.

    // Fetch collections for the product.
    const collections = await knex("productCollections")
        .where("productId", productId)
        .pluck("collectionId");

    const { productTags } = product;
    const { applicableTo } = offer;

    // Return true if the product matches any of the applicability criteria.
    return (
        (applicableTo.productIds && applicableTo.productIds.includes(productId)) ||
        (applicableTo.collectionIds && applicableTo.collectionIds.some(id => collections.includes(id))) ||
        (applicableTo.productTags && productTags && applicableTo.productTags.some(tag => productTags.includes(tag)))
    );
}

/**
 * Applies Buy N Get K Free discount logic internally.
 * This function modifies the item entries directly to reflect the discount.
 * @param {Array} applicableItemEntries - Mutable array of item entries. MUST be sorted by price ascending.
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
    let itemsToMakeFree = totalFreeItems;

    // Assumes applicableItemEntries is already sorted by price ascending
    for (const entry of applicableItemEntries) {
        if (itemsToMakeFree <= 0) break;

        const freeUnitsFromThisItem = Math.min(entry.finalQuantity, itemsToMakeFree);
        const discountValueForItem = freeUnitsFromThisItem * entry.finalPrice;

        offerBogoDiscount += discountValueForItem;
        entry.finalQuantity -= freeUnitsFromThisItem; // Reduce effective quantity for subsequent offers
        entry.discountApplied = roundToTwoDecimals(entry.discountApplied + discountValueForItem); // Track discount on the item
        itemsToMakeFree -= freeUnitsFromThisItem;
    }
    return roundToTwoDecimals(offerBogoDiscount);
}


/**
 * Calculates discounts by applying them sequentially and returns the final state of items.
 * @param {string} storeId - The ID of the store.
 * @param {Array} items - Original cart items [{ product: {...}, quantity }].
 * @param {Array<string>} offerCodes - Optional list of user-entered offer codes.
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

    // Create a mutable state for items to track price and quantity changes as discounts are applied.
    const itemsState = items.map(i => ({
        ...i,
        finalPrice: roundToTwoDecimals(i.product.price),
        finalQuantity: i.quantity,
        discountApplied: 0
    }));

    for (const offer of offers) {
        // Find original items applicable to this offer to check conditions.
        const applicableItemsOriginal = (await Promise.all(
            items.map(async item => ({ item, isApplicable: await isOfferApplicable(item.product.productId, offer, offerCodes) }))
        )).filter(entry => entry.isApplicable).map(entry => entry.item);

        if (applicableItemsOriginal.length === 0) continue;

        // Find the corresponding mutable entries in our itemsState.
        const applicableItemEntries = itemsState.filter(entry =>
            applicableItemsOriginal.some(orig => orig.product.productId === entry.product.productId)
        );

        // Check offer conditions (e.g., minimum purchase) based on original item data.
        const subtotalForConditions = applicableItemsOriginal.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const totalItemsForConditions = applicableItemsOriginal.reduce((sum, item) => sum + item.quantity, 0);
        const { minimumPurchaseAmount, minimumItems } = offer.conditions || {};
        if (minimumPurchaseAmount && subtotalForConditions < minimumPurchaseAmount) continue;
        if (minimumItems && totalItemsForConditions < minimumItems) continue;

        let currentOfferDiscountAmount = 0;

        // --- Apply Discounts Sequentially and Modify itemsState directly ---
        if (offer.offerType === "Buy N Get K Free") {
            // Sort by current price (cheapest get discounted first) before applying BOGO.
            applicableItemEntries.sort((a, b) => a.finalPrice - b.finalPrice);
            currentOfferDiscountAmount = applyBuyNGetKFreeDiscountInternal(applicableItemEntries, offer.discountDetails);

        } else if (offer.offerType === "Percentage Off") {
            const percentage = offer.discountDetails?.percentage;
            if (!percentage || percentage <= 0) continue;
            let discountSumForThisOffer = 0;

            applicableItemEntries.forEach(entry => {
                if (entry.finalQuantity > 0) { // Only apply to items with a remaining quantity.
                    const discountPerUnit = roundToTwoDecimals(entry.finalPrice * (percentage / 100));
                    const totalDiscountForItemEntry = roundToTwoDecimals(discountPerUnit * entry.finalQuantity);

                    discountSumForThisOffer += totalDiscountForItemEntry;
                    entry.finalPrice = roundToTwoDecimals(entry.finalPrice - discountPerUnit); // Update price for the NEXT offer.
                    entry.discountApplied = roundToTwoDecimals(entry.discountApplied + totalDiscountForItemEntry);
                }
            });
            currentOfferDiscountAmount = discountSumForThisOffer;

        } else if (offer.offerType === "Fixed Amount Off") {
            const fixedAmount = offer.discountDetails?.fixedAmount;
            if (!fixedAmount || fixedAmount <= 0) continue;
            let discountSumForThisOffer = 0;

            applicableItemEntries.forEach(entry => {
                if (entry.finalQuantity > 0) {
                    const discountPerUnit = Math.min(entry.finalPrice, fixedAmount); // Discount cannot make the item price negative.
                    const totalDiscountForItemEntry = roundToTwoDecimals(discountPerUnit * entry.finalQuantity);

                    discountSumForThisOffer += totalDiscountForItemEntry;
                    entry.finalPrice = roundToTwoDecimals(entry.finalPrice - discountPerUnit); // Update price for the NEXT offer.
                    entry.discountApplied = roundToTwoDecimals(entry.discountApplied + totalDiscountForItemEntry);
                }
            });
            currentOfferDiscountAmount = discountSumForThisOffer;
        }

        if (currentOfferDiscountAmount > 0) {
            runningTotalDiscount += currentOfferDiscountAmount;

            // This is the reconstructed, detailed object, combining the best of both versions.
            appliedOffersDetails.push({
                offerId: offer.offerId,
                offerName: offer.offerName,
                offerType: offer.offerType,
                offerDisplayText: offer.offerDisplayText,
                discountDetails: offer.discountDetails,
                conditions: offer.conditions,
                discountAmount: currentOfferDiscountAmount,
                applicableItems: applicableItemsOriginal // Storing the original items this offer applied to.
            });
        }
    } // End offer loop

    const finalTotalDiscount = roundToTwoDecimals(runningTotalDiscount);

    // Sanity check to ensure the sum of discounts on individual items matches the total calculated discount.
    const checkDiscount = roundToTwoDecimals(itemsState.reduce((sum, entry) => sum + entry.discountApplied, 0));
    if (Math.abs(finalTotalDiscount - checkDiscount) > 0.01) { // Allow for tiny floating point differences
        console.warn("Discrepancy between running total discount and summed item discounts.", { finalTotalDiscount, checkDiscount });
    }

    return {
        totalDiscount: finalTotalDiscount,
        appliedOffers: appliedOffersDetails,
        finalItems: itemsState // The final state of items after all discounts.
    };
}

module.exports = { calculateDiscount, isOfferApplicable };