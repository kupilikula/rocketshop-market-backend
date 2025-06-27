'use strict';

const knex = require('@database/knexInstance');
const Decimal = require('decimal.js');

// Set precision for decimal.js for financial calculations
Decimal.set({ precision: 10, rounding: Decimal.ROUND_HALF_UP });

// Helper: Check if address satisfies location condition (no changes needed)
const evaluateLocationCondition = (condition, address) => {
    if (!address || condition.operator !== 'inside') return false;
    const { locationType, city, state, country } = condition;
    if (locationType === 'city') {
        return (
            address.city?.toLowerCase() === city?.toLowerCase() &&
            address.state?.toLowerCase() === state?.toLowerCase() &&
            address.country?.toLowerCase() === country?.toLowerCase()
        );
    }
    if (locationType === 'state') {
        return (
            address.state?.toLowerCase() === state?.toLowerCase() &&
            address.country?.toLowerCase() === country?.toLowerCase()
        );
    }
    if (locationType === 'country') {
        if (address.country?.toLowerCase() === country?.toLowerCase()) {
            return true;
        }
        if (country?.toLowerCase() === 'international') {
            if (address.country?.toLowerCase() !== 'india') {
                return true;
            }
        }
        return false;
    }
    return false;
};

// Helper: Check if all conditions in 'when' are satisfied (no changes needed)
const evaluateConditionSet = (when, address) => {
    for (const cond of when) {
        if (cond.type === 'location') {
            if (!evaluateLocationCondition(cond, address)) return false;
        }
    }
    return true;
};

/**
 * Helper: Evaluate cost formula with modifiers using decimal.js
 * @param {number} baseCost - The base cost for shipping (as a number).
 * @param {Object} modifiers - The cost modifiers (values are numbers).
 * @param {number} itemCount - The number of items.
 * @param {Decimal} orderTotalDecimal - The total value of the items (as a Decimal object).
 * @returns {Decimal} - The calculated cost as a Decimal object.
 */
const evaluateFormula = (baseCost, modifiers, itemCount, orderTotalDecimal) => {
    let cost = new Decimal(0);

    const extraPerItemCost = modifiers.extraPerItemCost || 0;
    const freeItems = modifiers.freeItemCount || 0;
    const extraEnabled = modifiers.extraPerItemEnabled;

    // Promote numbers to Decimals at the point of calculation
    const baseCostDecimal = new Decimal(baseCost);

    if (extraEnabled) {
        const extraItemsCount = Math.max(0, itemCount - freeItems);
        // Calculation involves a number and a Decimal, so result is a Decimal
        const extraItemsCost = new Decimal(extraPerItemCost).times(extraItemsCount);
        cost = baseCostDecimal.plus(extraItemsCost);
    } else {
        cost = baseCostDecimal.times(itemCount);
    }

    const discountThreshold = modifiers.discountThreshold || 0;
    // A Decimal can be compared to a JS number directly
    if (modifiers.discountEnabled && orderTotalDecimal.greaterThan(discountThreshold)) {
        const discountPercentage = modifiers.discountPercentage || 0;
        const discountRate = new Decimal(100).minus(discountPercentage).div(100);
        cost = cost.times(discountRate);
    }

    const capAmount = modifiers.capAmount;
    if (modifiers.capEnabled && capAmount !== undefined) {
        // Promote the capAmount number to a Decimal for the comparison
        cost = Decimal.min(cost, new Decimal(capAmount));
    }

    return cost;
};

/**
 * Grouping-aware shipping calculator using decimal.js
 * @param {string} storeId
 * @param {Array} items - The items in the cart.
 * @param {Object} deliveryAddress - The delivery address.
 * @returns {Promise<number|null>} - The total shipping cost or null if shipping is not possible.
 */
const calculateShipping = async (storeId, items, deliveryAddress) => {
    let totalShippingCost = new Decimal(0);
    const productIds = items.map(i => i.product.productId);
    const assignments = await knex('product_shipping_rules').whereIn('productId', productIds);
    const ruleIds = [...new Set(assignments.map(a => a.shippingRuleId))];
    const rules = await knex('shipping_rules')
        .whereIn('shippingRuleId', ruleIds)
        .andWhere('storeId', storeId)
        .andWhere('isActive', true);
    const ruleMap = Object.fromEntries(rules.map(rule => [rule.shippingRuleId, rule]));

    const bundledGroups = {};
    const ungroupedItems = [];

    for (const item of items) {
        const { product } = item;
        const assignment = assignments.find(a => a.productId === product.productId);
        if (!assignment) continue;

        const rule = ruleMap[assignment.shippingRuleId];
        if (!rule || !Array.isArray(rule.conditions)) continue;

        const deliveryCountry = deliveryAddress?.country?.toLowerCase();
        const domesticCountry = 'india';

        if (deliveryCountry && deliveryCountry !== domesticCountry && !rule.is_international_shipping_enabled) {
            return null; // Cannot ship internationally with this rule.
        }

        const groupKey = rule.groupingEnabled ? assignment.shippingRuleId : null;
        if (groupKey) {
            if (!bundledGroups[groupKey]) bundledGroups[groupKey] = [];
            bundledGroups[groupKey].push({ item, rule });
        } else {
            ungroupedItems.push({ item, rule });
        }
    }

    // 1️⃣ Handle grouped (bundled) shipping
    for (const group of Object.values(bundledGroups)) {
        const rule = group[0].rule;
        const itemsInGroup = group.map(g => g.item);

        const totalItemCount = itemsInGroup.reduce((sum, i) => sum + i.quantity, 0);
        // Correctly calculate totalOrderTotal using product.price (the decimal string)
        const totalOrderTotalDecimal = itemsInGroup.reduce(
            (sum, i) => sum.plus(new Decimal(i.product.price).times(i.quantity)),
            new Decimal(0)
        );

        let matchedCondition = rule.conditions.find(c => evaluateConditionSet(c.when, deliveryAddress)) ||
            rule.conditions.find(c => c.when.length === 0);

        if (!matchedCondition) continue;

        const cost = evaluateFormula(
            matchedCondition.baseCost || 0, // Pass as number
            matchedCondition.costModifiers || {},
            totalItemCount,
            totalOrderTotalDecimal // Pass as Decimal
        );

        totalShippingCost = totalShippingCost.plus(cost);
    }

    // 2️⃣ Handle ungrouped items (per item)
    for (const { item, rule } of ungroupedItems) {
        const matchedCondition = rule.conditions.find(c => evaluateConditionSet(c.when, deliveryAddress)) ||
            rule.conditions.find(c => c.when.length === 0);

        if (!matchedCondition) continue;

        const itemCount = item.quantity;
        // Correctly calculate orderTotal using product.price (the decimal string)
        const orderTotalDecimal = new Decimal(item.product.price).times(item.quantity);

        const cost = evaluateFormula(
            matchedCondition.baseCost || 0, // Pass as number
            matchedCondition.costModifiers || {},
            itemCount,
            orderTotalDecimal // Pass as Decimal
        );

        totalShippingCost = totalShippingCost.plus(cost);
    }

    return totalShippingCost.toDP(2).toNumber();
};

module.exports = { calculateShipping };