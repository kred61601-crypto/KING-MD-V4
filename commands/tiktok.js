const { ttdl } = require('ruhend-scraper');
const axios = require('axios');
const settings = require('../settings');
const APIs = require('../lib/api');
const { fetchWhatsAppVideo, slideshowToWhatsAppVideo } = require('../lib/waVideo');

const processedMessages = new Set();

const TT_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?tiktok\.com\//i,
  /https?:\/\/(?:vm|vt)\.tiktok\.com\//i,
];

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[)\]>.,]+$/g, '') : '';
}

// ✅ FIX 1: Expand vm.tiktok.com / vt.tiktok.com short links to real link
async function expandTikTokUrl(url) {
  try {
    if (/https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) {
      const res = await axios.get(url, {
        maxRedirects: 5,
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36' },
        validateStatus: () => true
      });
      // axios follows redirect, res.request.res.responseUrl has final URL
      const finalUrl = res?.request?.res?.responseUrl || res?.request?.responseUrl || url;
      if (finalUrl && finalUrl.includes('tiktok.com')) {
        console.log(`[tiktok] Expanded ${url} -> ${finalUrl}`);
        return finalUrl.split('?')[0];
      }
    }
  } catch (e) { console.log('[tiktok] Expand failed, using original:', e.message); }
  return url;
}

function tikTokUrlVariants(url) {
  const variants = [url];
  const m = String(url).match(/^(https?:\/\/(?:vt|vm)\.tiktok\.com\/)([A-Za-z0-9]+)(\/?.*)?$/i);
  if (!m) return variants;
  const upper = `${m[1]}${m[2].toUpperCase()}${m[3] || '/'}`;
  const lower = `${m[1]}${m[2].toLowerCase()}${m[3] || '/'}`;
  for (const v of [upper, lower]) {
    if (!variants.includes(v)) variants.push(v);
  }
  return variants;
}

function captionFor(title) {
  const bot = (settings.botName || 'KING MD V4').toUpperCase();
  return title ? `*DOWNLOADED BY ${bot}*\n\n📝 ${title}` : `*DOWNLOADED BY ${bot}*`;
}

const TT_HEADERS = {
  Referer: 'https://www.tiktok.com/',
  Origin: 'https://www.tiktok.com',
  'Accept-Encoding': 'identity',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
};

/** ✅ FIX 2: TikWM API - WORKING in 2026, free, no key */
async function tikwmDownload(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await axios.get(apiUrl, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = res.data?.data;
  if (!data) throw new Error('TikWM: no data');
  // Video
  if (data.play) {
    return {
      title: data.title || 'TikTok Video',
      thumbnail: data.cover || data.origin_cover || null,
      download: data.play, // no watermark
      download_hd: data.hdplay || null,
      images: data.images || null,
      audio: data.music || null,
    };
  }
  // Photo mode
  if (data.images?.length) {
    return {
      title: data.title || 'TikTok Photo',
      thumbnail: data.cover || null,
      images: data.images,
      audio: data.music || null,
      download: null
    };
  }
  throw new Error('TikWM: no video found');
}

/** ruhend ttdl */
async function scraperTikTokDownload(url) {
  const data = await ttdl(url);
  const direct = data?.video_hd || data?.video || data?.video_wm || data?.hdplay || data?.play || null;
  if (direct && /^https?:\/\//i.test(direct)) {
    return { title: data.title || 'TikTok Video', thumbnail: data.cover || null, download: direct };
  }
  if (data?.data?.length) {
    const video = data.data.find((m) => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url || '')) || data.data[0];
    if (video?.url) return { title: data.title || 'TikTok Video', download: video.url };
  }
  throw new Error('No video URL found');
}

async function resolveTikTok(url) {
  const errors = [];
  const expanded = await expandTikTokUrl(url);
  const candidates = [...new Set([...tikTokUrlVariants(expanded), expanded, url])];

  // 1️⃣ TikWM FIRST - most reliable now
  for (const candidate of candidates) {
    try {
      const dl = await tikwmDownload(candidate);
      if (dl?.download || dl?.images?.length) {
        console.log(`[tiktok] TikWM OK (${candidate})`);
        return dl;
      }
    } catch (err) {
      errors.push(`TikWM: ${err?.message || err}`);
      console.log(`[tiktok] TikWM failed:`, err?.message || err);
    }
  }

  // 2️⃣ Knight (old)
  for (const candidate of candidates) {
    try {
      const dl = await APIs.knightTikTokDownload(candidate);
      if (dl?.download && /^https?:\/\//i.test(dl.download)) {
        console.log(`[tiktok] Knight OK video (${candidate})`);
        return dl;
      }
      if (dl?.images?.length) {
        console.log(`[tiktok] Knight OK slideshow (${candidate}) images=${dl.images.length}`);
        return dl;
      }
    } catch (err) {
      errors.push(`Knight: ${err?.message || err}`);
      console.log(`[tiktok] Knight failed:`, err?.message || err);
    }
  }

  // 3️⃣ ruhend-scraper last
  for (const candidate of candidates) {
    try {
      const dl = await scraperTikTokDownload(candidate);
      if (dl?.download) {
        console.log(`[tiktok] ttdl OK (${candidate})`);
        return dl;
      }
    } catch (err) {
      errors.push(`ttdl: ${err?.message || err}`);
      console.log(`[tiktok] ttdl failed:`, err?.message || err);
    }
  }

  throw new Error(errors.join(' | ') || 'All TikTok sources failed');
}

async function tiktokCommand(sock, chatId, message) {
  try {
    if (processedMessages.has(message.key.id)) return;
    processedMessages.add(message.key.id);
    setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const url = extractUrl(text);

    if (!url) {
      return sock.sendMessage(chatId, { text: 'Please provide a TikTok link.\nExample: `.tiktok https://vm.tiktok.com/...`' }, { quoted: message });
    }
    if (!TT_PATTERNS.some((p) => p.test(url))) {
      return sock.sendMessage(chatId, { text: 'That is not a valid TikTok link.' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });
    await sock.sendMessage(chatId, { text: '⏳ Downloading TikTok...' }, { quoted: message });

    const dl = await resolveTikTok(url);
    let video;

    if (dl.images?.length && !dl.download) {
      video = await slideshowToWhatsAppVideo(dl.images, dl.audio || null, TT_HEADERS);
    } else if (dl.download) {
      // Prefer HD if available
      const bestUrl = dl.download_hd || dl.download;
      try {
        video = await fetchWhatsAppVideo(bestUrl, TT_HEADERS);
      } catch (e) {
        console.log('[tiktok] HD failed, trying normal:', e.message);
        video = await fetchWhatsAppVideo(dl.download, TT_HEADERS);
      }
    } else {
      throw new Error('Invalid download response');
    }

    await sock.sendMessage(chatId, { video, mimetype: 'video/mp4', caption: captionFor(dl.title) }, { quoted: message });
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
  } catch (err) {
    console.error('[tiktok]', err?.message || err);
    await sock.sendMessage(chatId, { text: `❌ Failed to download TikTok video.\n\nReason: ${err?.message?.slice(0,200) || err}\n\nTry again with a different link, or use full link not vm.tiktok.com short link.` }, { quoted: message });
  }
}

module.exports = tiktokCommand;
