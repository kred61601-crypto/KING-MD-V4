const axios = require('axios');
const settings = require('../settings');
const APIs = require('../lib/api');

const processedMessages = new Set();

const TT_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?tiktok\.com\//i,
  /https?:\/\/(?:vm|vt)\.tiktok\.com\//i,
];

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[)\]>.,]+$/g, '') : '';
}

async function expandTikTokUrl(url) {
  try {
    if (/https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) {
      const res = await axios.get(url, {
        maxRedirects: 5, timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15' },
        validateStatus: () => true
      });
      const finalUrl = res?.request?.res?.responseUrl || res?.request?.responseUrl || url;
      if (finalUrl && finalUrl.includes('tiktok.com')) return finalUrl.split('?')[0];
    }
  } catch (e) {}
  return url;
}

function captionFor(title) {
  const bot = (settings.botName || 'KING MD V4').toUpperCase();
  return title ? `*DOWNLOADED BY ${bot}*\n\n📝 ${title}` : `*DOWNLOADED BY ${bot}*`;
}

// ✅ TikWM - 3 hosts
async function tikwmDownload(url) {
  const hosts = [
    `https://api.tikwm.com/api/?url=${encodeURIComponent(url)}`,
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
    `https://tikwm.com/api/?url=${encodeURIComponent(url)}`
  ];
  let lastErr = null;
  for (const apiUrl of hosts) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = res.data?.data;
      if (!data) continue;
      if (data.play) return { title: data.title || 'TikTok Video', download: data.play, download_hd: data.hdplay || null, images: data.images || null, audio: data.music || null };
      if (data.images?.length) return { title: data.title || 'TikTok Photo', images: data.images, audio: data.music || null, download: null };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('TikWM failed');
}

// ✅ TiklyDown
async function tiklyDownload(url) {
  const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d = res.data;
  if (d?.video?.noWatermark) return { title: d.title || 'TikTok Video', download: d.video.noWatermark };
  if (d?.video?.play) return { title: d.title || 'TikTok Video', download: d.video.play };
  if (d?.images?.length) return { title: d.title || 'TikTok Photo', images: d.images, audio: d.music?.play || null, download: null };
  throw new Error('TiklyDown: no video');
}

// ✅ Cobalt - NEW, bypasses 403, very strong
async function cobaltDownload(url) {
  const res = await axios.post('https://api.cobalt.tools/api/json', { url }, {
    timeout: 20000,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  });
  if (res.data?.url) return { title: 'TikTok Video', download: res.data.url };
  throw new Error('Cobalt: no url');
}

async function resolveTikTok(url) {
  const errors = [];
  const expanded = await expandTikTokUrl(url);
  const candidates = [...new Set([expanded, url])];
  const sources = [
    { name: 'TikWM', fn: tikwmDownload },
    { name: 'TiklyDown', fn: tiklyDownload },
    { name: 'Cobalt', fn: cobaltDownload },
    { name: 'Knight', fn: (u) => APIs.knightTikTokDownload(u) },
  ];
  for (const src of sources) {
    for (const candidate of candidates) {
      try {
        const dl = await src.fn(candidate);
        if (dl?.download || dl?.images?.length) {
          console.log(`[tiktok] ${src.name} OK`);
          return dl;
        }
      } catch (err) {
        errors.push(`${src.name}: ${err?.message || err}`);
        console.log(`[tiktok] ${src.name} failed:`, err?.message || err);
      }
    }
  }
  throw new Error(errors.join(' | '));
}

async function tiktokCommand(sock, chatId, message) {
  try {
    if (processedMessages.has(message.key.id)) return;
    processedMessages.add(message.key.id);
    setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const url = extractUrl(text);
    if (!url) return sock.sendMessage(chatId, { text: 'Please provide a TikTok link.\nExample: `.tiktok https://vm.tiktok.com/...`' }, { quoted: message });
    if (!TT_PATTERNS.some((p) => p.test(url))) return sock.sendMessage(chatId, { text: 'That is not a valid TikTok link.' }, { quoted: message });

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });
    await sock.sendMessage(chatId, { text: '⏳ Downloading TikTok...' }, { quoted: message });

    const dl = await resolveTikTok(url);

    // ✅ FIX 403: DO NOT download video to Render. Send URL directly - WhatsApp fetches it.
    if (dl.images?.length && !dl.download) {
      // Photo mode - send first image + audio link as text, WhatsApp can't slideshow easily
      // Send images one by one via URL
      for (let i = 0; i < Math.min(dl.images.length, 5); i++) {
        await sock.sendMessage(chatId, { image: { url: dl.images[i] }, caption: i === 0 ? captionFor(dl.title) : '' }, { quoted: message });
      }
      if (dl.audio) await sock.sendMessage(chatId, { audio: { url: dl.audio }, mimetype: 'audio/mp4' }, { quoted: message });
    } else if (dl.download) {
      // Try HD first, then normal - BOTH as URL, no download on server
      try {
        await sock.sendMessage(chatId, { video: { url: dl.download_hd || dl.download }, mimetype: 'video/mp4', caption: captionFor(dl.title) }, { quoted: message });
      } catch (e) {
        console.log('[tiktok] URL send failed, trying other URL:', e.message);
        await sock.sendMessage(chatId, { video: { url: dl.download }, mimetype: 'video/mp4', caption: captionFor(dl.title) }, { quoted: message });
      }
    } else throw new Error('Invalid download response');

    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
  } catch (err) {
    console.error('[tiktok]', err?.message || err);
    await sock.sendMessage(chatId, { text: `❌ Failed to download TikTok video.\n\nReason: ${err?.message?.slice(0,300) || err}` }, { quoted: message });
  }
}

module.exports = tiktokCommand;
