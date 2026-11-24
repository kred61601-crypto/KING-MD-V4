const { pick } = require('./contentBank');
async function flirtCommand(sock, chatId, message) {
  await sock.sendMessage(chatId, { text: pick('flirt') }, { quoted: message });
}
module.exports = { flirtCommand };
