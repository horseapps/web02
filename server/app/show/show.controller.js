const Show = require('./show.model');
const utils = require('../../components/utils');

const WHITELIST_ATTRIBUTES = [
  '_id',
  'name',
];

const ShowController = {

  /**
   * Gets a list of shows
   */
  index: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const sort = req.query.sort || 'name';
      const select = WHITELIST_ATTRIBUTES.join(' ');

      // TODO: Build query based on params
      const query = {};

      // If a searchTerm is sent we need to search shows by name
      if (req.query.searchTerm) {
        query.name = { $regex: new RegExp(req.query.searchTerm, 'i') };
      }

      const showCount = await Show
        .find(query)
        .count();
      const shows = await Show
        .find(query)
        .select(select)
        .sort(sort)
        .limit(limit)
        .skip(skip);

      utils.respondWithResult(res)({ shows, showCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },
};

module.exports = ShowController;
