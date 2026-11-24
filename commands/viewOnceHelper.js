const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
function unwrap(message) {
  let m = message?.message || {};
  for (let i = 0; i < 4; i++) {
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    else if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    else if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    else if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    else break;
  }
  return m;
}
function senderJid(message, senderId) {
  let jid = senderId || message.key?.participant || message.key?.remoteJid || '';
  if (String(jid).endsWith('@g.us')) jid = message.key?.participant || '';
  return String(jid).replace(/:\d+@/, '@');
}
async function deliverViewOnce(sock, chatId, message, senderId, toDm) {
  const fail = (text) => sock.sendMessage(chatId, { text }, { quoted: message });
  try {
    const outer = message.message || {};
    const ctx = outer.extendedTextMessage?.contextInfo || outer.imageMessage?.contextInfo || outer.videoMessage?.contextInfo || outer.buttonsResponseMessage?.contextInfo || outer.listResponseMessage?.contextInfo;
    if (!ctx?.quotedMessage) return fail('🗑️ Reply directly to a view-once photo, video, or audio message.');
    const quoted = ctx.quotedMessage;
    let media = null;
    let type = '';
    const root = quoted.viewOnceMessageV2Extension?.message || quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted;
    const unwrapped = unwrap({ message: root });
    for (const key of ['imageMessage', 'videoMessage', 'audioMessage']) {
      const item = unwrapped[key];
      if (item && (item.viewOnce || root === quoted.viewOnceMessageV2?.message || root === quoted.viewOnceMessageV2Extension?.message || root === quoted.viewOnceMessage?.message)) { media = item; type = key.replace('Message', ''); break; }
    }
    if (!media) return fail('❌ This reply does not contain supported view-once media.');
    const stream = await downloadContentFromMessage(media, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new Error('WhatsApp returned an empty media file');
    const dest = toDm ? senderJid(message, senderId) : chatId;
    if (!dest || dest.endsWith('@g.us') || dest.endsWith('@broadcast')) return fail('❌ Could not determine your private chat.');
    const payload = type === 'image' ? { image: buffer, caption: media.caption || '', mimetype: media.mimetype || 'image/jpeg' }
      : type === 'video' ? { video: buffer, caption: media.caption || '', mimetype: media.mimetype || 'video/mp4' }
      : { audio: buffer, ptt: false, mimetype: media.mimetype || 'audio/ogg; codecs=opus' };
    await sock.sendMessage(dest, payload);
    if (toDm && dest !== chatId) await fail('✅ View-once media sent to your private chat.');
  } catch (error) {
    console.error('[view-once]', error.message || error);
    await fail(`❌ Could not retrieve that media: ${error.message || 'unknown error'}`);
  }
}
module.exports = { deliverViewOnce };
