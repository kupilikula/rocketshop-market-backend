const knex = require('@database/knexInstance');

const calculateShipping = async (storeId, items, deliveryAddress) => {
    // Fetch shipping rules from database
    const shippingRules = await knex('shipping_rules')
        .where({ storeId, isActive: true })
        .orderBy('priority', 'asc');

    let totalShippingCost = 0;
    let processedItems = new Set();

    for (const rule of shippingRules) {
        let applicableItems = [];
        let totalItemCount = 0;
        let totalOrderTotal = 0;

        // Identify all items applicable to this rule before checking conditions
        for (const item of cartItems) {
            if (processedItems.has(item.productId)) continue;
            if (await isShippingRuleApplicable(item.productId, rule, deliveryAddress)) {
                applicableItems.push(item);
                totalItemCount += item.quantity;
                totalOrderTotal += item.price * item.quantity;
            }
        }

        // Apply rule only if the grouped items collectively meet the conditions
        if (applicableItems.length > 0 && evaluateRuleConditions(rule.conditions, deliveryAddress, totalOrderTotal, totalItemCount)) {
            totalShippingCost += evaluateFormula(rule.formula, {
                baseCost: rule.baseCost,
                itemCount: totalItemCount,
                orderTotal: totalOrderTotal
            });

            // Mark items as processed so they are not considered for further rules
            for (const item of applicableItems) {
                processedItems.add(item.productId);
            }
        }
    }

    return totalShippingCost;
};

const isShippingRuleApplicable = async (productId, rule) => {
    const { applicableTo } = rule;

    // Fetch product details (including collections and tags)
    const product = await knex('products')
        .where('productId', productId)
        .select('productId', 'productTags')
        .first();

    if (!product) return false;

    if (applicableTo.storeWide) {
        return true;
    }

    // Fetch collections for the product
    const collections = await knex('productCollections')
        .where('productId', productId)
        .pluck('collectionId');

    const { productTags } = product;

    return (
        (applicableTo.productIds && applicableTo.productIds.includes(productId)) ||
        (applicableTo.collectionIds && applicableTo.collectionIds.some(id => collections.includes(id))) ||
        (applicableTo.productTags && applicableTo.productTags.some(tag => productTags.includes(tag)))
    );
};

const evaluateRuleConditions = (conditions, deliveryAddress, orderTotal, itemCount) => {
    for (const condition of conditions) {
        if (!evaluateCondition(condition, deliveryAddress, orderTotal, itemCount)) {
            return false;
        }
    }
    return true;
};

const evaluateCondition = (condition, deliveryAddress, orderTotal, itemCount) => {
    const { type, operator, value, minValue, maxValue } = condition;

    switch (type) {
        case 'location':
            return evaluateLocationCondition(condition, deliveryAddress);
        case 'orderTotal':
            return evaluateNumericCondition(orderTotal, operator, value, minValue, maxValue);
        case 'itemCount':
            return evaluateNumericCondition(itemCount, operator, value);
        default:
            return true;
    }
};

const evaluateLocationCondition = (condition, address) => {
    if (!address) return false;

    const valueToCheck = condition.locationType === 'city' ? address.city :
        condition.locationType === 'state' ? address.state :
            address.country;

    if (condition.operator === 'inside') {
        return valueToCheck === (condition.city || condition.state || condition.country);
    } else if (condition.operator === 'outside') {
        return valueToCheck !== (condition.city || condition.state || condition.country);
    }
    return false;
};

const evaluateNumericCondition = (fieldValue, operator, value, minValue, maxValue) => {
    if (operator === '>') return fieldValue > value;
    if (operator === '<') return fieldValue < value;
    if (operator === '=') return fieldValue === value;
    if (operator === 'range') return fieldValue >= minValue && fieldValue <= maxValue;
    return false;
};

const evaluateFormula = (formula, variables) => {
    // Replace function names with Math equivalents
    const safeFormula = formula
        .replace(/\bMax\b/g, 'Math.max')
        .replace(/\bMin\b/g, 'Math.min')
        .replace(/\bFloor\b/g, 'Math.floor')
        .replace(/\bCeil\b/g, 'Math.ceil');

    // Replace variable names with actual values
    const expression = Object.keys(variables).reduce((expr, key) => {
        return expr.replace(new RegExp(`\\b${key}\\b`, 'g'), variables[key]);
    }, safeFormula);

    return new Function(`return ${expression};`)();
};

module.exports = { calculateShipping };
