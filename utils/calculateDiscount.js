// src/utils/calculateDiscount.js
const knex = require("@database/knexInstance"); // Adjust path as needed
const Decimal = require('decimal.js');

// Set precision for decimal.js for financial calculations
Decimal.set({ precision: 10, rounding: Decimal.ROUND_HALF_UP });

/**
 * Checks if an offer is applicable to a given product.
 * @param {string} productId - The product ID.
 * @param {Object} offer - The offer object.
 * @param {Array<string>} offerCodes - List of user-provided offer codes.
 * @returns {Promise<boolean>} - Whether the offer applies to this product.
 */
async function isOfferApplicable(productId, offer, offerCodes) {
    if (offer.requireCode && (!offerCodes || !offerCodes.includes(offer.offerCode))) {
        return false;
    }
    if (offer.applicableTo.storeWide) {
        return true;
    }
    const product = await knex("products")
        .where("productId", productId)
        .select("productId", "productTags")
        .first();
    if (!product) return false;

    const collections = await knex("productCollections")
        .where("productId", productId)
        .pluck("collectionId");

    const { productTags } = product;
    const { applicableTo } = offer;

    return (
        (applicableTo.productIds && applicableTo.productIds.includes(productId)) ||
        (applicableTo.collectionIds && applicableTo.collectionIds.some(id => collections.includes(id))) ||
        (applicableTo.productTags && productTags && applicableTo.productTags.some(tag => productTags.includes(tag)))
    );
}

/**
 * Applies Buy N Get K Free discount logic internally using decimal.js.
 * @param {Array} applicableItemEntries - Mutable array of item entries. MUST be sorted by price ascending.
 * @param {Object} discountDetails - BOGO details { buyN, getK }.
 * @returns {Decimal} - The calculated discount amount for this BOGO offer as a Decimal object.
 */
