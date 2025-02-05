'use strict'

const knex = require("@database/knexInstance");
const {isOfferApplicable} = require("../../utils/calculateDiscount");

module.exports = async function (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    const { productId, collectionId } = request.query;

    try {
      if (!productId && !collectionId) {
        return reply.status(400).send({ error: "Either productId or collectionId is required." });
      }

      // Fetch active offers for all stores
      let offersQuery = knex("offers")
          .where("isActive", true)
          .andWhereRaw(`("validityDateRange"->>'validFrom')::timestamptz <= NOW()`)
          .andWhereRaw(`("validityDateRange"->>'validUntil')::timestamptz > NOW()`);

      const offers = await offersQuery;

      let applicableOffers = [];

      for (const offer of offers) {
        if (productId && (await isOfferApplicable(productId, offer))) {
          applicableOffers.push(offer);
        } else if (collectionId && offer.applicableTo.collectionIds?.includes(collectionId)) {
          applicableOffers.push(offer);
        }
      }

      return reply.send({ offers: applicableOffers });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: "Failed to fetch applicable offers." });
    }
  });
};