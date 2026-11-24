const { pick } = require('./contentBank');
module.exports = async function quoteCommand(sock, chatId, message) {
  await sock.sendMessage(chatId, { text: '💬 ' + pick('quote') }, { quoted: message });
};
