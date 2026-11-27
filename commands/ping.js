const os = require('os');
const fs = require('fs');
const path = require('path');
const settings = require('../settings.js');

function formatTime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds = seconds % (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds = seconds % (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    let time = '';
    if (days > 0) time += `${days}d `;
    if (hours > 0) time += `${hours}h `;
    if (minutes > 0) time += `${minutes}m `;
    if (seconds > 0 || time === '') time += `${seconds}s`;
    return time.trim();
}

async function pingCommand(sock, chatId, message) {
    try {
        // ===== MANY RANDOM REACTS =====
        const reacts = ["⚡", "🤖", "👑", "💻", "🔥", "🚀", "💎", "🍎", "📱", "✨", "😎", "🖤", "💯", "🏎️"];
        const randomReact = reacts[Math.floor(Math.random() * reacts.length)];
        await sock.sendMessage(chatId, {
            react: { text: randomReact, key: message.key }
        });

        const start = Date.now();
        await sock.sendMessage(chatId, { text: 'Pong!' }, { quoted: message });
        const end = Date.now();
        const ping = Math.round((end - start) / 2);
        const uptimeFormatted = formatTime(process.uptime());

        // ===== GET USER PHONE STYLE (same as menu, no name written) =====
        const sender = message.key.participant || message.key.remoteJid;
        const userId = sender.split('@')[0];
        let phone = 'iphone';
        let battery = 87;
        try {
            const deviceFile = path.join(__dirname, '../data/userDevices.json');
            if (fs.existsSync(deviceFile)) {
                const data = JSON.parse(fs.readFileSync(deviceFile));
                if (data[userId]) {
                    phone = data[userId].phone || 'iphone';
                    battery = data[userId].battery || 87;
                }
            }
        } catch {}

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const filled = Math.round(battery / 10);
        const batteryBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

        let botInfo = '';

        // ===== STYLE 1: SAMSUNG STYLE - ROUNDED, BOLD, NO NAME =====
        if (phone === 'samsung') {
            botInfo = `
*✨ KING MD V4*

*┌──────────────────────┐*
*│  ⚡ Ping     : ${ping} ms*
*│  ⏱️ Uptime   : ${uptimeFormatted}*
*│  🔋 Battery  : [${batteryBar}] ${battery}%*
*│  🕒 Time     : ${timeStr}*
*│  📅 Date     : ${dateStr}*
*│  🔖 Version  : v${settings.version}*
*│  💻 Platform : ${os.platform()}*
*└──────────────────────┘*

*🚀 System Online • Galaxy AI*`.trim();
        }
        // ===== STYLE 2: IPHONE STYLE - CLEAN, MINIMAL, NO NAME =====
        else {
            botInfo = `
*KING MD V4*

*${timeStr}  •  ${dateStr}*
*[${batteryBar}] ${battery}%  •  5G*

*──────────────────────*
*  Ping     ${ping} ms*
*  Uptime   ${uptimeFormatted}*
*  Version  v${settings.version}*
*  Platform ${os.platform()}*
*──────────────────────*

*🚀 System Online*`.trim();
        }

        await sock.sendMessage(chatId, { text: botInfo }, { quoted: message });

    } catch (error) {
        console.error('Error in ping command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to get bot status.' });
    }
}

module.exports = pingCommand;