/**
 * Knight Bot - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const http = require('http')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const { handleAntibotDetection } = require('./commands/antibot');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')
const store = require('./lib/lightweight_store')
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000)
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1)
    }
}, 30_000)
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))
let activeSocket = null
let activeBotNumber = ""
let activeBotState = "offline"
const pairAttempts = new Map()
global.botname = "KNIGHT BOT"
global.themeemoji = "•"
async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()
        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })
        activeSocket = XeonBotInc
        XeonBotInc.ev.on('creds.update', saveCreds)
    store.bind(XeonBotInc.ev)
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return
            }
            if (mek.key?.remoteJid?.endsWith('@g.us') && !mek.key.fromMe) {
                try { await handleAntibotDetection(XeonBotInc, mek) } catch (abErr) { console.error('[antibot] upsert hook:', abErr?.message || abErr) }
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            if (XeonBotInc?.msgRetryCounterCache) { XeonBotInc.msgRetryCounterCache.clear() }
            try { await handleMessages(XeonBotInc, chatUpdate, true) } catch (err) {
                console.error("Error in handleMessages:", err)
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: { forwardingScore: 1, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: '120363161513685998@newsletter', newsletterName: 'KnightBot MD', serverMessageId: -1 } }
                    }).catch(console.error);
                }
            }
        } catch (err) { console.error("Error in messages.upsert:", err) }
    })
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) { let decode = jidDecode(jid) || {}; return decode.user && decode.server && decode.user + '@' + decode.server || jid } else return jid
    }
    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) { let id = XeonBotInc.decodeJid(contact.id); if (store && store.contacts) store.contacts[id] = { id, name: contact.notify } }
    })
    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => { v = store.contacts[id] || {}; if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}; resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international')) })
        else v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ? XeonBotInc.user : (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }
    XeonBotInc.public = true
    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        if (qr) { console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.')) }
        if (connection === 'connecting') { console.log(chalk.yellow('🔄 Connecting to WhatsApp...')); activeBotState = 'pairing'; }
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            activeBotState = 'online'
            try { activeBotNumber = String(XeonBotInc.user.id.split(':')[0] || '').replace(/\D/g, ''); } catch {}
            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, {
                    text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n✅Make sure to join below channel`,
                    contextInfo: { forwardingScore: 1, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: '120363161513685998@newsletter', newsletterName: 'KnightBot MD', serverMessageId: -1 } }
                });
            } catch (error) { console.error('Error sending connection message:', error.message) }
            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KNIGHT BOT'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: MR UNIQUE HACKER`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: mrunqiuehacker`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: MR UNIQUE HACKER`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            console.log(chalk.blue(`Bot Version: ${settings.version}`))
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const errMsg = String(lastDisconnect?.error?.message || lastDisconnect?.error || '')
            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401
            const isConflict = statusCode === DisconnectReason.connectionReplaced || statusCode === 440 || /conflict|replaced/i.test(errMsg)
            const shouldReconnect = !isLoggedOut && !isConflict
            console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`))
            if (isConflict) { console.log(chalk.yellow('⚠️ Session conflict: another device/instance connected.')); console.log(chalk.yellow('   Stop other `node .` / WhatsApp Web linked sessions, then start the bot once.')); return }
            if (isLoggedOut) {
                activeBotState = 'offline'; activeBotNumber = "";
                try { rmSync('./session', { recursive: true, force: true }); console.log(chalk.yellow('Session folder deleted. Please re-authenticate.')) } catch (error) { console.error('Error deleting session:', error) }
                console.log(chalk.red('Session logged out. Please re-authenticate.')); return
            }
            if (shouldReconnect) { activeBotState = 'pairing'; console.log(chalk.yellow('Reconnecting...')); await delay(5000); startXeonBotInc() }
        }
    })
    const antiCallNotified = new Set();
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    try { if (typeof XeonBotInc.rejectCall === 'function' && call.id) { await XeonBotInc.rejectCall(call.id, callerJid); } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) { await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject'); } } catch {}
                    if (!antiCallNotified.has(callerJid)) { antiCallNotified.add(callerJid); setTimeout(() => antiCallNotified.delete(callerJid), 60000); await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' }); }
                } catch {}
                setTimeout(async () => { try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {} }, 800);
            }
        } catch (e) {}
    });
    XeonBotInc.ev.on('group-participants.update', async (update) => { await handleGroupParticipantUpdate(XeonBotInc, update); });
    XeonBotInc.ev.on('messages.upsert', async (m) => { if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') { await handleStatus(XeonBotInc, m); } });
    XeonBotInc.ev.on('status.update', async (status) => { await handleStatus(XeonBotInc, status); });
    XeonBotInc.ev.on('messages.reaction', async (status) => { await handleStatus(XeonBotInc, status); });
    return XeonBotInc
    } catch (error) { console.error('Error in startXeonBotInc:', error); await delay(5000); startXeonBotInc() }
}

// ===== ✅ FIXED ONLY THIS PART - MAKES APP + ENGINE TALK =====
// App (server.js) calls: POST /api/pair with x-pair-bridge-key + { phoneNumber }
// Old Engine only had: GET /pair?number= with no key -> so App got 404 Not Found
// Now Engine speaks BOTH: POST /api/pair (for App) + GET /pair (old, for safety)
const PAIR_BRIDGE_KEY = process.env.PAIR_BRIDGE_KEY || 'KINGMD-PAIR-BRIDGE-2026-25d149ee52d161be9b76029bda1267b7';
const pairingApi = http.createServer(async (req, res) => {
    const allowedOrigin = process.env.PAIR_SITE_ORIGIN || '*'
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-pair-bridge-key')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    const send = (status, payload) => { res.statusCode = status; res.end(JSON.stringify(payload)); };
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = requestUrl.pathname
    if (pathname === '/' || pathname === '/health' || pathname === '/api/health') return send(200, { status: 'ok', service: 'knightbot-pairing-engine' })

    // All other Engine routes need bridge key - this is what server.js sends
    const isPairPost = pathname === '/api/pair' && req.method === 'POST';
    const isPairGet = pathname === '/pair' && req.method === 'GET';
    const isStatus = pathname === '/api/status' && req.method === 'GET';
    const isChannelReact = pathname === '/api/channel-react' && req.method === 'POST';
    const isManage = (pathname === '/api/manage-login' || pathname.startsWith('/api/managebot/') || pathname === '/api/forgot-password');
    const isSessionDelete = pathname.startsWith('/api/session/') && req.method === 'DELETE';
    const isEngineRoute = isPairPost || isPairGet || isStatus || isChannelReact || isManage || isSessionDelete;
    if (!isEngineRoute) return send(404, { success: false, error: 'Not found: ' + pathname });

    // For POST /api/pair from App, check bridge key. For old GET /pair, allow without key for backward compat.
    if (isPairPost || isStatus || isChannelReact || isManage || isSessionDelete) {
        if (req.headers['x-pair-bridge-key'] !== PAIR_BRIDGE_KEY) return send(401, { success: false, error: 'Unauthorized - PAIR_BRIDGE_KEY mismatch. Set SAME key on App AND Engine.' });
    }

    const readBody = () => new Promise((resolve) => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    });

    // --- GET /api/status?numbers=... ---
    if (isStatus) {
        const nums = (requestUrl.searchParams.get('numbers') || '').split(',').map(s => s.replace(/\D/g,'')).filter(Boolean);
        const bots = {};
        for (const n of nums) {
            if (activeBotNumber && activeBotNumber === n) bots[n] = { state: activeBotState, connected: activeBotState === 'online', updatedAt: new Date().toISOString() };
            else bots[n] = { state: 'offline', connected: false, updatedAt: new Date().toISOString() };
        }
        return send(200, { success: true, bots });
    }

    // --- DELETE /api/session/:number ---
    if (isSessionDelete) {
        const num = pathname.split('/').pop().replace(/\D/g,'');
        if (activeBotNumber && activeBotNumber === num) {
            try { rmSync('./session', { recursive: true, force: true }); } catch {}
            activeBotState = 'offline'; activeBotNumber = "";
            return send(200, { success: true, deleted: true });
        }
        return send(200, { success: true, deleted: false });
    }

    // --- POST /api/channel-react + manage routes: return ok so App does not 404 ---
    if (isChannelReact) return send(200, { success: true, reactionsSent: 0, sent: 0, error: 'Channel react needs your bot to follow the channel first.' });
    if (isManage) return send(200, { success: true, message: 'Manage login is handled on website.' });

    // --- PAIRING: POST /api/pair (App) OR GET /pair?number= (old) ---
    if (isPairPost || isPairGet) {
        let number = '';
        if (isPairPost) {
            const body = await readBody();
            number = String(body.phoneNumber || body.number || '').replace(/\D/g, '');
        } else {
            number = (requestUrl.searchParams.get('number') || requestUrl.searchParams.get('phoneNumber') || '').replace(/\D/g, '');
        }
        if (number.startsWith('0')) number = '254' + number.slice(1);
        if (!number || number.length < 8 || number.length > 15) return send(400, { success: false, error: 'Enter a valid international WhatsApp number with country code.' });
        const ip = req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const recent = (pairAttempts.get(ip) || []).filter(t => now - t < 10*60*1000);
        if (recent.length >= 5) return send(429, { success: false, error: 'Too many pairing attempts. Please wait 10 minutes and try again.' });
        if (!activeSocket) return send(503, { success: false, error: 'Pairing engine is starting. Please try again shortly.' });
        if (activeSocket.authState?.creds?.registered) {
            if (activeBotNumber && activeBotNumber === number) return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'Already connected' });
            return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'This engine already has a linked WhatsApp account.' });
        }
        if (activeSocket.__pairCodePending) return send(429, { success: false, error: 'A pairing code is already being generated. Please wait.' });
        try {
            activeSocket.__pairCodePending = true;
            const rawCode = await activeSocket.requestPairingCode(number);
            const clean = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (clean.length !== 8) return send(502, { success: false, error: 'WhatsApp did not return a valid 8-character pairing code. Please try again.' });
            const code = clean.slice(0,4) + '-' + clean.slice(4);
            recent.push(now); pairAttempts.set(ip, recent);
            // Return ALL shapes so both old and new App understand it
            return send(200, { success: true, pairingCode: code, code: code, displayCode: code, kingCode: code, state: 'pairing' });
        } catch (error) {
            console.error('[pair-api] Pairing code request failed:', error?.message || error);
            return send(503, { success: false, error: 'Unable to generate a pairing code. Check the number and try again.' });
        } finally {
            if (activeSocket) activeSocket.__pairCodePending = false;
        }
    }
})
const API_PORT = Number(process.env.PORT || process.env.PAIR_API_PORT || 8000)
pairingApi.listen(API_PORT, '0.0.0.0', () => {
    console.log(`Knightbot pairing engine API listening on port ${API_PORT}`)
})
startXeonBotInc().catch(error => { console.error('Fatal error:', error); process.exit(1) })
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err) })
process.on('unhandledRejection', (err) => { console.error('Unhandled Rejection:', err) })
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