function applyBuyNGetKFreeDiscountInternal(applicableItemEntries, discountDetails) {
    const { buyN, getK } = discountDetails || {};
    if (!buyN || !getK || buyN <= 0 || getK < 0) return new Decimal(0);

    const totalApplicableQuantity = applicableItemEntries.reduce((sum, entry) => sum + entry.finalQuantity, 0);
    const numberOfSets = Math.floor(totalApplicableQuantity / (buyN + getK));
    const totalFreeItems = numberOfSets * getK;

    if (totalFreeItems <= 0) return new Decimal(0);

    let offerBogoDiscount = new Decimal(0);
    let itemsToMakeFree = totalFreeItems;

    for (const entry of applicableItemEntries) {
        if (itemsToMakeFree <= 0) break;

        const freeUnitsFromThisItem = Math.min(entry.finalQuantity, itemsToMakeFree);
        const discountValueForItem = entry.finalPrice.times(freeUnitsFromThisItem);

        offerBogoDiscount = offerBogoDiscount.plus(discountValueForItem);
        entry.finalQuantity -= freeUnitsFromThisItem;
        entry.discountApplied = entry.discountApplied.plus(discountValueForItem);
        itemsToMakeFree -= freeUnitsFromThisItem;
    }
    return offerBogoDiscount;
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

    let runningTotalDiscount = new Decimal(0);
    const appliedOffersDetails = [];

    const itemsState = items.map(i => ({
        ...i,
        finalPrice: new Decimal(i.product.price), // Use Decimal object for price
        finalQuantity: i.quantity,
        discountApplied: new Decimal(0) // Use Decimal object for discount
    }));

    for (const offer of offers) {
        const applicableItemsOriginal = (await Promise.all(
            items.map(async item => ({ item, isApplicable: await isOfferApplicable(item.product.productId, offer, offerCodes) }))
        )).filter(entry => entry.isApplicable).map(entry => entry.item);

        if (applicableItemsOriginal.length === 0) continue;

        const applicableItemEntries = itemsState.filter(entry =>
            applicableItemsOriginal.some(orig => orig.product.productId === entry.product.productId)
        );

        const subtotalForConditions = applicableItemsOriginal.reduce(
            (sum, item) => sum.plus(new Decimal(item.product.price).times(item.quantity)),
            new Decimal(0)
        );
        const totalItemsForConditions = applicableItemsOriginal.reduce((sum, item) => sum + item.quantity, 0);

        const { minimumPurchaseAmount, minimumItems } = offer.conditions || {};
        if (minimumPurchaseAmount && subtotalForConditions.lessThan(minimumPurchaseAmount)) continue;
        if (minimumItems && totalItemsForConditions < minimumItems) continue;

        let currentOfferDiscountAmount = new Decimal(0);

        if (offer.offerType === "Buy N Get K Free") {
            applicableItemEntries.sort((a, b) => a.finalPrice.comparedTo(b.finalPrice));
            currentOfferDiscountAmount = applyBuyNGetKFreeDiscountInternal(applicableItemEntries, offer.discountDetails);
        } else if (offer.offerType === "Percentage Off") {
            const percentage = offer.discountDetails?.percentage;
            if (!percentage || percentage <= 0) continue;
            let discountSumForThisOffer = new Decimal(0);

            applicableItemEntries.forEach(entry => {
                if (entry.finalQuantity > 0) {
                    const discountPerUnit = entry.finalPrice.times(percentage / 100);
                    const totalDiscountForItemEntry = discountPerUnit.times(entry.finalQuantity);

                    discountSumForThisOffer = discountSumForThisOffer.plus(totalDiscountForItemEntry);
                    entry.finalPrice = entry.finalPrice.minus(discountPerUnit);
                    entry.discountApplied = entry.discountApplied.plus(totalDiscountForItemEntry);
                }
            });
            currentOfferDiscountAmount = discountSumForThisOffer;
        } else if (offer.offerType === "Fixed Amount Off") {
            const fixedAmount = new Decimal(offer.discountDetails?.fixedAmount || 0);
            if (fixedAmount.lessThanOrEqualTo(0)) continue;
            let discountSumForThisOffer = new Decimal(0);

            applicableItemEntries.forEach(entry => {
                if (entry.finalQuantity > 0) {
                    const discountPerUnit = Decimal.min(entry.finalPrice, fixedAmount);
                    const totalDiscountForItemEntry = discountPerUnit.times(entry.finalQuantity);

                    discountSumForThisOffer = discountSumForThisOffer.plus(totalDiscountForItemEntry);
                    entry.finalPrice = entry.finalPrice.minus(discountPerUnit);
                    entry.discountApplied = entry.discountApplied.plus(totalDiscountForItemEntry);
                }
            });
            currentOfferDiscountAmount = discountSumForThisOffer;
        }

        if (currentOfferDiscountAmount.greaterThan(0)) {
            runningTotalDiscount = runningTotalDiscount.plus(currentOfferDiscountAmount);
            appliedOffersDetails.push({
                offerId: offer.offerId,
                offerName: offer.offerName,
                offerType: offer.offerType,
                offerDisplayText: offer.offerDisplayText,
                discountDetails: offer.discountDetails,
                conditions: offer.conditions,
                discountAmount: currentOfferDiscountAmount.toDP(2).toNumber(), // Convert to number for reporting
                applicableItems: applicableItemsOriginal,
            });
        }
    }

    const finalTotalDiscount = runningTotalDiscount.toDP(2);
    const checkDiscount = itemsState.reduce((sum, entry) => sum.plus(entry.discountApplied), new Decimal(0)).toDP(2);

    if (finalTotalDiscount.minus(checkDiscount).abs().greaterThan('0.01')) {
        console.warn("Discrepancy between running total discount and summed item discounts.", {
            finalTotalDiscount: finalTotalDiscount.toString(),
            checkDiscount: checkDiscount.toString()
        });
    }

    // Convert Decimal objects back to numbers for the final output
    const finalItemsState = itemsState.map(item => ({
        ...item,
        finalPrice: item.finalPrice.toDP(2).toNumber(),
        discountApplied: item.discountApplied.toDP(2).toNumber(),
        product: {
            ...item.product,
            price: new Decimal(item.product.price).toDP(2).toNumber()
        }
    }));

    return {
        totalDiscount: finalTotalDiscount.toNumber(),
        appliedOffers: appliedOffersDetails,
        finalItems: finalItemsState
    };
}

module.exports = { calculateDiscount, isOfferApplicable };