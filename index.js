require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const crypto = require('crypto')
const http = require('http')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const QRCode = require('qrcode')
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
const sessions = new Map();
// Reconnect one saved WhatsApp session at a time; timers are process-local and
// credentials remain on disk across restarts and temporary network outages.
const reconnectTimers = new Map();
const reconnectAttempts = new Map();
let activeSocket = null
let activeBotNumber = ""
let activeBotState = "offline"
const pairAttempts = new Map()
global.botname = "KING MD V4"
global.themeemoji = "•"

// ✅ ONLY YOUR 2 CHANNELS - NOTHING ELSE
const MY_CHANNEL_1_LINK = 'https://whatsapp.com/channel/0029Vb9AwScF6sn47ClubG1Z'
const MY_CHANNEL_1_INVITE = '0029Vb9AwScF6sn47ClubG1Z'
const MY_CHANNEL_1_JID = '120207367533840780@newsletter'
const MY_CHANNEL_2_LINK = 'https://whatsapp.com/channel/0029VbCwmFXDzgT4FzZm6d28'
const MY_CHANNEL_2_INVITE = '0029VbCwmFXDzgT4FzZm6d28'
// Channel 2 JID is resolved automatically via newsletterMetadata below, fallback = Channel 1 JID so forwarding never breaks

function generateGoodPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = (n) => Array.from({length: n}, () => chars[crypto.randomInt(chars.length)]).join('');
  return pick(8).replace(/\s/g, '').trim();
}
const MANAGE_PASSWORD_FILE = path.join(__dirname, 'data', 'manage-passwords.json');
const WELCOME_SENT_FILE = path.join(__dirname, 'data', 'manage-welcome-sent.json');
const welcomeSending = new Set();
function readJsonMap(file) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
}
function writeJsonMap(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
let managePasswords = readJsonMap(MANAGE_PASSWORD_FILE);
let managePasswordsChanged = false;
for (const [number, value] of Object.entries(managePasswords)) {
  const cleaned = String(value || '').replace(/\s/g, '').trim().toUpperCase();
  if (cleaned !== value) { managePasswords[number] = cleaned; managePasswordsChanged = true; }
}
if (managePasswordsChanged) writeJsonMap(MANAGE_PASSWORD_FILE, managePasswords);
let welcomeSent = readJsonMap(WELCOME_SENT_FILE);
function saveManagePassword(botNumber, password) {
  const n = String(botNumber).replace(/\D/g, '');
  const cleanedPassword = String(password || '').replace(/\s/g, '').trim().toUpperCase();
  if (!n || !/^[A-HJKMNP-Z2-9]{8}$/.test(cleanedPassword)) return;
  if (!managePasswords[n]) { managePasswords[n] = cleanedPassword; writeJsonMap(MANAGE_PASSWORD_FILE, managePasswords); }
}
async function syncManagePasswordToPanel(botNumber, candidatePassword) {
  const panelUrl = String(process.env.KING_MD_PANEL_URL || process.env.PANEL_URL || settings.panelUrl || '').replace(/\/+$/, '');
  if (!panelUrl) return String(candidatePassword).replace(/\s/g, '').trim().toUpperCase();
  try {
    const response = await axios.post(panelUrl + '/api/bot/set-password-from-bot', {
      key: PAIR_BRIDGE_KEY, number: String(botNumber).replace(/\D/g, ''), password: candidatePassword
    }, { timeout: 15000, headers: { 'Content-Type': 'application/json' } });
    if (!response.data?.success || !response.data?.password) throw new Error(response.data?.error || 'Panel did not return the saved password');
    return String(response.data.password).replace(/\s/g, '').trim().toUpperCase();
  } catch (error) {
    console.log('[manage-password] Website sync failed:', error.message || error);
    return String(candidatePassword).replace(/\s/g, '').trim().toUpperCase();
  }
}
async function getFirstManagePassword(botNumber) {
  const n = String(botNumber).replace(/\D/g, '');
  if (!n) throw new Error('Invalid bot number');
  // The panel's first-write-wins record is authoritative across engine servers.
  let candidate = String(managePasswords[n] || '').replace(/\s/g, '').trim().toUpperCase();
  if (!/^[A-HJKMNP-Z2-9]{8}$/.test(candidate)) candidate = generateGoodPassword();
  const canonical = await syncManagePasswordToPanel(n, candidate);
  if (managePasswords[n] !== canonical) {
    managePasswords[n] = canonical;
    writeJsonMap(MANAGE_PASSWORD_FILE, managePasswords);
  }
  return canonical;
}
function hasSentConnectionWelcome(botNumber) { return !!welcomeSent[String(botNumber).replace(/\D/g, '')]; }
function markConnectionWelcomeSent(botNumber) {
  const n = String(botNumber).replace(/\D/g, '');
  if (!n || welcomeSent[n]) return;
  welcomeSent[n] = new Date().toISOString();
  writeJsonMap(WELCOME_SENT_FILE, welcomeSent);
}
function isNumberAlreadyRegistered(number){
  try {
    const credsPath = path.join(__dirname, 'sessions', String(number), 'creds.json');
    if (!existsSync(credsPath)) return false;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return creds && creds.registered === true;
  } catch { return false; }
}
// Migrate bots that already had a password on the old engine: that password was
// created inside connection.open, so these registered sessions already received
// (or attempted) their first welcome. Do not repeat it after deploying this fix.
for (const n of Object.keys(managePasswords)) {
  if (!welcomeSent[n] && isNumberAlreadyRegistered(n)) welcomeSent[n] = 'migrated-existing-bot';
}
if (Object.keys(welcomeSent).length) writeJsonMap(WELCOME_SENT_FILE, welcomeSent);
function getAllEngineNumbers(){
  let folders = [];
  try { folders = fs.readdirSync(path.join(__dirname, 'sessions')).filter(f => /^\d{8,15}$/.test(f)); } catch {}
  return [...new Set([...folders, ...sessions.keys()].filter(n => /^\d{8,15}$/.test(String(n))))];
}
function scheduleSessionReconnect(number) {
  const n = String(number || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(n) || reconnectTimers.has(n)) return;
  const attempt = reconnectAttempts.get(n) || 0;
  const waitMs = attempt === 0 ? 5000 : 10000;
  reconnectAttempts.set(n, attempt + 1);
  const existing = sessions.get(n);
  if (existing) existing.state = 'offline';
  console.log(`[KING MD V4] Reconnecting ${n} in ${waitMs / 1000} seconds (attempt ${attempt + 1})`);
  const timer = setTimeout(async () => {
    reconnectTimers.delete(n);
    const live = sessions.get(n);
    if (live?.sock && live.sock.user?.id && live.state === 'online') return;
    try {
      const socket = await startXeonBotInc(n);
      if (!socket) scheduleSessionReconnect(n);
    } catch (error) {
      console.error(`[KING MD V4] Reconnect attempt failed for ${n}:`, error?.message || error);
      scheduleSessionReconnect(n);
    }
  }, waitMs);
  if (typeof timer.unref === 'function') timer.unref();
  reconnectTimers.set(n, timer);
}
async function startXeonBotInc(requestNumber) {
    const wanted = String(requestNumber || '').replace(/\D/g, '');
    const sessionFolder = wanted ? path.join(__dirname, 'sessions', wanted) : path.join(__dirname, 'session');
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        if (wanted && sessions.has(wanted) && sessions.get(wanted).sock) {
            return sessions.get(wanted).sock;
        }
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
                if (mek.key && mek.key.remoteJid) { await XeonBotInc.sendMessage(mek.key.remoteJid, { text: '❌ An error occurred while processing your message.', contextInfo: { forwardingScore: 1, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: MY_CHANNEL_1_JID, newsletterName: 'KING MD V4', serverMessageId: -1 } } }).catch(console.error); }
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
        if (qr) { const liveEntry = sessions.get(sessionKey); if (liveEntry) { liveEntry.qr = qr; liveEntry.qrUpdatedAt = Date.now(); } console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.')) }
        if (connection === 'connecting') {
            const restoringSavedLogin = state.creds?.registered === true;
            console.log(chalk.yellow(restoringSavedLogin ? '🔄 Restoring saved WhatsApp session...' : '🔄 Connecting to WhatsApp...'));
            // A previously paired bot is offline while reconnecting, never shown as a new pairing.
            activeBotState = restoringSavedLogin ? 'offline' : 'pairing';
            if (sessions.has(sessionKey)) sessions.get(sessionKey).state = restoringSavedLogin ? 'offline' : 'pairing';
        }
        if (connection == "open") {
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            activeBotState = 'online'
            try { activeBotNumber = String(XeonBotInc.user.id.split(':')[0] || '').replace(/\D/g, ''); } catch {}
            if (activeBotNumber) {
                const realKey = activeBotNumber;
                reconnectAttempts.delete(realKey);
                const pendingReconnect = reconnectTimers.get(realKey);
                if (pendingReconnect) { clearTimeout(pendingReconnect); reconnectTimers.delete(realKey); }
                if (sessions.has(sessionKey) && sessionKey !== realKey) {
                    const entry = sessions.get(sessionKey);
                    sessions.delete(sessionKey);
                    entry.botNumber = realKey; entry.state = 'online'; entry.number = realKey;
                    sessions.set(realKey, entry);
                } else if (sessions.has(realKey)) { sessions.get(realKey).state = 'online'; sessions.get(realKey).botNumber = realKey; }
            }
            if (sessions.has(sessionKey)) sessions.get(sessionKey).state = 'online';
            try {
                const botNumber = String(XeonBotInc.user.id.split(':')[0] || '').replace(/\D/g, '');
                const entry = sessions.get(botNumber) || sessions.get(sessionKey);
                if (entry) { entry.state = 'online'; entry.botNumber = botNumber; entry.number = botNumber; }
                if (botNumber && !hasSentConnectionWelcome(botNumber) && !welcomeSending.has(botNumber)) {
                    welcomeSending.add(botNumber);
                    try {
                        const password = await getFirstManagePassword(botNumber);
                        const jid1 = MY_CHANNEL_1_JID;
                        const welcomeText = `👋 WELCOME TO\n👑🔥 KING MD V4 🔥👑\n\n🤖 Your bot has been connected successfully and is now online ✅.\n\n- Type .menu to view all commands\n- Type .settings to check current settings\n\n📱 Bot Number\n└➤ \`\`\`\n+${botNumber}\n\`\`\`\n\n🔐 Manage-Bot Password\n└➤ \`\`\`\n${password}\n\`\`\`\n\n🌐 Bot Control Panel\n└➤ ${(process.env.KING_MD_PANEL_URL || process.env.PANEL_URL || settings.panelUrl) ? ('🌐 Bot Control Panel\n└➤ ' + String(process.env.KING_MD_PANEL_URL || process.env.PANEL_URL || settings.panelUrl).replace(/\/+$/, '') + '\n\n') : ''}\n\n📌 Open Manage Bot and enter this password to sign in.\n\n💡 FORGOT YOUR PASSWORD?\nType password (or .password) privately to this bot to receive the same saved password.\n\n⚠️ KEEP YOUR PASSWORD PRIVATE.`;
                        const ctx = { forwardingScore: 999, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: jid1, newsletterName: 'KING MD V4', serverMessageId: 1 } };
                        const myJid = botNumber + '@s.whatsapp.net';
                        const dpPath = path.join(__dirname, 'assets', 'welcome.jpg');
                        if (fs.existsSync(dpPath)) await XeonBotInc.sendMessage(myJid, { image: fs.readFileSync(dpPath), caption: welcomeText, contextInfo: ctx });
                        else await XeonBotInc.sendMessage(myJid, { text: welcomeText, contextInfo: ctx });
                        // Persist only after WhatsApp accepted the welcome message.
                        markConnectionWelcomeSent(botNumber);
                    } finally { welcomeSending.delete(botNumber); }
                }
            } catch (error) { console.error('Error sending connection message:', error.message) }
            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KING MD V4'} ]`)}\n\n`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`)); console.log(chalk.blue(`Bot Version: ${settings.version}`))
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode; const errMsg = String(lastDisconnect?.error?.message || lastDisconnect?.error || '')
            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401
            const numberForReconnect = wanted || String(XeonBotInc.user?.id || '').split(':')[0].replace(/\D/g, '')
            console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}; logged_out=${isLoggedOut}`))
            if (isLoggedOut) {
                activeBotState = 'offline';
                if (numberForReconnect && activeBotNumber === numberForReconnect) activeBotNumber = "";
                // WhatsApp explicitly revoked this login: this is the only disconnect
                // path that removes the saved credentials.
                try { rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
                const current = sessions.get(sessionKey);
                if (current?.sock === XeonBotInc) sessions.delete(sessionKey);
                if (numberForReconnect && sessions.get(numberForReconnect)?.sock === XeonBotInc) sessions.delete(numberForReconnect);
                const pending = reconnectTimers.get(numberForReconnect);
                if (pending) { clearTimeout(pending); reconnectTimers.delete(numberForReconnect); }
                reconnectAttempts.delete(numberForReconnect);
                console.log(chalk.red('Session logged out. Please re-authenticate.'));
                return;
            }
            // Network loss, server restart, stream errors and conflicts all retain
            // the auth files and retry automatically. A conflict is not a logout.
            if (numberForReconnect) {
                const current = sessions.get(sessionKey);
                if (current?.sock === XeonBotInc) sessions.delete(sessionKey);
                if (sessions.get(numberForReconnect)?.sock === XeonBotInc) sessions.delete(numberForReconnect);
                const pending = sessions.get(numberForReconnect);
                if (pending) pending.state = 'offline';
                if (activeBotNumber === numberForReconnect) activeBotState = 'offline';
                scheduleSessionReconnect(numberForReconnect);
            }
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
    } catch (error) {
        console.error('Error in startXeonBotInc:', error);
        if (wanted) scheduleSessionReconnect(wanted);
        return null;
    }
}
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
    if (req.method === 'HEAD' || pathname === '/' || pathname === '/health' || pathname === '/api/health' || pathname === '/uptime') {
        res.statusCode = 200;
        if (req.method === 'HEAD') return res.end();
        return send(200, { status: 'ok', alive: true, service: 'king-md-v4-pairing-engine', botState: activeBotState, sessions: sessions.size, total: getAllEngineNumbers().length, uptime: process.uptime() })
    }
    const isPairPost = pathname === '/api/pair' && req.method === 'POST';
    const isPairGet = pathname === '/pair' && req.method === 'GET';
    const isQrGet = pathname === '/api/qr' && req.method === 'GET';
    const isQrStatus = pathname === '/api/qr-status' && req.method === 'GET';
    const isStatus = pathname === '/api/status' && req.method === 'GET';
    const isCount = pathname === '/api/count' && req.method === 'GET';
    const isChannelReact = pathname === '/api/channel-react' && req.method === 'POST';
    const isChannelFollow = pathname === '/api/channel-follow' && req.method === 'POST';
    const isManage = (pathname === '/api/manage-login' || pathname.startsWith('/api/managebot/') || pathname === '/api/forgot-password');
    const isSessionDelete = pathname.startsWith('/api/session/') && req.method === 'DELETE';
    const isEngineRoute = isPairPost || isPairGet || isQrGet || isQrStatus || isStatus || isCount || isChannelReact || isChannelFollow || isManage || isSessionDelete;
    if (!isEngineRoute) return send(404, { success: false, error: 'Not found: ' + pathname });
    if (isPairPost || isQrGet || isQrStatus || isStatus || isCount || isChannelReact || isChannelFollow || isManage || isSessionDelete) {
        if (req.headers['x-pair-bridge-key'] !== PAIR_BRIDGE_KEY) return send(401, { success: false, error: 'Unauthorized - PAIR_BRIDGE_KEY mismatch.' });
    }
    const readBody = () => new Promise((resolve) => { let data = ''; req.on('data', c => data += c); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } }); });
    if (isCount) {
        const allNums = getAllEngineNumbers();
        const bots = {};
        for (const n of allNums) {
            const entry = sessions.get(n);
            const alreadyReg = isNumberAlreadyRegistered(n);
            bots[n] = { state: entry ? entry.state : 'offline', connected: !!entry && entry.state === 'online' && !!entry.sock?.user?.id, updatedAt: new Date().toISOString() };
        }
        return send(200, { success: true, total: allNums.length, count: allNums.length, numbers: allNums, bots, sessions: allNums.length });
    }
    if (isQrGet) {
        const number = String(requestUrl.searchParams.get('number') || '').replace(/\D/g, '');
        const deviceId = String(requestUrl.searchParams.get('deviceId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
        if (number && !/^\d{8,15}$/.test(number)) return send(400, { success: false, error: 'Invalid WhatsApp number.' });
        if (!number && deviceId.length < 8) return send(400, { success: false, error: 'Invalid QR session.' });
        if (number && isNumberAlreadyRegistered(number)) return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'This number is already connected.' });
        try {
            const sessionKey = number || 'default';
            let entry = sessions.get(sessionKey);
            if (entry && entry.state === 'online') return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'This number is already connected.' });
            if (!entry || !entry.sock) {
                await startXeonBotInc(number);
                entry = sessions.get(sessionKey);
            }
            if (entry && deviceId) entry.deviceId = deviceId;
            const startedAt = Date.now();
            while (entry && !entry.qr && entry.state !== 'online' && Date.now() - startedAt < 25000) {
                await delay(500);
                entry = sessions.get(sessionKey) || [...sessions.values()].find(x => x.deviceId === deviceId);
            }
            if (entry?.state === 'online') return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'This WhatsApp session is already connected.' });
            if (!entry || !entry.qr) return send(503, { success: false, error: 'WhatsApp QR is not ready yet. Please try again in a few seconds.' });
            const qrImage = await QRCode.toDataURL(entry.qr, { errorCorrectionLevel: 'M', margin: 2, width: 280 });
            return send(200, { success: true, qr: entry.qr, qrImage, state: entry.state || 'pairing' });
        } catch (error) {
            console.error('[qr-api] QR generation failed:', error?.message || error);
            return send(503, { success: false, error: 'Could not create a WhatsApp QR code. Please try again.' });
        }
    }
    if (isQrStatus) {
        const deviceId = String(requestUrl.searchParams.get('deviceId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
        const entry = [...sessions.values()].find(x => x.deviceId === deviceId);
        if (!entry) return send(200, { success: true, connected: false, state: 'pairing' });
        const number = entry.botNumber || entry.number || '';
        return send(200, { success: true, connected: entry.state === 'online' && /^\d{8,15}$/.test(String(number)), number, state: entry.state || 'pairing' });
    }
    if (isStatus) {
        let nums = (requestUrl.searchParams.get('numbers') || '').split(',').map(s => s.replace(/\D/g,'')).filter(Boolean);
        if (!nums.length) nums = getAllEngineNumbers();
        const bots = {};
        for (const n of nums) {
            const entry = sessions.get(n);
            if (entry) bots[n] = { state: entry.state || 'offline', connected: entry.state === 'online' && !!entry.sock?.user?.id, updatedAt: new Date().toISOString() };
            else {
                const folderExists = existsSync(`./sessions/${n}`);
                const alreadyReg = isNumberAlreadyRegistered(n);
                bots[n] = { state: entry ? entry.state : (folderExists && !alreadyReg ? 'pairing' : 'offline'), connected: false, updatedAt: new Date().toISOString() };
            }
        }
        return send(200, { success: true, bots });
    }
    if (isSessionDelete) {
        const num = pathname.split('/').pop().replace(/\D/g,'');
        const entry = sessions.get(num);
        if (entry) { try { await entry.sock?.logout?.(); } catch {} try { await entry.sock?.end?.(); } catch {} sessions.delete(num); }
        try { rmSync(path.join(__dirname, 'sessions', num), { recursive: true, force: true }); } catch {}
        if (num === activeBotNumber) { activeBotState = 'offline'; activeBotNumber = ""; }
        const allNums = getAllEngineNumbers();
        return send(200, { success: true, deleted: true, total: allNums.length, count: allNums.length, numbers: allNums });
    }
    if (isChannelFollow) {
        const body = await readBody();
        const link = String(body.link || body.channelLink || '').trim();
        const match = link.match(/^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
        if (!match) return send(400, { success: false, error: 'A valid WhatsApp Channel invite link is required.' });
        const nums = Array.isArray(body.phoneNumbers) ? body.phoneNumbers.map(v => String(v).replace(/\D/g, '')).filter(v => /^\d{8,15}$/.test(v)) : [];
        if (!nums.length) return send(400, { success: false, error: 'No bot number was supplied.' });
        const results = [];
        for (const number of nums) {
            const entry = sessions.get(number);
            if (!entry || entry.state !== 'online' || !entry.sock) {
                results.push({ number, success: false, error: 'Bot is not connected.' });
                continue;
            }
            try {
                const sock = entry.sock;
                const metadataFn = sock.newsletterMetadata || sock.newsletterFetchMetadata;
                if (typeof metadataFn !== 'function' || typeof sock.newsletterFollow !== 'function') {
                    throw new Error('This Baileys build does not support WhatsApp Channel following.');
                }
                const meta = await metadataFn.call(sock, 'invite', match[1]);
                if (!meta?.id) throw new Error('WhatsApp could not resolve this Channel invite link.');
                await sock.newsletterFollow(meta.id);
                entry.followedChannels = Array.isArray(entry.followedChannels) ? entry.followedChannels : [];
                if (!entry.followedChannels.some(x => x.id === meta.id)) {
                    entry.followedChannels.push({ id: meta.id, link, name: meta.name || '' });
                }
                results.push({ number, success: true, channelId: meta.id, channelName: meta.name || '' });
            } catch (error) {
                results.push({ number, success: false, error: error.message || 'Channel follow failed.' });
            }
        }
        const success = results.some(x => x.success);
        return send(success ? 200 : 502, { success, results, message: success ? 'Channel link accepted and follow request sent to the bot.' : 'No bot could follow this channel.' });
    }
    if (isChannelReact) {
        const body = await readBody();
        const nums = Array.isArray(body.phoneNumbers)
            ? [...new Set(body.phoneNumbers.map(s => String(s).replace(/\D/g, '')).filter(n => /^\d{8,15}$/.test(n)))]
            : [];
        const link = String(body.link || body.channelLink || body.postLink || '').trim();
        const post = link.match(/^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]+)/i);
        if (!post) return send(400, { success: false, error: 'Use a WhatsApp Channel post link, not only the channel invite link.' });
        let emojis = Array.isArray(body.emojis) ? body.emojis : (typeof body.emoji === 'string' ? body.emoji.split(',') : []);
        emojis = emojis.map(x => String(x).trim()).filter(Boolean).slice(0, 5);
        if (!emojis.length) emojis = ['❤️', '👍', '😮', '🙏', '😂'];
        const limit = Math.max(1, Math.min(1000, Number(body.count || body.amount || 1000)));
        if (!nums.length) return send(400, { success: false, error: 'No deployed bot numbers were supplied for this account.' });
        const results = [];
        for (const number of nums.slice(0, limit)) {
            const entry = sessions.get(number);
            if (!entry || entry.state !== 'online' || !entry.sock) {
                results.push({ number, success: false, error: 'Bot is not connected.' });
                continue;
            }
            try {
                const sock = entry.sock;
                const metadataFn = sock.newsletterMetadata || sock.newsletterFetchMetadata;
                if (typeof metadataFn !== 'function' || typeof sock.newsletterReact !== 'function') {
                    throw new Error('This Baileys build does not support channel post reactions.');
                }
                const meta = await metadataFn.call(sock, 'invite', post[1]);
                if (!meta?.id) throw new Error('WhatsApp could not resolve this Channel invite link.');
                if (typeof sock.newsletterFollow === 'function') {
                    try { await sock.newsletterFollow(meta.id); } catch (_) {}
                }
                const emoji = emojis[results.length % emojis.length];
                await sock.newsletterReact(meta.id, post[2], emoji);
                results.push({ number, success: true, emoji, channelId: meta.id });
            } catch (error) {
                results.push({ number, success: false, error: error.message || 'Channel reaction failed.' });
            }
        }
        const reactionsSent = results.filter(x => x.success).length;
        return send(reactionsSent ? 200 : 502, {
            success: reactionsSent > 0, reactionsSent, sent: reactionsSent,
            emojisUsed: [...new Set(results.filter(x => x.success).map(x => x.emoji))],
            results,
            message: reactionsSent ? 'Channel reactions sent.' : (results[0]?.error || 'No connected bot could react.')
        });
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
        } catch (error) { console.error('[pair-api] Pairing code request failed:', error?.message || error); return send(503, { success: false, error: 'WhatsApp is still preparing your session. Tap Generate again in 6 seconds.' }); } finally { if (sock) sock.__pairCodePending = false; }
    }
})
const API_PORT = Number(process.env.PORT || process.env.PAIR_API_PORT || 8000)
pairingApi.listen(API_PORT, '0.0.0.0', () => { console.log(`Kingmd V4 pairing engine API listening on port ${API_PORT}`) })
try {
    const base = path.join(__dirname, 'sessions');
    if (existsSync(base)) {
        const folders = fs.readdirSync(base).filter(f => /^\d{8,15}$/.test(f));
        for (const num of folders) {
            // Do not start incomplete folders or request a fresh pairing code.
            if (!isNumberAlreadyRegistered(num)) {
                console.log(`[KING MD V4] Skipping ${num}: no valid registered creds.json yet`);
                continue;
            }
            console.log(`[KING MD V4] Restoring saved WhatsApp session for ${num}`);
            startXeonBotInc(num).catch(e => { console.error('Restore failed for', num, e.message); scheduleSessionReconnect(num); });
        }
    } else if (existsSync(path.join(__dirname, 'session'))) {
        console.log('[KING MD V4] Found old single ./session, starting it');
        startXeonBotInc('').catch(e => console.error(e.message));
    }
} catch (e) { console.error('Restore sessions error:', e.message); }
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err) })
process.on('unhandledRejection', (err) => { console.error('Unhandled Rejection:', err) })
