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
        .andWhereRaw('("validityDateRange"->>"validFrom"")::timestamp <= ?', [new Date().toISOString()])
        .andWhereRaw('("validityDateRange"->>"validUntil")::timestamp > ?', [new Date().toISOString()]);

    let totalDiscount = 0;
    let appliedOffers = [];

    for (const offer of offers) {
        const applicableItems = items.filter(item => isOfferApplicable(item, offer));

        if (applicableItems.length === 0) continue; // Skip if no items match this offer

        const subtotal = applicableItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const totalItems = applicableItems.reduce((sum, item) => sum + item.quantity, 0);

        // Check conditions (min purchase amount & min items)
        const { minimumPurchaseAmount, minimumItems } = offer.conditions || {};
        if (minimumPurchaseAmount && subtotal < minimumPurchaseAmount) continue;
        if (minimumItems && totalItems < minimumItems) continue;

        let discountAmount = 0;

        // Apply discount based on offer type
        switch (offer.offerType) {
            case "Percentage Off":
                discountAmount = (subtotal * offer.discountDetails.percentage) / 100;
                break;

            case "Fixed Amount Off":
                discountAmount = offer.discountDetails.fixedAmountOff;
                break;

            case "Buy N Get K Free":
                discountAmount = applyBuyNGetKFreeDiscount(applicableItems, offer.discountDetails);
                break;

            case "Free Shipping":
                // Free shipping logic (handled in `calculateShipping` method)
                break;

            default:
                break;
        }

        if (discountAmount > 0) {
            totalDiscount += discountAmount;
            appliedOffers.push({
                offerId: offer.offerId,
                offerName: offer.offerName,
                offerType: offer.offerType,
                discountAmount,
                applicableItems
            });
        }
    }

    return { totalDiscount, appliedOffers };
}

/**
 * Checks if an offer is applicable to a cart item.
 * @param {Object} item - Cart item.
 * @param {Object} offer - Offer details.
 * @returns {boolean} - Whether the offer applies to this item.
 */
function isOfferApplicable(item, offer) {
    const { productId, collections, tags } = item.product;
    const applicableTo = offer.applicableTo;

    return (
        (applicableTo.productIds && applicableTo.productIds.includes(productId)) ||
        (applicableTo.collectionIds && applicableTo.collectionIds.some(id => collections.includes(id))) ||
        (applicableTo.tags && applicableTo.tags.some(tag => tags.includes(tag)))
    );
}

/**
 * Applies Buy N Get K Free discount.
 * @param {Array} applicableItems - List of applicable cart items.
 * @param {Object} discountDetails - Offer discount details.
 * @returns {number} - Discount amount for Buy N Get K Free.
 */
function applyBuyNGetKFreeDiscount(applicableItems, discountDetails) {
    const { buyN, getK } = discountDetails;
    let discount = 0;

    applicableItems.forEach(item => {
        const freeItems = Math.floor(item.quantity / (buyN + getK)) * getK;
        discount += freeItems * item.product.price;
    });

    return discount;
}

module.exports = { calculateDiscount };