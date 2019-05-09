const utils = require('../../components/utils');

const FeeController = {

  /**
   * Returns the Stripe service fee - the percentage HorseLinc will take
   */
  fee: async (req, res) => {
    const fee = process.env.STRIPE_SERVICE_FEE_PERCENTAGE || 0.05;

    utils.respondWithResult(res)({ fee });
  },

};

module.exports = FeeController;
