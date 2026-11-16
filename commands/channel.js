const settings = require('../settings');

async function channelCommand(sock, chatId, message, args) {
  try {
    const sender = message.key.participant || message.key.remoteJid;
    const isOwner = sender?.includes(settings.ownerNumber) || chatId?.includes(settings.ownerNumber);
    if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only owner can post to Status.' }, { quoted: message });

    const fullText = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
    // .channel Hello KING  OR reply to something + .channel
    const textAfterCmd = fullText.split(' ').slice(1).join(' ').trim();

    // Check if replying to something
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedJid = ctx?.participant;
    
    // What did you reply to?
    const qText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
    const qImage = quoted?.imageMessage;
    const qVideo = quoted?.videoMessage;
    const qSticker = quoted?.stickerMessage;

    const finalText = textAfterCmd || qText || '';

    if (!quoted && !finalText) {
      return sock.sendMessage(chatId, { text: `*STATUS POST - .channel*\n\nHow to use:\n\n1. Reply to any message/image/video in your DM / Self DM:\n   Reply + .channel\n\n2. Or type directly:\n   .channel Hello KING MD 🔥\n\n3. Reply + add your own caption:\n   Reply + .channel My new caption\n\nIt will post to your WhatsApp STATUS, not inside channel.` }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: '⏳ Posting to Status...' }, { quoted: message });

    // ✅ STATUS JID in Baileys 6.7.18
    const STATUS_JID = 'status@broadcast';

    // 1. If reply to IMAGE
    if (qImage) {
      // Download quoted image
      const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
      const stream = await downloadContentFromMessage(qImage, 'image');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await sock.sendMessage(STATUS_JID, { image: buffer, caption: finalText || '🔥 KING MD V4' });
    }
    // 2. If reply to VIDEO
    else if (qVideo) {
      const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
      const stream = await downloadContentFromMessage(qVideo, 'video');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await sock.sendMessage(STATUS_JID, { video: buffer, caption: finalText || '🔥 KING MD V4', mimetype: 'video/mp4' });
    }
    // 3. If reply to TEXT / or direct text
    else {
      await sock.sendMessage(STATUS_JID, { text: finalText });
    }

    await sock.sendMessage(chatId, { text: `✅ Posted to STATUS!\n\n${finalText.slice(0,100)}\n\nGo to WhatsApp → Status → Check My Status.` }, { quoted: message });

  } catch (err) {
    console.error('[channel-status]', err);
    await sock.sendMessage(chatId, { text: `❌ Failed to post to Status.\n\nReason: ${err.message}\n\nMake sure bot is linked as companion device, not main phone.` }, { quoted: message });
  }
}

module.exports = { channelCommand };
