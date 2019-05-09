const mongoose = require('mongoose');

const ShowSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, lowercase: true },
}, { timestamps: true });

/**
 * Statics
 */
ShowSchema.statics = {

  /**
   * Find or create a new show
   * @param  {Object} show The Show object
   * @return {Object} Either the existing or a new show object   
   */
  findOrCreate: async (show) => {
    const Show = mongoose.model('Show', ShowSchema);

    // Trim and lowercase the show name before trying to find it
    const formattedName = show.name.trim().toLowerCase();

    const existingShow = await Show.findOne({
      name: formattedName,
    });

    // Return existing show or create a new one
    if (existingShow) {
      return existingShow;
    }

    const newShow = await Show.create({
      name: show.name,
    });

    return newShow;
  },

};

module.exports = mongoose.model('Show', ShowSchema);
