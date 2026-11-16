const settings = require('../settings');

async function channelCommand(sock, chatId, message) {
  try {
    const sender = message.key.participant || message.key.remoteJid;
    const isOwner = sender?.includes(settings.ownerNumber) || chatId?.includes(settings.ownerNumber) || message.key.fromMe;
    if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only owner can post to Status.' }, { quoted: message });

    const fullText = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
    const textAfterCmd = fullText.split(' ').slice(1).join(' ').trim();

    const ctx = message.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const qText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
    const qImage = quoted?.imageMessage;
    const qVideo = quoted?.videoMessage;
    const finalText = textAfterCmd || qText || '';

    if (!quoted && !finalText) {
      return sock.sendMessage(chatId, { text: `*STATUS POST - .channel*\n\n1. Reply to any message/image/video in DM / Self DM:\nReply + .channel\n\n2. Or type:\n.channel Hello KING MD 🔥\n\n3. Reply + caption:\nReply + .channel My caption` }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: '⏳ Posting to Status...' }, { quoted: message });

    const STATUS_JID = 'status@broadcast';
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

    if (qImage) {
      const stream = await downloadContentFromMessage(qImage, 'image');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await sock.sendMessage(STATUS_JID, { image: buffer, caption: finalText || '🔥 KING MD V4' });
    } else if (qVideo) {
      const stream = await downloadContentFromMessage(qVideo, 'video');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await sock.sendMessage(STATUS_JID, { video: buffer, caption: finalText || '🔥 KING MD V4', mimetype: 'video/mp4' });
    } else {
      await sock.sendMessage(STATUS_JID, { text: finalText });
    }

    await sock.sendMessage(chatId, { text: `✅ Posted to STATUS!\n\n${finalText.slice(0,100)}\n\nGo to WhatsApp → Status → My Status.` }, { quoted: message });

  } catch (err) {
    console.error('[channel-status]', err);
    await sock.sendMessage(chatId, { text: `❌ Failed to post to Status.\nReason: ${err.message}` }, { quoted: message });
  }
}

module.exports = { channelCommand };
