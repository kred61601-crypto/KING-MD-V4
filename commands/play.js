const yts = require('yt-search');
const axios = require('axios');

async function playCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        if (!searchQuery) {
            // ❌ ERROR REACT - No song name
            await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
            return await sock.sendMessage(chatId, { 
                text: "What song do you want to download?"
            });
        }

        // ===== START REACT - RANDOM =====
        const startReacts = ["🎵", "🎶", "🔥", "😍", "❤️", "⚡", "👑", "💎", "✨", "🎧"];
        const randomStart = startReacts[Math.floor(Math.random() * startReacts.length)];
        await sock.sendMessage(chatId, {
            react: { text: randomStart, key: message.key }
        });

        // Search for the song
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            // ❌ ERROR REACT - No songs found
            await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
            return await sock.sendMessage(chatId, { 
                text: "No songs found!"
            });
        }

        const video = videos[0];
        const urlYt = video.url;
        const artistName = video.author ? video.author.name : "Unknown Artist";
        const views = video.views ? video.views.toLocaleString() : "0";
        const duration = video.timestamp || "0:00";
        const title = video.title || "Unknown Title";

        await sock.sendMessage(chatId, {
            text: `🎵 *Downloading...*\n\n` +
                  `🎶 *Title:* ${title}\n` +
                  `🎤 *Artist:* ${artistName}\n` +
                  `👀 *Views:* ${views}\n` +
                  `⏱️ *Duration:* ${duration}\n\n` +
                  `_Please wait your download is in progress_`
        });

        // Fetch audio data from API
        const response = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${urlYt}`);
        const data = response.data;

        if (!data || !data.status || !data.result || !data.result.downloadUrl) {
            // ❌ ERROR REACT - API Failed
            await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
            return await sock.sendMessage(chatId, { 
                text: "Failed to fetch audio from the API. Please try again later."
            });
        }

        const audioUrl = data.result.downloadUrl;
        const audioTitle = data.result.title || title;

        // Send the audio
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${audioTitle}.mp3`,
            caption: `🎵 *${audioTitle}*\n🎤 *Artist:* ${artistName}\n👀 *Views:* ${views}\n⏱️ *Duration:* ${duration}\n\n> Powered by KING MD V4`
        }, { quoted: message });

        // ✅ SUCCESS REACT - After download finish
        await sock.sendMessage(chatId, {
            react: { text: "✅", key: message.key }
        });

    } catch (error) {
        console.error('Error in song2 command:', error);
        // ❌ ERROR REACT - Catch error
        try {
            await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
        } catch {}
        await sock.sendMessage(chatId, { 
            text: "Download failed. Please try again later."
        });
    }
}

module.exports = playCommand;