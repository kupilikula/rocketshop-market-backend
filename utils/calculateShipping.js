'use strict';

const knex = require('@database/knexInstance');

// Helper: Check if address satisfies location condition
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
        return address.country?.toLowerCase() === country?.toLowerCase();
    }

    return false;
};

// Helper: Check if all conditions in 'when' are satisfied
const evaluateConditionSet = (when, address) => {
    for (const cond of when) {
        if (cond.type === 'location') {
            if (!evaluateLocationCondition(cond, address)) return false;
        }
    }
    return true;
};

// Helper: Evaluate cost formula with modifiers
const evaluateFormula = (baseCost, modifiers, itemCount, orderTotal) => {
    let cost = 0;

    const extraEnabled = modifiers.extraPerItemEnabled;

    if (extraEnabled) {
        const freeItems = Number(modifiers.freeItemCount || 0);
        const extraItems = Math.max(0, itemCount - freeItems);
        cost = baseCost + (extraItems * Number(modifiers.extraPerItemCost || 0));
    } else {
        // 💡 Treat baseCost as per item if no extra item logic
        cost = baseCost * itemCount;
    }

    if (modifiers.discountEnabled && orderTotal > Number(modifiers.discountThreshold || 0)) {
        const discountRate = (100 - Number(modifiers.discountPercentage || 0)) / 100;
        cost *= discountRate;
    }

    if (modifiers.capEnabled) {
        cost = Math.min(cost, Number(modifiers.capAmount || cost));
    }

    return Math.round(cost * 100) / 100;
};

// 🧠 Grouping-aware shipping calculator
const calculateShipping = async (storeId, items, deliveryAddress) => {
    let totalShippingCost = 0;

    const productIds = items.map(i => i.product.productId);

    // Fetch all rule assignments in one query
    const assignments = await knex('product_shipping_rules')
        .whereIn('productId', productIds);

    const ruleIds = [...new Set(assignments.map(a => a.shippingRuleId))];

    const rules = await knex('shipping_rules')
        .whereIn('shippingRuleId', ruleIds)
        .andWhere('storeId', storeId)
        .andWhere('isActive', true);

    const ruleMap = Object.fromEntries(rules.map(rule => [rule.shippingRuleId, rule]));

    // Group items: groupingEnabled rules → group; others → separate
    const bundledGroups = {}; // key = ruleId
    const ungroupedItems = [];

    for (const item of items) {
        const { product } = item;
        const assignment = assignments.find(a => a.productId === product.productId);
        if (!assignment) continue;

        const rule = ruleMap[assignment.shippingRuleId];
        if (!rule || !Array.isArray(rule.conditions)) continue;

        const deliveryCountry = deliveryAddress?.country?.toLowerCase();
        const domesticCountry = 'india'; // Define your primary domestic country

        if (deliveryCountry && deliveryCountry !== domesticCountry && !rule.is_international_shipping_enabled) {
            // International address, but this rule does not have international shipping enabled
            return null;
                         // The frontend/cart will use this to block checkout or show "Cannot ship to this address."
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
    for (const [ruleId, group] of Object.entries(bundledGroups)) {
        const rule = group[0].rule;
        const itemsInGroup = group.map(g => g.item);

        const totalItemCount = itemsInGroup.reduce((sum, i) => sum + i.quantity, 0);
        const totalOrderTotal = itemsInGroup.reduce((sum, i) => sum + i.quantity * i.price, 0);

        let matchedCondition = rule.conditions.find(c => evaluateConditionSet(c.when, deliveryAddress)) ||
            rule.conditions.find(c => c.when.length === 0);

        if (!matchedCondition) continue;

        const cost = evaluateFormula(
            Number(matchedCondition.baseCost || 0),
            matchedCondition.costModifiers || {},
            totalItemCount,
            totalOrderTotal
        );

        totalShippingCost += cost;
    }

    // 2️⃣ Handle ungrouped items (per item)
    for (const { item, rule } of ungroupedItems) {
        const matchedCondition = rule.conditions.find(c => evaluateConditionSet(c.when, deliveryAddress)) ||
            rule.conditions.find(c => c.when.length === 0);

        if (!matchedCondition) continue;

        const itemCount = item.quantity;
        const orderTotal = item.price * item.quantity;

        const cost = evaluateFormula(
            Number(matchedCondition.baseCost || 0),
            matchedCondition.costModifiers || {},
            itemCount,
            orderTotal
        );

        totalShippingCost += cost;
    }

    return Math.round(totalShippingCost * 100) / 100;
};

module.exports = { calculateShipping };