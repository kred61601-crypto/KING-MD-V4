const fs = require('fs');

function readJsonSafe(path, fallback) {
    try {
        const txt = fs.readFileSync(path, 'utf8');
        return JSON.parse(txt);
    } catch (_) {
        return fallback;
    }
}

const isOwnerOrSudo = require('../lib/isOwner');

async function settingsCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { text: 'Only bot owner can use this command!' }, { quoted: message });
            return;
        }

        // ===== REACT EMOJI SETTINGS - RANDOM, NOT JUST ONE =====
        const reactEmojis = ["😍", "❤️", "🔥", "⚡", "👑", "💎", "✨", "🍎", "📱", "😎", "🖤", "💯"];
        const randomReact = reactEmojis[Math.floor(Math.random() * reactEmojis.length)];
        await sock.sendMessage(chatId, {
            react: { text: randomReact, key: message.key }
        });

        const isGroup = chatId.endsWith('@g.us');
        const dataDir = './data';

        const mode = readJsonSafe(`${dataDir}/messageCount.json`, { isPublic: true });
        const autoStatus = readJsonSafe(`${dataDir}/autoStatus.json`, { enabled: false });
        const autoread = readJsonSafe(`${dataDir}/autoread.json`, { enabled: false });
        const autotyping = readJsonSafe(`${dataDir}/autotyping.json`, { enabled: false });
        const pmblocker = readJsonSafe(`${dataDir}/pmblocker.json`, { enabled: false });
        const anticall = readJsonSafe(`${dataDir}/anticall.json`, { enabled: false });
        const userGroupData = readJsonSafe(`${dataDir}/userGroupData.json`, {
            antilink: {}, antibadword: {}, welcome: {}, goodbye: {}, chatbot: {}, antitag: {}
        });
        const autoReaction = Boolean(userGroupData.autoReaction);

        // Per-group features
        const groupId = isGroup ? chatId : null;
        const antilinkOn = groupId ? Boolean(userGroupData.antilink && userGroupData.antilink[groupId]) : false;
        const antibadwordOn = groupId ? Boolean(userGroupData.antibadword && userGroupData.antibadword[groupId]) : false;
        const welcomeOn = groupId ? Boolean(userGroupData.welcome && userGroupData.welcome[groupId]) : false;
        const goodbyeOn = groupId ? Boolean(userGroupData.goodbye && userGroupData.goodbye[groupId]) : false;
        const chatbotOn = groupId ? Boolean(userGroupData.chatbot && userGroupData.chatbot[groupId]) : false;
        const antitagCfg = groupId ? (userGroupData.antitag && userGroupData.antitag[groupId]) : null;

        const lines = [];
        lines.push(`📁 *GENERAL SETTINGS*`);
        lines.push(`├─ welcome ${welcomeOn ? 'on' : 'off'}`);
        lines.push(`├─ goodbye ${goodbyeOn ? 'on' : 'off'}`);
        lines.push(`├─ setwelcome <message>`);
        lines.push(`└─ setgoodbye <message>`);
        lines.push(``);
        lines.push(`📁 *AUTO FEATURES*`);
        lines.push(`├─ autoread ${autoread.enabled ? 'on' : 'off'}`);
        lines.push(`├─ autoreact ${autoReaction ? 'on' : 'off'}`);
        lines.push(`├─ autotyping ${autotyping.enabled ? 'on' : 'off'}`);
        lines.push(`├─ statusview ${autoStatus.enabled ? 'on' : 'off'}`);
        lines.push(`├─ recording ${autotyping.enabled ? 'on' : 'off'}`);
        lines.push(`└─ online on`);
        lines.push(``);
        lines.push(`📁 *REPLY SETTINGS*`);
        lines.push(`├─ mentionreply on/off ✨`);
        lines.push(`└─ statuslike on/off`);
        lines.push(``);
        lines.push(`📁 *ANTI FEATURES*`);
        lines.push(`├─ antistatus on/off/warn/delete`);
        lines.push(`├─ antilink ${antilinkOn ? `on/${userGroupData.antilink[groupId].action || 'delete'}` : 'off'}`);
        lines.push(`├─ antidelete on/off`);
        lines.push(`├─ anticall ${anticall.enabled ? 'on' : 'off'}`);
        lines.push(`└─ anticallmsg <message>`);
        lines.push(``);
        lines.push(`📁 *USER MANAGEMENT*`);
        lines.push(`├─ sudo @user`);
        lines.push(`├─ delsudo @user`);
        lines.push(`└─ listsudo`);
        lines.push(``);
        lines.push(`📁 *BOT CUSTOMIZATION*`);
        lines.push(`├─ mode ${mode.isPublic ? 'public' : 'private'}`);
        lines.push(`├─ prefix <new_prefix>`);
        lines.push(`├─ botname <name>`);
        lines.push(`├─ ownername <name>`);
        lines.push(`├─ ownernumber <number>`);
        lines.push(`├─ description <text>`);
        lines.push(`├─ botdp <url> or reply to image`);
        lines.push(`├─ stickername <name>`);
        lines.push(`├─ delpath same/inbox`);
        lines.push(`├─ statusemoji 😍,❤️,🔥`);
        lines.push(`├─ reactemojis 😍,❤️,🔥`);
        lines.push(`└─ owneremojis 👑,⭐,💎`);
        lines.push(``);
        lines.push(`▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`);
        lines.push(``);
        lines.push(`💡 *Usage:* .<command> <option>`);
        lines.push(`📌 *Example:* .mentionreply on`);
        lines.push(``);
        lines.push(`> Powered by KING MD V4`);

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
    } catch (error) {
        console.error('Error in settings command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to read settings.' }, { quoted: message });
    }
}

module.exports = settingsCommand;