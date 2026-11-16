 require('dotenv').config();

const settings = {
  packname: 'KING MD V4',
  author: '‎',
  botName: "KING MD V4",
  botOwner: 'KING MD V4', // Your name
  ownerNumber: '254726476468', //Set your number here without + symbol, just add country code & number without any space
  giphyApiKey: 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq',
  commandMode: "public",
  maxStoreMessages: 20, 
  storeWriteInterval: 10000,
  description: "KING MD V4 WhatsApp automation bot.",
  version: "3.0.8",
  updateZipUrl: "https://github.com/mruniquehacker/Knightbot-MD/archive/refs/heads/main.zip",
  // Media API (song, video, cards, etc.)
  knightApiUrl: process.env.KNIGHT_API_URL || 'https://king-md-v1-51j8.onrender.com',
  knightApiKey: process.env.KNIGHT_API_KEY || 'knight',
  mediaApiUrl: process.env.MEDIA_API_URL || 'https://king-md-v1-51j8.onrender.com',
  mediaApiKey: process.env.MEDIA_API_KEY || 'knight',
  princeApiUrl: process.env.PRINCE_API_URL || 'https://api.princetechn.com',
  princeApiKey: process.env.PRINCE_API_KEY || 'prince',
};

module.exports = settings;
