const mongoose = require('mongoose');
const Horse = require('../app/horse/horse.model');

/**
 * Connect to MongoDB depending on environment
 */
const mongoDatabase = 'mongodb://localhost/HorseLinc';
mongoose.connect(mongoDatabase);

Horse.find({})
  .then((horses) => {
    horses.forEach((horse) => {
      const horseClone = horse.toObject();
      // If the horse has an owner, add that owner to the new _owners array
      // With 100% ownership
      if (horseClone._owner) {
        const ownerObj = {
          _user: horseClone._owner,
          percentage: 100,
        };

        horse._owners.push(ownerObj);
        horse.save()
          .catch((err) => {
            console.error(`Error saving horse with _id: ${horse._id}: `, err);
          });
      }
    });
  });

