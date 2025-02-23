const knex = require('@database/knexInstance');

const calculateShipping = async (storeId, items) => {
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

        for (const item of items) {
            if (processedItems.has(item.product.productId)) continue;
            if (await isShippingRuleApplicable(item.product.productId, rule)) {
                applicableItems.push(item);
                totalItemCount += item.quantity;
                totalOrderTotal += item.product.price * item.quantity;
            }
        }

        if (applicableItems.length > 0) {
            const groupShippingCost = evaluateFormula(rule.formula, {
                baseCost: rule.baseCost,
                itemCount: totalItemCount,
                orderTotal: totalOrderTotal
            });
            totalShippingCost += groupShippingCost;

            // Mark items as processed to avoid applying another rule
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
