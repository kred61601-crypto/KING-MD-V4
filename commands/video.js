const yts = require('yt-search');
const settings = require('../settings');
const APIs = require('../lib/api');
const { fetchWhatsAppVideo } = require('../lib/waVideo');

function isYouTubeUrl(text) {
  return /youtube\.com|youtu\.be/i.test(text);
}

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : String(text || '').trim();
}

function formatInfo(video) {
  const views = Number(video.views || 0).toLocaleString('en-US');
  const artist = video.author ? video.author.name : "Unknown Artist";
  return `🎬 *${video.title}*\n🎤 Artist: ${artist}\n⏱ Duration: ${video.timestamp || '—'}\n👀 Views: ${views}`;
}

async function resolveVideo(videoUrl) {
  const steps = [
    ['Knight', () => APIs.knightVideoDownload(videoUrl)],
    ['Prince', () => APIs.princeVideoDownload(videoUrl)],
    ['Hector', () => APIs.hectorVideoDownload(videoUrl)],
    ['EliteProTech', () => APIs.getEliteProTechVideoByUrl(videoUrl)],
    ['Yupra', () => APIs.getYupraVideoByUrl(videoUrl)],
    ['Okatsu', () => APIs.getOkatsuVideoByUrl(videoUrl)],
  ];

  let lastError;
  for (const [name, run] of steps) {
    try {
      const result = await run();
      const download = result.download || result.dl_url || result.dl;
      if (!download || !/^https?:\/\//i.test(download)) throw new Error('No download URL');
      console.log(`[video] OK via ${name}`);
      return { title: result.title || 'Video', download, sourceUrl: result.sourceUrl || videoUrl };
    } catch (err) {
      lastError = err;
      console.log(`[video] ${name} failed:`, err?.message || err);
    }
  }
  throw lastError || new Error('All download sources failed');
}

async function videoCommand(sock, chatId, message) {
  try {
    const text =
      message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const query = text.replace(/^\.(?:video|ytmp4|ytv|ytvid)\s*/i, '').trim();

    if (!query) {
      await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
      return sock.sendMessage(
        chatId,
        { text: 'Usage: `.video <name or YouTube URL>`' },
        { quoted: message }
      );
    }

    // ===== START REACT - RANDOM =====
    const startReacts = ["🎬", "🎥", "🔥", "😍", "❤️", "⚡", "👑", "💎", "✨", "🎧"];
    const randomStart = startReacts[Math.floor(Math.random() * startReacts.length)];
    await sock.sendMessage(chatId, {
      react: { text: randomStart, key: message.key }
    });

    let preview;
    let videoUrl;

    if (isYouTubeUrl(query)) {
      videoUrl = extractUrl(query);
      const ytId = (videoUrl.match(/(?:youtu\.be\/|v=|shorts\/)([a-zA-Z0-9_-]{11})/) || [])[1];

      // ===== FETCH REAL ARTIST FOR URL TOO =====
      let ytInfo = null;
      try {
        const searchUrl = await yts({ videoId: ytId });
        ytInfo = searchUrl;
      } catch {}
      try {
        if (!ytInfo || !ytInfo.title) {
          const s = await yts(videoUrl);
          ytInfo = s?.videos?.[0];
        }
      } catch {}

      preview = {
        title: ytInfo?.title || 'YouTube Video',
        thumbnail: ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : null,
        author: { name: ytInfo?.author?.name || "Unknown Artist" },
        views: ytInfo?.views || 0,
        timestamp: ytInfo?.timestamp || "—"
      };
    } else {
      const search = await yts(query);
      preview = search?.videos?.[0];
      if (!preview) {
        await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
        return sock.sendMessage(chatId, { text: '❌ No results found.' }, { quoted: message });
      }
      videoUrl = preview.url;
    }

    const artistName = preview.author ? preview.author.name : "Unknown Artist";
    const views = Number(preview.views || 0).toLocaleString('en-US');
    const duration = preview.timestamp || "—";

    if (preview.thumbnail) {
      try {
        await sock.sendMessage(
          chatId,
          {
            image: { url: preview.thumbnail },
            caption: `${formatInfo(preview)}\n\nDownloading...`,
          },
          { quoted: message }
        );
      } catch {
        await sock.sendMessage(
          chatId,
          { text: `${formatInfo(preview)}\n\nDownloading...` },
          { quoted: message }
        );
      }
    }

    const dl = await resolveVideo(videoUrl);
    let video;
    try {
      video = await fetchWhatsAppVideo(dl.download);
    } catch (convertError) {
      console.log('[video] MP4 conversion unavailable; trying direct media download:', convertError.message);
      const axios = require('axios');
      const media = await axios.get(dl.download, {
        responseType: 'arraybuffer', timeout: 180000, maxRedirects: 5,
        maxContentLength: 100 * 1024 * 1024, maxBodyLength: 100 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'video/mp4,video/*,*/*'
        }
      });
      video = Buffer.from(media.data);
      const isMp4 = video.length > 1000 && video.slice(4, 8).toString('ascii') === 'ftyp';
      const isVideo = String(media.headers?.['content-type'] || '').toLowerCase().includes('video/');
      if (!isMp4 && !isVideo) throw new Error('The provider did not return a valid video file.');
    }
    const title = dl.title || preview.title || 'Video';
    const fileName = `${title.replace(/[^\w\s-]/g, '').trim() || 'video'}.mp4`;

    await sock.sendMessage(
      chatId,
      {
        video,
        mimetype: 'video/mp4',
        fileName,
        caption: `🎬 *${title}*\n🎤 *Artist:* ${artistName}\n👀 *Views:* ${views}\n⏱️ *Duration:* ${duration}\n\n> Powered by KING MD V4`,
      },
      { quoted: message }
    );

    // ✅ SUCCESS REACT - After download finish
    await sock.sendMessage(chatId, {
      react: { text: "✅", key: message.key }
    });

  } catch (err) {
    console.error('[video]', err?.message || err);
    // ❌ ERROR REACT
    try {
      await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
    } catch {}
    await sock.sendMessage(
      chatId,
      { text: `❌ Download failed: ${err?.message || 'Unknown error'}` },
      { quoted: message }
    );
  }
}

module.exports = videoCommand;