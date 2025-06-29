require('dotenv').config();
const mongoose = require('mongoose');
const { encrypt } = require('./encryption');

const MONGO_URI = process.env.MONGODB_URI;
const moodSchema = new mongoose.Schema({ date: mongoose.Schema.Types.Mixed }, { strict: false });
const Mood = mongoose.model('Mood', moodSchema, 'moods');

(async () => {
  await mongoose.connect(MONGO_URI);
  // Find moods where mood, journalEntry, or journalTitle are not encrypted (assume not encrypted if not containing ':', which is used in our IV:encrypted format)
  const moods = await Mood.find({ $or: [
    { mood: { $exists: true, $not: /:/ } },
    { journalEntry: { $exists: true, $not: /:/ } },
    { journalTitle: { $exists: true, $not: /:/ } }
  ] });
  console.log(`Found ${moods.length} moods with unencrypted fields.`);
  for (const mood of moods) {
    let update = {};
    if (mood.mood && typeof mood.mood === 'string' && !mood.mood.includes(':')) {
      update.mood = encrypt(mood.mood);
    }
    if (mood.journalEntry && typeof mood.journalEntry === 'string' && !mood.journalEntry.includes(':')) {
      update.journalEntry = encrypt(mood.journalEntry);
    }
    if (mood.journalTitle && typeof mood.journalTitle === 'string' && !mood.journalTitle.includes(':')) {
      update.journalTitle = encrypt(mood.journalTitle);
    }
    if (Object.keys(update).length > 0) {
      await Mood.updateOne({ _id: mood._id }, { $set: update });
      console.log(`Updated mood ${mood._id} with encrypted fields.`);
    }
  }
  console.log('Migration complete!');
  process.exit();
})(); 