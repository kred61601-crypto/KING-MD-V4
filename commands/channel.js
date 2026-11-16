const settings = require('../settings');

async function channelCommand(sock, chatId, message) {
  try {
    const isOwner = message.key.fromMe || (message.key.participant || '').includes(settings.ownerNumber) || chatId.includes(settings.ownerNumber);
    if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only owner.' }, { quoted: message });

    const fullText = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
    // .channel caption + link
    // .channel KING MD UPDATE https://whatsapp.com/channel/0029Vb9AwScF6sn47ClubG1Z

    // ✅ 1. FIND CHANNEL LINK IN TEXT
    const linkMatch = fullText.match(/https:\/\/whatsapp\.com\/channel\/([A-Za-z0-9]+)/);
    const channelLink = linkMatch ? linkMatch[0] : null;
    const inviteCode = linkMatch ? linkMatch[1] : null;

    // Remove command + link from caption, keep only caption
    let caption = fullText.split(' ').slice(1).join(' ').trim();
    if (channelLink) caption = caption.replace(channelLink, '').trim();

    const ctx = message.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const qText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
    const qImage = quoted?.imageMessage;
    const qVideo = quoted?.videoMessage;
    const finalCaption = caption || qText || '';

    if (!channelLink) {
      return sock.sendMessage(chatId, { text: `*CHANNEL STATUS - How to use 👑*\n\nYou MUST put channel link at end:\n\n1. Reply to video/photo:\nReply + .channel My caption https://whatsapp.com/channel/0029Vb9AwScF6sn47ClubG1Z\n\n2. Text only:\n.channel Hello KING 🔥 https://whatsapp.com/channel/0029Vb9AwScF6sn47ClubG1Z\n\n3. Channel 2:\n.channel Hello https://whatsapp.com/channel/0029VbCwmFXDzgT4FzZm6d28\n\nWithout link, bot doesn't know WHICH channel to post to.` }, { quoted: message });
    }

    if (!quoted && !finalCaption) {
      return sock.sendMessage(chatId, { text: '❌ Reply to video/photo/text OR give caption.\nExample: Reply + .channel My update + link' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: `⏳ Finding channel from link...\nLink: ${channelLink}\nCode: ${inviteCode}` }, { quoted: message });

    // ✅ 2. CONVERT LINK -> CHANNEL JID (Real Baileys way)
    let channelJid = null;
    // Known JIDs - fast path
    if (inviteCode === '0029Vb9AwScF6sn47ClubG1Z') channelJid = '120207367533840780@newsletter';
    // For other channels, resolve via Baileys
    if (!channelJid && typeof sock.newsletterFetchMetadata === 'function') {
      try {
        const meta = await sock.newsletterFetchMetadata('invite', inviteCode);
        if (meta?.id) channelJid = meta.id;
        console.log('[channel] Resolved JID:', channelJid, 'Name:', meta?.name);
      } catch (e) {
        console.log('[channel] Resolve failed:', e.message);
      }
    }
    if (!channelJid) {
      return sock.sendMessage(chatId, { text: `❌ Could not find channel from link.\nLink: ${channelLink}\n\nMake sure bot has followed that channel first, or bot is admin.` }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: `⏳ Posting to Channel Status...\nJID: ${channelJid}\nCaption: ${finalCaption.slice(0,50)}` }, { quoted: message });

    // ✅ 3. POST TO CHANNEL STATUS - Like posting to WhatsApp Group
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    let result = null;
    let methodUsed = "";

    if (typeof sock.newsletterSendMessage === 'function') {
      methodUsed = "newsletterSendMessage";
      if (qImage) {
        const stream = await downloadContentFromMessage(qImage, 'image');
        let buf = Buffer.from([]); for await (const c of stream) buf = Buffer.concat([buf, c]);
        result = await sock.newsletterSendMessage(channelJid, { image: buf, caption: finalCaption });
      } else if (qVideo) {
        const stream = await downloadContentFromMessage(qVideo, 'video');
        let buf = Buffer.from([]); for await (const c of stream) buf = Buffer.concat([buf, c]);
        result = await sock.newsletterSendMessage(channelJid, { video: buf, caption: finalCaption, mimetype: 'video/mp4' });
      } else {
        result = await sock.newsletterSendMessage(channelJid, { text: finalCaption });
      }
    } else {
      methodUsed = "sendMessage to channel JID";
      if (qImage) {
        const stream = await downloadContentFromMessage(qImage, 'image');
        let buf = Buffer.from([]); for await (const c of stream) buf = Buffer.concat([buf, c]);
        result = await sock.sendMessage(channelJid, { image: buf, caption: finalCaption });
      } else if (qVideo) {
        const stream = await downloadContentFromMessage(qVideo, 'video');
        let buf = Buffer.from([]); for await (const c of stream) buf = Buffer.concat([buf, c]);
        result = await sock.sendMessage(channelJid, { video: buf, caption: finalCaption, mimetype: 'video/mp4' });
      } else {
        result = await sock.sendMessage(channelJid, { text: finalCaption });
      }
    }

    if (result && (result.key?.id || result.message)) {
      await sock.sendMessage(chatId, { text: `✅ Posted to CHANNEL STATUS!\nMethod: ${methodUsed}\nMsg ID: ${result.key?.id}\nChannel: ${channelLink}\n\nGo to Updates → Channels → KING MD V4 → You will see it like Jawad TechX 👑` }, { quoted: message });
    } else {
      await sock.sendMessage(chatId, { text: `⚠️ WhatsApp did not return ID. Check channel manually.\nMethod: ${methodUsed}` }, { quoted: message });
    }

  } catch (err) {
    console.error('[channel-status]', err);
    await sock.sendMessage(chatId, { text: `❌ REAL FAILED.\nError: ${err.message}\n\nMake sure:\n1. Bot is ADMIN of that channel\n2. Bot follows that channel\n3. Link is correct` }, { quoted: message });
  }
}

module.exports = { channelCommand };
