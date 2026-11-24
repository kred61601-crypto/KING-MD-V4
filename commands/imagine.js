const axios = require('axios');
async function imagineCommand(sock, chatId, message) {
  const raw = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
  const prompt = raw.replace(/^\.(?:imagine|flux|dalle)\s*/i, '').trim();
  if (!prompt) return sock.sendMessage(chatId, { text: 'Give me an image prompt. Example: .imagine a sunset over Nairobi' }, { quoted: message });
  await sock.sendMessage(chatId, { text: '🎨 Creating your image. Please wait...' }, { quoted: message });
  try {
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&nologo=true';
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000, maxContentLength: 15 * 1024 * 1024 });
    const buffer = Buffer.from(response.data);
    if (!buffer.length || !String(response.headers['content-type'] || '').includes('image')) throw new Error('Image provider returned no image');
    await sock.sendMessage(chatId, { image: buffer, caption: `🎨 ${prompt}` }, { quoted: message });
  } catch (error) {
    console.error('[imagine]', error.message || error);
    await sock.sendMessage(chatId, { text: '❌ Image generation is temporarily unavailable. Please try again later.' }, { quoted: message });
  }
}
module.exports = imagineCommand;
