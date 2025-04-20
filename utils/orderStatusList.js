const orderStatusList = [
    "Order Created",
    "Payment Initiated",
    "Payment Failed",
    "Payment Received",
    "Processing",
    "Ready for Pickup",
    "Awaiting Shipment",
    "Shipped",
    "Out for Delivery",
    "Delivered",
    "On Hold",
    "Canceled",
    "Refund Requested",
    "Refund Processed",
    "Failed",
    "Returned",
];

// === Semantic Groups ===

const PENDING_STATUSES = [
    "Order Created",
    "Payment Initiated",
];

const IN_PROGRESS_STATUSES = [
    "Payment Received",
    "Processing",
    "Ready for Pickup",
    "Awaiting Shipment",
];

const FULFILLED_STATUSES = [
    "Shipped",
    "Out for Delivery",
    "Delivered",
];

const ON_HOLD_STATUSES = [
    "On Hold",
];

const CANCELED_OR_FAILED_STATUSES = [
    "Canceled",
    "Payment Failed",
    "Failed",
];

const REFUNDED_OR_RETURNED_STATUSES = [
    "Refund Requested",
    "Refund Processed",
    "Returned",
];

// === Functions to expose ===

const getPendingOrderStatuses = () => PENDING_STATUSES;

const getInProgressOrderStatuses = () => IN_PROGRESS_STATUSES;

const getFulfilledOrderStatuses = () => FULFILLED_STATUSES;

const getOnHoldOrderStatuses = () => ON_HOLD_STATUSES;

const getCanceledOrFailedOrderStatuses = () => CANCELED_OR_FAILED_STATUSES;

const getRefundedOrReturnedOrderStatuses = () => REFUNDED_OR_RETURNED_STATUSES;

const getSalesEligibleOrderStatuses = () => [
    ...IN_PROGRESS_STATUSES,
    ...FULFILLED_STATUSES,
];

const getReviewEligibleOrderStatuses = () => [
    ...IN_PROGRESS_STATUSES,
    ...FULFILLED_STATUSES,
];


const getCompletedOrderStatuses = () => FULFILLED_STATUSES;

module.exports = {
    orderStatusList,
    getPendingOrderStatuses,
    getInProgressOrderStatuses,
    getFulfilledOrderStatuses,
    getOnHoldOrderStatuses,
    getCanceledOrFailedOrderStatuses,
    getRefundedOrReturnedOrderStatuses,
    getSalesEligibleOrderStatuses,
    getReviewEligibleOrderStatuses,
    getCompletedOrderStatuses,
};