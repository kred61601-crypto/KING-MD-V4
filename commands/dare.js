const { pick } = require('./contentBank');
async function dareCommand(sock, chatId, message) {
  await sock.sendMessage(chatId, { text: pick('dare') }, { quoted: message });
}
module.exports = { dareCommand };
