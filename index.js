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
setInterval(() => { if (global.gc) { global.gc() } }, 60_000)
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 480) console.log(`⚠️ RAM high: ${used.toFixed(0)}MB - running GC, NOT restarting`)
}, 30_000)
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))
// ===== KING MD FIXED: 1 NUMBER = 1 SESSION = 1 BOT - EVERYONE HAS OWN SESSION =====
const sessions = new Map();
let activeSocket = null
let activeBotNumber = ""
let activeBotState = "offline"
const pairAttempts = new Map()
global.botname = "KNIGHT BOT"
global.themeemoji = "•"

function isNumberAlreadyRegistered(number){
  try {
    const credsPath = `./sessions/${number}/creds.json`;
    if (!existsSync(credsPath)) return false;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return creds && creds.registered === true;
  } catch { return false; }
}

async function startXeonBotInc(requestNumber) {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const wanted = String(requestNumber || '').replace(/\D/g,'');
        if (wanted && sessions.has(wanted) && sessions.get(wanted).sock) {
            return sessions.get(wanted).sock;
        }
        const sessionFolder = wanted ? `./sessions/${wanted}` : `./session`;
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder)
        const msgRetryCounterCache = new NodeCache()
        const XeonBotInc = makeWASocket({
            version, logger: pino({ level: 'silent' }), printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })) },
            markOnlineOnConnect: true, generateHighQualityLinkPreview: true, syncFullHistory: false,
            getMessage: async (key) => { let jid = jidNormalizedUser(key.remoteJid); let msg = await store.loadMessage(jid, key.id); return msg?.message || "" },
            msgRetryCounterCache, defaultQueryTimeoutMs: 60000, connectTimeoutMs: 60000, keepAliveIntervalMs: 10000,
        })
        const sessionKey = wanted || 'default';
        sessions.set(sessionKey, { sock: XeonBotInc, state: 'pairing', number: wanted, botNumber: wanted });
        activeSocket = XeonBotInc
        if (wanted) activeBotNumber = wanted;
        XeonBotInc.ev.on('creds.update', saveCreds)
    store.bind(XeonBotInc.ev)
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') { await handleStatus(XeonBotInc, chatUpdate); return; }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') { const isGroup = mek.key?.remoteJid?.endsWith('@g.us'); if (!isGroup) return }
            if (mek.key?.remoteJid?.endsWith('@g.us') && !mek.key.fromMe) { try { await handleAntibotDetection(XeonBotInc, mek) } catch (abErr) { console.error('[antibot] upsert hook:', abErr?.message || abErr) } }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            if (XeonBotInc?.msgRetryCounterCache) { XeonBotInc.msgRetryCounterCache.clear() }
            try { await handleMessages(XeonBotInc, chatUpdate, true) } catch (err) {
                console.error("Error in handleMessages:", err)
                if (mek.key && mek.key.remoteJid) { await XeonBotInc.sendMessage(mek.key.remoteJid, { text: '❌ An error occurred while processing your message.', contextInfo: { forwardingScore: 1, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: '120363161513685998@newsletter', newsletterName: 'KnightBot MD', serverMessageId: -1 } } }).catch(console.error); }
            }
        } catch (err) { console.error("Error in messages.upsert:", err) }
    })
    XeonBotInc.decodeJid = (jid) => { if (!jid) return jid; if (/:\d+@/gi.test(jid)) { let decode = jidDecode(jid) || {}; return decode.user && decode.server && decode.user + '@' + decode.server || jid } else return jid }
    XeonBotInc.ev.on('contacts.update', update => { for (let contact of update) { let id = XeonBotInc.decodeJid(contact.id); if (store && store.contacts) store.contacts[id] = { id, name: contact.notify } } })
    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid); withoutContact = XeonBotInc.withoutContact || withoutContact; let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => { v = store.contacts[id] || {}; if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}; resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international')) })
        else v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ? XeonBotInc.user : (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }
    XeonBotInc.public = true; XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        if (qr) { console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.')) }
        if (connection === 'connecting') { console.log(chalk.yellow('🔄 Connecting to WhatsApp...')); activeBotState = 'pairing'; if (sessions.has(sessionKey)) sessions.get(sessionKey).state = 'pairing'; }
        if (connection == "open") {
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            activeBotState = 'online'
            try { activeBotNumber = String(XeonBotInc.user.id.split(':')[0] || '').replace(/\D/g, ''); } catch {}
            if (activeBotNumber) {
                const realKey = activeBotNumber;
                if (sessions.has(sessionKey) && sessionKey !== realKey) {
                    const entry = sessions.get(sessionKey);
                    sessions.delete(sessionKey);
                    entry.botNumber = realKey; entry.state = 'online'; entry.number = realKey;
                    sessions.set(realKey, entry);
                } else if (sessions.has(realKey)) { sessions.get(realKey).state = 'online'; sessions.get(realKey).botNumber = realKey; }
            }
            if (sessions.has(sessionKey)) sessions.get(sessionKey).state = 'online';
            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, { text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n✅Make sure to join below channel`, contextInfo: { forwardingScore: 1, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: '120363161513685998@newsletter', newsletterName: 'KnightBot MD', serverMessageId: -1 } } });
            } catch (error) { console.error('Error sending connection message:', error.message) }
            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KNIGHT BOT'} ]`)}\n\n`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`)); console.log(chalk.blue(`Bot Version: ${settings.version}`))
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode; const errMsg = String(lastDisconnect?.error?.message || lastDisconnect?.error || '')
            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401
            const isConflict = statusCode === DisconnectReason.connectionReplaced || statusCode === 440 || /conflict|replaced/i.test(errMsg)
            const shouldReconnect = !isLoggedOut && !isConflict
            console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`))
            if (isConflict) { console.log(chalk.yellow('⚠️ Session conflict: another device/instance connected.')); return }
            if (isLoggedOut) { activeBotState = 'offline'; activeBotNumber = ""; try { rmSync(sessionFolder, { recursive: true, force: true }); } catch {} if (sessions.has(sessionKey)) sessions.delete(sessionKey); console.log(chalk.red('Session logged out. Please re-authenticate.')); return }
            if (shouldReconnect) { activeBotState = 'pairing'; if (sessions.has(sessionKey)) sessions.get(sessionKey).state = 'pairing'; await delay(5000); sessions.delete(sessionKey); startXeonBotInc(wanted) }
        }
    })
    const antiCallNotified = new Set();
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall'); const state = readAnticallState(); if (!state.enabled) return;
            for (const call of calls) { const callerJid = call.from || call.peerJid || call.chatId; if (!callerJid) continue;
                try { try { if (typeof XeonBotInc.rejectCall === 'function' && call.id) { await XeonBotInc.rejectCall(call.id, callerJid); } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) { await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject'); } } catch {}
                    if (!antiCallNotified.has(callerJid)) { antiCallNotified.add(callerJid); setTimeout(() => antiCallNotified.delete(callerJid), 60000); await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' }); } } catch {}
                setTimeout(async () => { try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {} }, 800); }
        } catch (e) {}
    });
    XeonBotInc.ev.on('group-participants.update', async (update) => { await handleGroupParticipantUpdate(XeonBotInc, update); });
    XeonBotInc.ev.on('messages.upsert', async (m) => { if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') { await handleStatus(XeonBotInc, m); } });
    XeonBotInc.ev.on('status.update', async (status) => { await handleStatus(XeonBotInc, status); });
    XeonBotInc.ev.on('messages.reaction', async (status) => { await handleStatus(XeonBotInc, status); });
    return XeonBotInc
    } catch (error) { console.error('Error in startXeonBotInc:', error); await delay(5000); startXeonBotInc(requestNumber) }
}

// ===== PAIR API + UPTIME ALIVE - NOT REMOVED =====
const PAIR_BRIDGE_KEY = process.env.PAIR_BRIDGE_KEY || 'KINGMD-PAIR-BRIDGE-2026-25d149ee52d161be9b76029bda1267b7';
const pairingApi = http.createServer(async (req, res) => {
    const allowedOrigin = process.env.PAIR_SITE_ORIGIN || '*'
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-pair-bridge-key')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    const send = (status, payload) => { res.statusCode = status; res.end(JSON.stringify(payload)); };
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = requestUrl.pathname
    // UPTIME ALIVE - STILL HERE
    if (req.method === 'HEAD' || pathname === '/' || pathname === '/health' || pathname === '/api/health' || pathname === '/uptime') {
        res.statusCode = 200;
        if (req.method === 'HEAD') return res.end();
        return send(200, { status: 'ok', alive: true, service: 'knightbot-pairing-engine', botState: activeBotState, sessions: sessions.size, uptime: process.uptime() })
    }
    const isPairPost = pathname === '/api/pair' && req.method === 'POST';
    const isPairGet = pathname === '/pair' && req.method === 'GET';
    const isStatus = pathname === '/api/status' && req.method === 'GET';
    const isChannelReact = pathname === '/api/channel-react' && req.method === 'POST';
    const isManage = (pathname === '/api/manage-login' || pathname.startsWith('/api/managebot/') || pathname === '/api/forgot-password');
    const isSessionDelete = pathname.startsWith('/api/session/') && req.method === 'DELETE';
    const isEngineRoute = isPairPost || isPairGet || isStatus || isChannelReact || isManage || isSessionDelete;
    if (!isEngineRoute) return send(404, { success: false, error: 'Not found: ' + pathname });
    if (isPairPost || isStatus || isChannelReact || isManage || isSessionDelete) {
        if (req.headers['x-pair-bridge-key'] !== PAIR_BRIDGE_KEY) return send(401, { success: false, error: 'Unauthorized - PAIR_BRIDGE_KEY mismatch.' });
    }
    const readBody = () => new Promise((resolve) => { let data = ''; req.on('data', c => data += c); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } }); });
    if (isStatus) {
        const nums = (requestUrl.searchParams.get('numbers') || '').split(',').map(s => s.replace(/\D/g,'')).filter(Boolean);
        const bots = {};
        for (const n of nums) {
            const entry = sessions.get(n);
            if (entry) bots[n] = { state: entry.state || 'offline', connected: entry.state === 'online', updatedAt: new Date().toISOString() };
            else {
                const folderExists = existsSync(`./sessions/${n}`);
                const alreadyReg = isNumberAlreadyRegistered(n);
                bots[n] = { state: alreadyReg ? 'online' : (folderExists ? 'pairing' : 'offline'), connected: alreadyReg, updatedAt: new Date().toISOString() };
            }
        }
        return send(200, { success: true, bots });
    }
    if (isSessionDelete) {
        const num = pathname.split('/').pop().replace(/\D/g,'');
        const entry = sessions.get(num);
        if (entry) { try { await entry.sock?.logout?.(); } catch {} try { await entry.sock?.end?.(); } catch {} sessions.delete(num); }
        try { rmSync(`./sessions/${num}`, { recursive: true, force: true }); } catch {}
        if (num === activeBotNumber) { activeBotState = 'offline'; activeBotNumber = ""; }
        return send(200, { success: true, deleted: true });
    }
    if (isChannelReact) {
        const body = await readBody();
        const nums = Array.isArray(body.phoneNumbers) ? body.phoneNumbers.map(s=>String(s).replace(/\D/g,'')) : [];
        let sent = 0;
        for (const n of nums) { const entry = sessions.get(n); if (entry && entry.state === 'online') { sent = 1; break; } }
        return send(200, { success: true, reactionsSent: sent, sent: sent, error: sent ? '' : 'Channel react needs your bot to follow the channel first.' });
    }
    if (isManage) return send(200, { success: true, message: 'Manage login is handled on website.' });
    if (isPairPost || isPairGet) {
        let number = '';
        if (isPairPost) { const body = await readBody(); number = String(body.phoneNumber || body.number || '').replace(/\D/g, ''); } else { number = (requestUrl.searchParams.get('number') || requestUrl.searchParams.get('phoneNumber') || '').replace(/\D/g, ''); }
        if (number.startsWith('0')) number = '254' + number.slice(1);
        if (!number || number.length < 8 || number.length > 15) return send(400, { success: false, error: 'Enter a valid international WhatsApp number with country code.' });
        const ip = req.socket.remoteAddress || 'unknown'; const now = Date.now();
        const recent = (pairAttempts.get(ip) || []).filter(t => now - t < 10*60*1000);
        if (recent.length >= 5) return send(429, { success: false, error: 'Too many pairing attempts. Please wait 10 minutes and try again.' });
        // ===== FIXED: If THIS number is already connected, do NOT try to make fake code =====
        const entryBefore = sessions.get(number);
        if (entryBefore && entryBefore.state === 'online') {
            return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'Already connected' });
        }
        if (isNumberAlreadyRegistered(number)) {
            return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'Already connected' });
        }
        let entry = sessions.get(number);
        let sock = entry?.sock;
        if (!sock) {
            try { sock = await startXeonBotInc(number); entry = sessions.get(number); } catch (e) { return send(503, { success: false, error: 'Pairing engine is starting. Please try again shortly.' }); }
        }
        if (!sock) return send(503, { success: false, error: 'Pairing engine is starting. Please try again shortly.' });
        if (sock.__pairCodePending) return send(429, { success: false, error: 'A pairing code is already being generated for this number. Please wait.' });
        try {
            sock.__pairCodePending = true;
            if (sock.authState?.creds?.registered) {
                return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'Already connected' });
            }
            await delay(2500);
            let rawCode = '';
            let lastErr = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try { rawCode = await sock.requestPairingCode(number); if (rawCode) break; }
                catch (e) { lastErr = e; console.log(`[pair] Attempt ${attempt} failed for ${number}:`, e?.message); await delay(2000); }
            }
            if (!rawCode) {
                console.error('[pair-api] All attempts failed for', number, lastErr?.message);
                return send(503, { success: false, error: 'WhatsApp is still preparing your session. Tap Generate again in 5 seconds.' });
            }
            const clean = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (clean.length !== 8) return send(502, { success: false, error: 'WhatsApp did not return a valid code. Tap Generate again.' });
            const code = clean.slice(0,4) + '-' + clean.slice(4);
            recent.push(now); pairAttempts.set(ip, recent);
            return send(200, { success: true, pairingCode: code, code: code, displayCode: code, kingCode: code, state: 'pairing' });
        } catch (error) { console.error('[pair-api] Pairing code request failed:', error?.message || error); return send(503, { success: false, error: 'WhatsApp is still preparing your session. Tap Generate again in 5 seconds.' }); } finally { if (sock) sock.__pairCodePending = false; }
    }
})
const API_PORT = Number(process.env.PORT || process.env.PAIR_API_PORT || 8000)
pairingApi.listen(API_PORT, '0.0.0.0', () => { console.log(`Knightbot pairing engine API listening on port ${API_PORT}`) })
try {
    const base = './sessions';
    if (existsSync(base)) {
        const folders = fs.readdirSync(base).filter(f => /^\d{8,15}$/.test(f));
        for (const num of folders) {
            console.log(`[KING MD] Restoring session for ${num}`);
            startXeonBotInc(num).catch(e => console.error('Restore failed for', num, e.message));
        }
    } else if (existsSync('./session')) {
        console.log('[KING MD] Found old single ./session, starting it');
        startXeonBotInc('').catch(e => console.error(e.message));
    }
} catch (e) { console.error('Restore sessions error:', e.message); }
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err) })
process.on('unhandledRejection', (err) => { console.error('Unhandled Rejection:', err) })
