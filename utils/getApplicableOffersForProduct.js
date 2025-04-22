// utils/fetchApplicableOffers.js
const knex = require("@database/knexInstance");
const { isOfferApplicable } = require("../utils/calculateDiscount");

/**
 * Computes applicable offers for a specific product in a store.
 * @param {string} productId
 * @param {string} storeId
 * @returns {Promise<Array>} List of applicable offers
 */
async function getApplicableOffersForProduct(productId, storeId) {
    if (!productId || !storeId) return [];

    // Fetch all active offers for the store
    const offers = await knex("offers")
        .where("storeId", storeId)
        .andWhere("isActive", true)
        .andWhereRaw(`("validityDateRange"->>'validFrom')::timestamptz <= NOW()`)
        .andWhereRaw(`("validityDateRange"->>'validUntil')::timestamptz > NOW()`);

    const applicableOffers = [];
    for (const offer of offers) {
        if (await isOfferApplicable(productId, offer, [])) {
            applicableOffers.push(offer);
        }
    }

    return applicableOffers;
}

module.exports = { getApplicableOffersForProduct };
