const knex = require("@database/knexInstance");

/**
 * Calculates the discount for the given store and cart items.
 * @param {string} storeId - The store's ID.
 * @param {Array} items - The list of items in the cart for the store.
 * @returns {Promise<{totalDiscount: number, appliedOffers: Array}>} - Total discount and list of applied offers.
 */
async function calculateDiscount(storeId, items) {
    // Fetch active offers for the store
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
        `); // Ensure correct offer application order

    let totalDiscount = 0;
    let appliedOffers = [];

    for (const offer of offers) {
        const applicableItems = (await Promise.all(
            items.map(async item => ({
                item,
                isApplicable: await isOfferApplicable(item.product.productId, offer)
            }))
        )).filter(entry => entry.isApplicable).map(entry => entry.item);

        if (applicableItems.length === 0) continue; // Skip if no items match this offer

        const subtotal = applicableItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const totalItems = applicableItems.reduce((sum, item) => sum + item.quantity, 0);

        // Check conditions (min purchase amount & min items)
        const { minimumPurchaseAmount, minimumItems } = offer.conditions || {};
        if (minimumPurchaseAmount && subtotal < minimumPurchaseAmount) continue;
        if (minimumItems && totalItems < minimumItems) continue;

        let discountAmount = 0;

// Apply Buy N Get K Free collectively across applicable products
        if (offer.offerType === "Buy N Get K Free") {
            discountAmount = applyBuyNGetKFreeDiscount(applicableItems, offer.discountDetails);

            // Adjust effective quantities to prevent further discounting on free items
            let remainingFreeItems = Math.floor(totalItems / (offer.discountDetails.buyN + offer.discountDetails.getK)) * offer.discountDetails.getK;

            for (const item of applicableItems) {
                if (remainingFreeItems === 0) break;

                const applicableFreeItems = Math.min(item.quantity, remainingFreeItems);
                item.effectiveQuantity = item.quantity - applicableFreeItems;
                remainingFreeItems -= applicableFreeItems;
            }
        }

        // Apply "Percentage Off" to paid items (excluding free items)
        else if (offer.offerType === "Percentage Off") {
            const subtotal = applicableItems.reduce((sum, item) => sum + item.product.price * (item.effectiveQuantity || item.quantity), 0);
            discountAmount = (subtotal * offer.discountDetails.percentage) / 100;
        }

        // Apply "Fixed Amount Off" only to paid items
        else if (offer.offerType === "Fixed Amount Off") {
            const paidItems = applicableItems.reduce((sum, item) => sum + (item.effectiveQuantity || item.quantity), 0);
            discountAmount = offer.discountDetails.fixedAmount * paidItems;
        }

        if (discountAmount > 0) {
            totalDiscount += discountAmount;
            appliedOffers.push({
                offerId: offer.offerId,
                offerName: offer.offerName,
                offerType: offer.offerType,
                offerDisplayText: offer.offerDisplayText,
                discountDetails: offer.discountDetails,
                conditions: offer.conditions,
                discountAmount,
                applicableItems
            });
        }
    }

    return { totalDiscount, appliedOffers };
}

/**
 * Checks if an offer is applicable to a given product.
 * Fetches product's collections and tags if not available in the object.
 * @param {string} productId - The product ID.
 * @param {Object} offer - The offer object.
 * @returns {Promise<boolean>} - Whether the offer applies to this product.
 */
async function isOfferApplicable(productId, offer) {
    // Fetch product details (including collections and tags) if not provided
    const product = await knex("products")
        .where("productId", productId)
        .select("productId", "productTags")
        .first();

    if (!product) return false; // Product does not exist

    if (offer.applicableTo.storeWide) {
        return true;
    }
    // Fetch collections for the product
    const collections = await knex("productCollections")
        .where("productId", productId)
        .pluck("collectionId");

    const { productTags } = product;
    const applicableTo = offer.applicableTo;

    return (
        (applicableTo.productIds && applicableTo.productIds.includes(productId)) ||
        (applicableTo.collectionIds && applicableTo.collectionIds.some(id => collections.includes(id))) ||
        (applicableTo.productTags && applicableTo.productTags.some(tag => productTags.includes(tag)))
    );
}

/**
 * Applies Buy N Get K Free discount collectively across all applicable products.
 * @param {Array} applicableItems - List of applicable cart items.
 * @param {Object} discountDetails - Offer discount details.
 * @returns {number} - Discount amount for Buy N Get K Free.
 */
function applyBuyNGetKFreeDiscount(applicableItems, discountDetails) {
    const { buyN, getK } = discountDetails;

    // Sort products from lowest price to highest (so free items apply to cheaper ones first)
    applicableItems.sort((a, b) => a.product.price - b.product.price);

    // Get total quantity across all products
    const totalQuantity = applicableItems.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate total number of free items across products
    const freeItems = Math.floor(totalQuantity / (buyN + getK)) * getK;

    let discount = 0;
    let remainingFreeItems = freeItems;

    // Distribute free items across products (starting from cheapest)
    for (const item of applicableItems) {
        if (remainingFreeItems === 0) break;

        const applicableFreeItems = Math.min(item.quantity, remainingFreeItems);
        discount += applicableFreeItems * item.product.price;
        remainingFreeItems -= applicableFreeItems;
    }

    return discount;
}

module.exports = { calculateDiscount, isOfferApplicable };