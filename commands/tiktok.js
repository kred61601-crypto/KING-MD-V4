const axios = require('axios');
const settings = require('../settings');
const APIs = require('../lib/api');
const { fetchWhatsAppVideo } = require('../lib/waVideo');

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

function formatViews(n) {
  return Number(n || 0).toLocaleString('en-US');
}

// ===== CAPTION WITH ARTIST + VIEWS + DURATION =====
function captionFor(dl) {
  const title = dl.title || 'TikTok Video';
  const artist = dl.author || "Unknown Artist";
  const username = dl.username ? `@${dl.username}` : "";
  const views = formatViews(dl.views);
  const likes = formatViews(dl.likes);
  const duration = dl.duration ? `${dl.duration}s` : "—";
  return `🎬 *${title}*\n🎤 *Artist:* ${artist} ${username}\n👀 *Views:* ${views}\n❤️ *Likes:* ${likes}\n⏱️ *Duration:* ${duration}\n\n> Powered by KING MD V4`;
}

// ✅ TikWM - 3 hosts - NOW WITH ARTIST + VIEWS + DURATION
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
      const info = {
        title: data.title || 'TikTok Video',
        author: data.author?.nickname || data.author?.unique_id || "Unknown Artist",
        username: data.author?.unique_id || "",
        views: data.play_count || 0,
        likes: data.digg_count || 0,
        comments: data.comment_count || 0,
        shares: data.share_count || 0,
        duration: data.duration || 0,
        images: data.images || null,
        audio: data.music || null
      };
      if (data.play) return { ...info, download: data.play, download_hd: data.hdplay || null };
      if (data.images?.length) return { ...info, download: null };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('TikWM failed');
}

// ✅ TiklyDown
async function tiklyDownload(url) {
  const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d = res.data;
  const info = {
    title: d.title || 'TikTok Video',
    author: d.author?.nickname || d.author?.name || "Unknown Artist",
    username: d.author?.unique_id || "",
    views: d.play_count || d.views || 0,
    likes: d.digg_count || 0,
    duration: d.duration || 0
  };
  if (d?.video?.noWatermark) return { ...info, download: d.video.noWatermark };
  if (d?.video?.play) return { ...info, download: d.video.play };
  if (d?.images?.length) return { ...info, images: d.images, audio: d.music?.play || null, download: null };
  throw new Error('TiklyDown: no video');
}

// ✅ Cobalt - NEW, bypasses 403, very strong
async function cobaltDownload(url) {
  const res = await axios.post('https://api.cobalt.tools/api/json', { url }, {
    timeout: 20000,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  });
  if (res.data?.url) return { title: 'TikTok Video', author: "Unknown Artist", username: "", views: 0, likes: 0, duration: 0, download: res.data.url };
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
    { name: 'Knight', fn: async (u) => {
      const r = await APIs.knightTikTokDownload(u);
      return { title: r.title || 'TikTok Video', author: "Unknown Artist", username: "", views: 0, likes: 0, duration: 0, download: r.download || r.dl_url || r.dl, images: r.images || null, audio: r.audio || null };
    }},
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
    const messageId = message.key?.id || `${chatId}:${Date.now()}`;
    if (processedMessages.has(messageId)) return;
    processedMessages.add(messageId);
    setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const url = extractUrl(text);
    if (!url) {
      await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
      return sock.sendMessage(chatId, { text: 'Please provide a TikTok link.\nExample: `.tiktok https://vm.tiktok.com/...`' }, { quoted: message });
    }
    if (!TT_PATTERNS.some((p) => p.test(url))) {
      await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
      return sock.sendMessage(chatId, { text: 'That is not a valid TikTok link.' }, { quoted: message });
    }

    // ===== START REACT - RANDOM =====
    const startReacts = ["🎵", "🎬", "🔥", "😍", "❤️", "⚡", "👑", "💎", "✨", "🎧"];
    const randomStart = startReacts[Math.floor(Math.random() * startReacts.length)];
    await sock.sendMessage(chatId, { react: { text: randomStart, key: message.key } });
    await sock.sendMessage(chatId, { text: '⏳ Downloading TikTok...' }, { quoted: message });

    const dl = await resolveTikTok(url);

    if (dl.images?.length && !dl.download) {
      for (let i = 0; i < Math.min(dl.images.length, 10); i++) {
        await sock.sendMessage(chatId, {
          image: { url: dl.images[i] },
          caption: i === 0 ? captionFor(dl) : ''
        }, { quoted: message });
      }
      if (dl.audio) {
        await sock.sendMessage(chatId, { audio: { url: dl.audio }, mimetype: 'audio/mpeg' }, { quoted: message });
      }
    } else if (dl.download) {
      let videoBuffer;
      try {
        videoBuffer = await fetchWhatsAppVideo(dl.download);
      } catch (convertError) {
        console.log('[tiktok] MP4 conversion unavailable; trying direct media download:', convertError.message);
        const media = await axios.get(dl.download, {
          responseType: 'arraybuffer', timeout: 120000, maxRedirects: 5,
          maxContentLength: 100 * 1024 * 1024, maxBodyLength: 100 * 1024 * 1024,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'video/mp4,video/*,*/*'
          }
        });
        videoBuffer = Buffer.from(media.data);
        const isMp4 = videoBuffer.length > 1000 && videoBuffer.slice(4, 8).toString('ascii') === 'ftyp';
        const isVideo = String(media.headers?.['content-type'] || '').toLowerCase().includes('video/');
        if (!isMp4 && !isVideo) throw new Error('The TikTok provider did not return a valid video file.');
      }
      await sock.sendMessage(chatId, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption: captionFor(dl)
      }, { quoted: message });
    } else {
      throw new Error('The TikTok provider returned no usable media.');
    }

    // ✅ SUCCESS REACT
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
  } catch (err) {
    console.error('[tiktok]', err?.message || err);
    // ❌ ERROR REACT
    try { await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }); } catch {}
    await sock.sendMessage(chatId, { text: `❌ Failed to download TikTok video.\n\nReason: ${err?.message?.slice(0,300) || err}` }, { quoted: message });
  }
}

module.exports = tiktokCommand;