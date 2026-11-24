const fs = require('fs');
const path = require('path');
function getBotNumber(sock) {
  return String(sock.user?.id || '').split(':')[0].replace(/\D/g, '');
}
async function passwordCommand(sock, chatId, message) {
  const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });
  if (String(chatId || '').endsWith('@g.us')) return reply('🔐 For security, request your password in a private chat with your own bot.');
  const botNumber = getBotNumber(sock);
  const chatNumber = String(chatId || '').split('@')[0].replace(/\D/g, '');
  if (!botNumber || chatNumber !== botNumber) return reply('❌ Password recovery is only available in the bot number\'s own private chat.');
  try {
    const file = path.join(process.cwd(), 'data', 'manage-passwords.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const password = saved[botNumber];
    if (!password) return reply('⚠️ Your Manage-Bot password is not saved yet. Please wait for the first connection setup to finish.');
    return reply(`📱 Your Bot Number: +${botNumber}\n🔐 Your Manage-Bot Password: ${password}\n\nCopy and paste it into the KING MD app. This is your original saved password.`);
  } catch (error) {
    console.error('[password]', error.message || error);
    return reply('❌ Could not read your saved password. Please try again later.');
  }
}
module.exports = passwordCommand;
