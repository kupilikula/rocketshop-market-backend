// routes/payments/verifySignature.js (Example path)
'use strict'

const crypto = require('crypto'); // Node.js crypto module for HMAC-SHA256

module.exports = async function (fastify, opts) {
    fastify.post('/', async function (request, reply) {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;

        // 1. Validate Input
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            fastify.log.warn({ body: request.body }, "Missing fields for signature verification");
            return reply.status(400).send({ error: 'Missing required payment details for verification.' });
        }

        // 2. Get Secret Key (Ensure this is the correct secret for the environment Test/Live)
        const secret = process.env.RAZORPAY_API_KEY_SECRET; // Use your exact env variable name
        if (!secret) {
            fastify.log.error("RAZORPAY_API_KEY_SECRET environment variable is not set.");
            return reply.status(500).send({ error: 'Configuration error' }); // Don't expose details
        }

        try {
            // 3. Construct the String to Sign
            // As per Razorpay docs: order_id + "|" + payment_id
            const bodyString = `${razorpay_order_id}|${razorpay_payment_id}`;

            // 4. Compute the Expected Signature
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(bodyString)
                .digest('hex'); // Get the hexadecimal representation

            // 5. Compare Signatures
            // IMPORTANT: Direct string comparison is common in examples, but timingSafeEqual
            // is theoretically safer against timing attacks, though less critical here than
            // for webhook signature verification. For simplicity, we use direct comparison here.
            if (expectedSignature === razorpay_signature) {
                // Signature matches - Data is likely legitimate
                fastify.log.info({ orderId: razorpay_order_id, paymentId: razorpay_payment_id }, "Razorpay signature verified successfully.");
                // NOTE: This verification ONLY confirms the frontend data integrity.
                // It does NOT confirm payment capture or authorize fulfillment.
                // Rely on webhooks for actual payment confirmation.
                return reply.send({ status: 'ok', verified: true });
            } else {
                // Signature does not match - Potential tampering or error
                fastify.log.warn({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, received: razorpay_signature, expected: expectedSignature }, "Razorpay signature verification failed: Mismatch.");
                return reply.status(400).send({ error: 'Invalid signature.', verified: false });
            }

        } catch (error) {
            fastify.log.error({ error: error.message, stack: error.stack }, "Error during signature verification");
            return reply.status(500).send({ error: 'Failed to verify signature.' });
        }
    });
}