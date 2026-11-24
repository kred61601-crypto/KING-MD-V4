const { pick } = require('./contentBank');
async function shayariCommand(sock, chatId, message) {
  const text = pick('shayari');
  await sock.sendMessage(chatId, { text: text + '\n\n🌹 Type .shayari for another one.' }, { quoted: message });
}
module.exports = { shayariCommand };
