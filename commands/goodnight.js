const { pick } = require('./contentBank');
async function goodnightCommand(sock, chatId, message) {
  await sock.sendMessage(chatId, { text: pick('goodnight') }, { quoted: message });
}
module.exports = { goodnightCommand };
