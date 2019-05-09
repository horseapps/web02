const path = require('path');
const fs = require('fs');
const utils = require('../../components/utils');

const LegalController = {

  /**
   * Sends HTML of terms of service
   */
  termsOfService: async (req, res, next) => {
    try {
      fs.readFile(path.join(__dirname, 'termsOfService.html'), 'utf8', (err, data) => {
        if (err) {
          return utils.handleError(next)(err);
        }

        const response = { termsOfService: data };
        return utils.respondWithResult(res)(response);
      });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Sends HTML of privacy policy
   */
  privacyPolicy: async (req, res, next) => {
    try {
      fs.readFile(path.join(__dirname, 'privacyPolicy.html'), 'utf8', (err, data) => {
        if (err) {
          return utils.handleError(next)(err);
        }

        const response = { privacyPolicy: data };
        return utils.respondWithResult(res)(response);
      });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

};

module.exports = LegalController;
