require('dotenv').config();
const mongoose = require('mongoose');
const { encrypt } = require('./encryption');

const MONGO_URI = process.env.MONGODB_URI;
const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema, 'chats');

(async () => {
  await mongoose.connect(MONGO_URI);
  // Find chats where userMessage or botResponse are not encrypted (assume not encrypted if not containing ':')
  const chats = await Chat.find({ $or: [
    { userMessage: { $exists: true, $not: /:/ } },
    { botResponse: { $exists: true, $not: /:/ } }
  ] });
  console.log(`Found ${chats.length} chats with unencrypted fields.`);
  for (const chat of chats) {
    let update = {};
    if (chat.userMessage && typeof chat.userMessage === 'string' && !chat.userMessage.includes(':')) {
      update.userMessage = encrypt(chat.userMessage);
    }
    if (chat.botResponse && typeof chat.botResponse === 'string' && !chat.botResponse.includes(':')) {
      update.botResponse = encrypt(chat.botResponse);
    }
    if (Object.keys(update).length > 0) {
      await Chat.updateOne({ _id: chat._id }, { $set: update });
      console.log(`Updated chat ${chat._id} with encrypted fields.`);
    }
  }
  console.log('Chat migration complete!');
  process.exit();
})(); 