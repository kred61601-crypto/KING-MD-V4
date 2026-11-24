const { pick } = require('./contentBank');
async function truthCommand(sock, chatId, message) {
  await sock.sendMessage(chatId, { text: pick('truth') }, { quoted: message });
}
module.exports = { truthCommand };
