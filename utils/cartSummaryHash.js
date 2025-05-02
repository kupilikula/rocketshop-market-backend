const crypto = require('crypto');

/**
 * Compute a stable cart hash from a cartSummary structure.
 * Only includes productId and quantity per item (ignores prices, metadata, etc).
 */
export function computeCartSummaryHash(cartSummary) {
    const normalizedItems = cartSummary
        .sort((a, b) => a.storeId.localeCompare(b.storeId))
        .flatMap(store =>
            (store.items || [])
                .map(item => ({
                    productId: item?.product?.productId,
                    quantity: item?.quantity ?? 0,
                }))
        )
        .filter(item => item.productId && item.quantity > 0)
        .sort((a, b) => a.productId.localeCompare(b.productId))

    const serialized = JSON.stringify(normalizedItems);

    return crypto.createHash('sha256').update(serialized).digest('hex');
}