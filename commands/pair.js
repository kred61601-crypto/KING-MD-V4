const axios = require('axios');
const { sleep } = require('../lib/myfunc');
async function pairCommand(sock, chatId, message, q) {
  const number = String(q || '').replace(/[^0-9]/g, '');
  if (number.length < 8 || number.length > 15) return sock.sendMessage(chatId, { text: 'Use .pair followed by the international WhatsApp number, including country code. Example: .pair 2547XXXXXXXX' }, { quoted: message });
  try {
    await sock.sendMessage(chatId, { text: '⏳ Requesting a pairing code from this KING MD engine...' }, { quoted: message });
    const port = Number(process.env.PAIR_API_PORT || process.env.PORT || 8000);
    const base = String(process.env.KING_MD_ENGINE_LOCAL_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
    const response = await axios.get(`${base}/pair`, { params: { number }, timeout: 45000 });
    const code = response.data?.pairingCode || response.data?.code;
    if (!response.data?.success || !code) throw new Error(response.data?.error || 'Pairing code was not returned');
    await sleep(1000);
    await sock.sendMessage(chatId, { text: `🔐 Your WhatsApp pairing code: *${code}*\n\nEnter this code on the phone you are connecting.` }, { quoted: message });
  } catch (error) {
    const detail = error.response?.data?.error || error.message || 'Unknown error';
    await sock.sendMessage(chatId, { text: `❌ Pairing request failed: ${detail}\n\nUse the KING MD app pairing page if this bot is already connected.` }, { quoted: message });
  }
}
module.exports = pairCommand;
