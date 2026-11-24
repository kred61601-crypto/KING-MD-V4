const fetch = require('node-fetch');
const { pick } = require('./contentBank');

async function memeCommand(sock, chatId, message) {
  try {
    const response = await fetch('https://meme-api.com/gimme/wholesomememes', { timeout: 12000 });
    if (!response.ok) throw new Error(`Meme service returned ${response.status}`);
    const data = await response.json();
    if (data.nsfw || !data.url || !/\.(jpe?g|png|webp)(\?|$)/i.test(data.url)) throw new Error('No safe image meme was returned');
    const image = await fetch(data.url, { timeout: 15000 });
    if (!image.ok) throw new Error('Could not download meme image');
    const buffer = await image.buffer();
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error('Meme image is empty or too large');
    await sock.sendMessage(chatId, { image: buffer, caption: `😂 ${data.title || 'KING MD Meme'}\n\nType .meme for another one.` }, { quoted: message });
  } catch (error) {
    console.error('[meme]', error.message || error);
    await sock.sendMessage(chatId, { text: '😂 KING MD MEME\n\n' + pick('meme') + '\n\nType .meme for another one.' }, { quoted: message });
  }
}
module.exports = memeCommand;
