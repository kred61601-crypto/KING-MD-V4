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

async function expandTikTokUrl(url) {
  try {
    if (/https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) {
      const res = await axios.get(url, {
        maxRedirects: 5, timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36' },
        validateStatus: () => true
      });
      const finalUrl = res?.request?.res?.responseUrl || res?.request?.responseUrl || url;
      if (finalUrl && finalUrl.includes('tiktok.com')) {
        console.log(`[tiktok] Expanded ${url} -> ${finalUrl}`);
        return finalUrl.split('?')[0];
      }
    }
  } catch (e) { console.log('[tiktok] Expand failed, using original'); }
  return url;
}

function captionFor(title) {
  const bot = (settings.botName || 'KING MD V4').toUpperCase();
  return title ? `*DOWNLOADED BY ${bot}*\n\n📝 ${title}` : `*DOWNLOADED BY ${bot}*`;
}

const TT_HEADERS = {
  Referer: 'https://www.tiktok.com/',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
};

// ✅ SOURCE 1: TikWM - try 3 different hosts (one will work even if other 502)
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
      if (!data) { lastErr = new Error('TikWM: no data'); continue; }
      if (data.play) return { title: data.title || 'TikTok Video', thumbnail: data.cover || null, download: data.play, download_hd: data.hdplay || null, images: data.images || null, audio: data.music || null };
      if (data.images?.length) return { title: data.title || 'TikTok Photo', thumbnail: data.cover || null, images: data.images, audio: data.music || null, download: null };
    } catch (e) { lastErr = e; console.log(`[tiktok] TikWM host failed ${apiUrl}:`, e.message); }
  }
  throw lastErr || new Error('TikWM all hosts failed');
}

// ✅ SOURCE 2: TiklyDown - NEW, working 2026
async function tiklyDownload(url) {
  const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d = res.data;
  if (d?.video?.noWatermark) return { title: d.title || d.author?.nickname || 'TikTok Video', thumbnail: d.cover || null, download: d.video.noWatermark, download_hd: d.video.watermark || null };
  if (d?.video?.play) return { title: d.title || 'TikTok Video', download: d.video.play };
  if (d?.images?.length) return { title: d.title || 'TikTok Photo', images: d.images, audio: d.music?.play || null, download: null };
  throw new Error('TiklyDown: no video');
}

// ✅ SOURCE 3: Direct TikTok HTML scrape - no API needed, always works if TikTok is up
async function directScrapeDownload(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.tiktok.com/'
    }
  });
  const html = res.data || '';
  // Try to find playAddr / video URL in HTML
  const patterns = [
    /"playAddr":"(https:[^"]+)"/,
    /"downloadAddr":"(https:[^"]+)"/,
    /"playUrl":"(https:[^"]+)"/,
    /playAddr\\":\\"(https:[^\\"]+)/
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      let videoUrl = m[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
      const titleMatch = html.match(/"desc":"([^"]+)"/);
      return { title: titleMatch?.[1] || 'TikTok Video', download: videoUrl };
    }
  }
  throw new Error('Direct scrape: no video URL in page');
}

// ✅ SOURCE 4: ruhend - FIXED crash (it returns undefined now)
async function scraperTikTokDownload(url) {
  try {
    const { ttdl } = require('ruhend-scraper');
    const data = await ttdl(url);
    if (!data) throw new Error('ttdl returned empty');
    const direct = data?.video_hd || data?.video || data?.video_wm || data?.hdplay || data?.play || data?.result?.video || null;
    if (direct && /^https?:\/\//i.test(direct)) return { title: data.title || data?.result?.title || 'TikTok Video', thumbnail: data.cover || null, download: direct };
    if (data?.data?.length) {
      const video = data.data.find((m) => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url || '')) || data.data[0];
      if (video?.url) return { title: data.title || 'TikTok Video', download: video.url };
    }
    throw new Error('No video URL found');
  } catch (e) {
    throw new Error(`ttdl: ${e.message}`);
  }
}

async function resolveTikTok(url) {
  const errors = [];
  const expanded = await expandTikTokUrl(url);
  const candidates = [...new Set([expanded, url])];

  const sources = [
    { name: 'TikWM', fn: tikwmDownload },
    { name: 'TiklyDown', fn: tiklyDownload },
    { name: 'DirectScrape', fn: directScrapeDownload },
    { name: 'Knight', fn: (u) => APIs.knightTikTokDownload(u) },
    { name: 'ttdl', fn: scraperTikTokDownload },
  ];

  for (const src of sources) {
    for (const candidate of candidates) {
      try {
        const dl = await src.fn(candidate);
        if (dl?.download || dl?.images?.length) {
          console.log(`[tiktok] ${src.name} OK (${candidate})`);
          return dl;
        }
      } catch (err) {
        errors.push(`${src.name}: ${err?.message || err}`);
        console.log(`[tiktok] ${src.name} failed:`, err?.message || err);
      }
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
    if (!url) return sock.sendMessage(chatId, { text: 'Please provide a TikTok link.\nExample: `.tiktok https://vm.tiktok.com/...`' }, { quoted: message });
    if (!TT_PATTERNS.some((p) => p.test(url))) return sock.sendMessage(chatId, { text: 'That is not a valid TikTok link.' }, { quoted: message });

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });
    await sock.sendMessage(chatId, { text: '⏳ Downloading TikTok...' }, { quoted: message });

    const dl = await resolveTikTok(url);
    let video;
    if (dl.images?.length && !dl.download) {
      video = await slideshowToWhatsAppVideo(dl.images, dl.audio || null, TT_HEADERS);
    } else if (dl.download) {
      try { video = await fetchWhatsAppVideo(dl.download_hd || dl.download, TT_HEADERS); }
      catch (e) { console.log('[tiktok] HD failed, trying normal'); video = await fetchWhatsAppVideo(dl.download, TT_HEADERS); }
    } else throw new Error('Invalid download response');

    await sock.sendMessage(chatId, { video, mimetype: 'video/mp4', caption: captionFor(dl.title) }, { quoted: message });
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
  } catch (err) {
    console.error('[tiktok]', err?.message || err);
    await sock.sendMessage(chatId, { text: `❌ Failed to download TikTok video.\n\nReason: ${err?.message?.slice(0,300) || err}\n\nTry again with a different link.` }, { quoted: message });
  }
}

module.exports = tiktokCommand;
