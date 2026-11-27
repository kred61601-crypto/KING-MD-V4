const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, message) {
    // ===== UNIQUE PART NOBODY HAS =====
    const sender = message.key.participant || message.key.remoteJid;
    const userName = message.pushName || "KING USER";
    const now = new Date();
    const hour = now.getHours();
    let greeting = "GOOD NIGHT 🌙";
    if (hour >= 5 && hour < 12) greeting = "GOOD MORNING 🌅";
    else if (hour >= 12 && hour < 17) greeting = "GOOD AFTERNOON ☀️";
    else if (hour >= 17 && hour < 21) greeting = "GOOD EVENING 🌇";

    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const totalCmds = 148; // total commands in your bot
    // ===================================

    const helpMessage = `
*👑━━━━━━━━━━━━━━━━━━━━👑*
*   K I N G  DM  O S*
*👑━━━━━━━━━━━━━━━━━━━━👑*

*┌─[ WELCOME BACK ]─┐*
*│* ${greeting}
*│* 👤 *User :* @${sender.split('@')[0]}
*│* 📅 *Date :* ${dateStr}
*│* 🕒 *Time :* ${timeStr}
*│* 🤖 *Bot :* ${settings.botName || 'KING MD V4'}
*│* ⚡ *Ver :* ${settings.version || '1.0.3'}
*│* 👑 *King :* ${settings.botOwner || '𝗞𝗜𝗡𝗚 𝗠𝗗 Hacker'}
*│* 📺 *YT :* ${global.ytch}
*│* 📦 *Total Cmds :* ${totalCmds}+
*└──────────────────┘*

*⚡ SYSTEM BOOTING...*
*▓▓▓▓▓▓▓▓▓▓ 100% LOADED*
*🔓 HACKER MODE : ACTIVATED*

*╭─👑─[ 01 - GENERAL ]─👑─╮*
*│* 𖣘 .help / .menu
*│* 𖣘 .ping
*│* 𖣘 .alive
*│* 𖣘 .tts <text>
*│* 𖣘 .owner
*│* 𖣘 .joke
*│* 𖣘 .quote
*│* 𖣘 .fact
*│* 𖣘 .weather <city>
*│* 𖣘 .news
*│* 𖣘 .attp <text>
*│* 𖣘 .lyrics <song_title>
*│* 𖣘 .8ball <question>
*│* 𖣘 .groupinfo
*│* 𖣘 .staff / .admins
*│* 𖣘 .vv
*│* 𖣘 .vv2
*│* 𖣘 .trt <text> <lang>
*│* 𖣘 .ss <link>
*│* 𖣘 .jid
*│* 𖣘 .url
*╰──────────────────╯*

*╭─💀─[ 02 - ADMIN ]─💀─╮*
*│* 𖣘 .ban @user
*│* 𖣘 .promote @user
*│* 𖣘 .demote @user
*│* 𖣘 .mute <minutes>
*│* 𖣘 .unmute
*│* 𖣘 .delete / .del
*│* 𖣘 .kick @user
*│* 𖣘 .warnings @user
*│* 𖣘 .warn @user
*│* 𖣘 .antilink
*│* 𖣘 .antibadword
*│* 𖣘 .clear
*│* 𖣘 .tag <message>
*│* 𖣘 .tagall
*│* 𖣘 .tagnotadmin
*│* 𖣘 .hidetag <message>
*│* 𖣘 .chatbot
*│* 𖣘 .resetlink
*│* 𖣘 .antitag <on/off>
*│* 𖣘 .welcome <on/off>
*│* 𖣘 .goodbye <on/off>
*│* 𖣘 .antibot <on/off/set/get>
*│* 𖣘 .setgdesc <description>
*│* 𖣘 .setgname <new name>
*│* 𖣘 .setgpp (reply to image)
*│* 𖣘 .groupstatus [caption/text]
*╰──────────────────╯*

*╭─🔐─[ 03 - OWNER ]─🔐─╮*
*│* 𖣘 .mode <public/private>
*│* 𖣘 .clearsession
*│* 𖣘 .antidelete
*│* 𖣘 .cleartmp
*│* 𖣘 .update
*│* 𖣘 .settings
*│* 𖣘 .setpp <reply to image>
*│* 𖣘 .autoreact <on/off>
*│* 𖣘 .autostatus <on/off>
*│* 𖣘 .autostatus react <on/off>
*│* 𖣘 .savestatus [on/off]
*│* 𖣘 .autotyping <on/off>
*│* 𖣘 .autoread <on/off>
*│* 𖣘 .anticall <on/off>
*│* 𖣘 .pmblocker <on/off/status>
*│* 𖣘 .pmblocker setmsg <text>
*│* 𖣘 .setmention <reply to msg>
*│* 𖣘 .mention <on/off>
*╰──────────────────╯*

*╭─🎨─[ 04 - STICKER ]─🎨─╮*
*│* 𖣘 .blur <image>
*│* 𖣘 .simage <reply to sticker>
*│* 𖣘 .sticker <reply to image>
*│* 𖣘 .removebg
*│* 𖣘 .remini
*│* 𖣘 .crop (reply sticker/image/video)
*│* 𖣘 .tgsticker <Link>
*│* 𖣘 .meme
*│* 𖣘 .take <packname>
*│* 𖣘 .emojimix <emj1>+<emj2>
*│* 𖣘 .igs <insta link>
*│* 𖣘 .igsc <insta link>
*╰──────────────────╯*

*╭─🖼️─[ 05 - PIES ]─🖼️─╮*
*│* 𖣘 .pies <country>
*│* 𖣘 .china
*│* 𖣘 .indonesia
*│* 𖣘 .japan
*│* 𖣘 .korea
*│* 𖣘 .hijab
*╰──────────────────╯*

*╭─🎮─[ 06 - GAME ]─🎮─╮*
*│* 𖣘 .tictactoe @user
*│* 𖣘 .hangman
*│* 𖣘 .guess <letter>
*│* 𖣘 .trivia
*│* 𖣘 .answer <answer>
*│* 𖣘 .truth
*│* 𖣘 .dare
*╰──────────────────╯*

*╭─🤖─[ 07 - AI ]─🤖─╮*
*│* 𖣘 .ai <question>
*│* 𖣘 .gpt <question>
*│* 𖣘 .gemini <question>
*│* 𖣘 .imagine <prompt>
*│* 𖣘 .flux <prompt>
*│* 𖣘 .sora <prompt>
*╰──────────────────╯*

*╭─🎯─[ 08 - FUN ]─🎯─╮*
*│* 𖣘 .compliment @user
*│* 𖣘 .insult @user
*│* 𖣘 .flirt
*│* 𖣘 .shayari
*│* 𖣘 .goodnight
*│* 𖣘 .roseday
*│* 𖣘 .character @user
*│* 𖣘 .wasted @user
*│* 𖣘 .ship @user
*│* 𖣘 .simp @user
*│* 𖣘 .stupid @user [text]
*╰──────────────────╯*

*╭─🔤─[ 09 - TEXTMAKER ]─🔤─╮*
*│* 𖣘 .metallic <text>
*│* 𖣘 .ice <text>
*│* 𖣘 .snow <text>
*│* 𖣘 .impressive <text>
*│* 𖣘 .matrix <text>
*│* 𖣘 .light <text>
*│* 𖣘 .neon <text>
*│* 𖣘 .devil <text>
*│* 𖣘 .purple <text>
*│* 𖣘 .thunder <text>
*│* 𖣘 .leaves <text>
*│* 𖣘 .1917 <text>
*│* 𖣘 .arena <text>
*│* 𖣘 .hacker <text>
*│* 𖣘 .sand <text>
*│* 𖣘 .blackpink <text>
*│* 𖣘 .glitch <text>
*│* 𖣘 .fire <text>
*╰──────────────────╯*

*╭─📥─[ 10 - DOWNLOADER ]─📥─╮*
*│* 𖣘 .play <song_name>
*│* 𖣘 .song <song_name>
*│* 𖣘 .spotify <query>
*│* 𖣘 .instagram <link>
*│* 𖣘 .facebook <link>
*│* 𖣘 .twitter <link>
*│* 𖣘 .tiktok <link>
*│* 𖣘 .video <song name>
*│* 𖣘 .ytmp4 <Link>
*╰──────────────────╯*

*╭─🧩─[ 11 - MISC ]─🧩─╮*
*│* 𖣘 .heart
*│* 𖣘 .horny
*│* 𖣘 .circle
*│* 𖣘 .lgbt
*│* 𖣘 .lolice
*│* 𖣘 .its-so-stupid
*│* 𖣘 .namecard
*│* 𖣘 .oogway
*│* 𖣘 .tweet
*│* 𖣘 .ytcomment
*│* 𖣘 .comrade
*│* 𖣘 .gay
*│* 𖣘 .glass
*│* 𖣘 .jail
*│* 𖣘 .passed
*│* 𖣘 .triggered
*╰──────────────────╯*

*╭─🖼️─[ 12 - ANIME ]─🖼️─╮*
*│* 𖣘 .nom
*│* 𖣘 .poke
*│* 𖣘 .cry
*│* 𖣘 .kiss
*│* 𖣘 .pat
*│* 𖣘 .hug
*│* 𖣘 .wink
*│* 𖣘 .facepalm
*╰──────────────────╯*

*╭─💻─[ 13 - GITHUB ]─💻─╮*
*│* 𖣘 .git
*│* 𖣘 .github
*│* 𖣘 .sc
*│* 𖣘 .script
*│* 𖣘 .repo
*╰──────────────────╯*

*⚡ TIP : Type .help <command> to see how it works*
*👑 KING MD V4 - BUILT DIFFERENT*
*🔐 COPY THIS = YOU ARE FAKE KING*

Join our channel for updates:`;

    try {
        // REACT + TYPING LIKE A REAL HACKER
        const reacts = ["👑", "💀", "🔥", "⚡", "💎", "🕶️", "👽"];
        const randomReact = reacts[Math.floor(Math.random() * reacts.length)];

        await sock.sendMessage(chatId, {
            react: { text: randomReact, key: message.key }
        });

        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(r => setTimeout(r, 1200)); // fake hacker typing delay

        const imagePath = path.join(__dirname, '../assets/menu.jpeg');
        
        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
                mentions: [sender],
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363161513685998@newsletter',
                        newsletterName: 'KING MD V4',
                        serverMessageId: -1
                    }
                }
            },{ quoted: message });
        } else {
            await sock.sendMessage(chatId, { 
                text: helpMessage,
                mentions: [sender],
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363161513685998@newsletter',
                        newsletterName: 'KING MD V4',
                        serverMessageId: -1
                    } 
                }
            });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;
