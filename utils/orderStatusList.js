const orderStatusList = [
    "Order Created", // Order has been placed by the customer
    "Payment Initiated", // Payment is not yet confirmed
    "Payment Received", // Payment has been successfully processed
    "Payment Failed", // Payment has been successfully processed
    "Processing", // Order is being prepared
    "Ready for Pickup", // For pickup orders, when ready at the store
    "Awaiting Shipment", // Order is packed but not shipped
    "Shipped", // Order has been dispatched
    "Out for Delivery", // Order is out for delivery
    "Delivered", // Order has been delivered
    "On Hold", // Order is temporarily on hold
    "Canceled", // Order has been canceled
    "Refund Requested", // Customer has requested a refund
    "Refund Processed", // Refund has been issued
    "Failed", // Order failed (e.g., payment or processing issue)
    "Returned", // Product has been returned by the customer
];

const getCompletedOrderStatuses = () => {
    const shippedIndex = orderStatusList.indexOf("Payment Received");
    return orderStatusList.slice(shippedIndex); // All statuses from 'Payment Received' onwards
};

module.exports = {orderStatusList, getCompletedOrderStatuses};