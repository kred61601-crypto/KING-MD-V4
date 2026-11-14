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
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

let owner = JSON.parse(fs.readFileSync('./data/owner.json'))
let activeSocket = null
let activeAuthState = null
let engineConnected = false
let lastLinkedNumber = null
let pendingPairNumber = null
let deletingSession = false
const pairAttempts = new Map()

global.botname = "KNIGHT BOT"
global.themeemoji = "•"

async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(process.env.SESSION_DIR || './session')
        activeAuthState = state
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

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            // In private mode, only block non-group messages (allow groups for moderation)
            // Note: XeonBotInc.public is not synced, so we check mode in main.js instead
            // This check is kept for backward compatibility but mainly blocks DMs
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Block DMs in private mode, but allow group messages
            }
            // Antibot must run before BAE5 drop — those IDs are exactly other Baileys bots
            if (mek.key?.remoteJid?.endsWith('@g.us') && !mek.key.fromMe) {
                try {
                    await handleAntibotDetection(XeonBotInc, mek)
                } catch (abErr) {
                    console.error('[antibot] upsert hook:', abErr?.message || abErr)
                }
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Clear message retry cache to prevent memory bloat
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363161513685998@newsletter',
                                newsletterName: 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }
        
        if (connection == "open") {
            engineConnected = true
            lastLinkedNumber = String(XeonBotInc.user?.id || '').split(':')[0].split('@')[0] || lastLinkedNumber
            if (lastLinkedNumber) { try { fs.writeFileSync('./.kingmd-linked-number.json', JSON.stringify({ number: lastLinkedNumber, updatedAt: new Date().toISOString() })) } catch (e) {} }
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, {
                    text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n✅Make sure to join below channel`,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363161513685998@newsletter',
                            newsletterName: 'KnightBot MD',
                            serverMessageId: -1
                        }
                    }
                });
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

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
            engineConnected = false
            if (deletingSession) return
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const errMsg = String(lastDisconnect?.error?.message || lastDisconnect?.error || '')
            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401
            const isConflict =
                statusCode === DisconnectReason.connectionReplaced ||
                statusCode === 440 ||
                /conflict|replaced/i.test(errMsg)
            const shouldReconnect = !isLoggedOut && !isConflict

            console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`))

            if (isConflict) {
                // Another WhatsApp Web / bot instance took the session — do NOT wipe auth
                console.log(chalk.yellow('⚠️ Session conflict: another device/instance connected.'))
                console.log(chalk.yellow('   Stop other `node .` / WhatsApp Web linked sessions, then start the bot once.'))
                return
            }

            if (isLoggedOut) {
                try {
                    rmSync(process.env.SESSION_DIR || './session', { recursive: true, force: true })
                    try { fs.rmSync('./.kingmd-linked-number.json', { force: true }) } catch (e) {}
                    lastLinkedNumber = null
                    console.log(chalk.yellow('Session folder deleted. Please re-authenticate.'))
                } catch (error) {
                    console.error('Error deleting session:', error)
                }
                console.log(chalk.red('Session logged out. Please re-authenticate.'))
                return
            }

            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnecting...'))
                await delay(5000)
                startXeonBotInc()
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await delay(5000)
        startXeonBotInc()
    }
}


// Private KING MD V4 bridge API. The website sends only a phone number and
// receives WhatsApp's genuine pairing code; no session ID or auth files leave this process.
const PAIR_BRIDGE_KEY = process.env.PAIR_BRIDGE_KEY || 'KINGMD-PAIR-BRIDGE-2026-25d149ee52d161be9b76029bda1267b7'
const pairingApi = http.createServer(async (req, res) => {
    const send = (status, payload) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(payload))
    }
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', process.env.PAIR_SITE_ORIGIN || '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pair-Bridge-Key')
        res.statusCode = 204
        return res.end()
    }
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    if (requestUrl.pathname === '/health' && req.method === 'GET') {
        return send(200, { status: 'ok', service: 'KING MD V4 WhatsApp engine' })
    }
    if (req.headers['x-pair-bridge-key'] !== PAIR_BRIDGE_KEY) {
        return send(401, { success: false, error: 'Unauthorized engine request.' })
    }

    let body = {}
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        try {
            let raw = ''
            for await (const chunk of req) {
                raw += chunk
                if (raw.length > 16 * 1024) return send(413, { success: false, error: 'Request too large.' })
            }
            body = raw ? JSON.parse(raw) : {}
        } catch (e) {
            return send(400, { success: false, error: 'Invalid JSON request.' })
        }
    }

    if (requestUrl.pathname === '/api/pair' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || 'unknown'
        const now = Date.now()
        const recent = (pairAttempts.get(ip) || []).filter(time => now - time < 10 * 60 * 1000)
        if (recent.length >= 8) return send(429, { success: false, error: 'Too many pairing attempts. Please wait and try again.' })
        const number = String(body.phoneNumber || '').replace(/\D/g, '')
        if (!/^\d{8,15}$/.test(number)) return send(400, { success: false, error: 'Enter a valid international WhatsApp number with country code.' })
        if (!activeSocket || !activeAuthState) return send(503, { success: false, error: 'WhatsApp engine is starting. Please try again shortly.' })
        if (activeAuthState.creds?.registered) {
            const linked = lastLinkedNumber || String(activeSocket.user?.id || '').split(':')[0].split('@')[0]
            if (linked === number) return send(409, { success: false, code: 'ALREADY_CONNECTED', error: 'This WhatsApp number is already connected.' })
            return send(409, { success: false, code: 'ENGINE_IN_USE', error: 'This engine already has one WhatsApp account connected. Remove that bot before pairing another number.' })
        }
        if (activeSocket.__pairCodePending) return send(429, { success: false, error: 'A pairing code is already being generated. Please wait.' })
        try {
            activeSocket.__pairCodePending = true
            pendingPairNumber = number
            // Baileys returns the real 8-character code accepted by WhatsApp.
            const rawCode = await activeSocket.requestPairingCode(number)
            const pairingCode = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
            if (pairingCode.length !== 8) return send(502, { success: false, error: 'WhatsApp did not return a valid 8-character pairing code.' })
            recent.push(now)
            pairAttempts.set(ip, recent)
            return send(200, { success: true, pairingCode, state: 'pairing' })
        } catch (error) {
            console.error('[KING MD pair API]', error?.message || error)
            return send(503, { success: false, error: 'Unable to generate a pairing code. Check the number and try again.' })
        } finally {
            if (activeSocket) activeSocket.__pairCodePending = false
        }
    }

    if (requestUrl.pathname === '/api/status' && req.method === 'GET') {
        const requested = (requestUrl.searchParams.get('numbers') || '').split(',').map(n => n.replace(/\D/g, '')).filter(Boolean)
        const linked = lastLinkedNumber || String(activeSocket?.user?.id || '').split(':')[0].split('@')[0]
        const bots = {}
        for (const number of requested) {
            if (number === linked && activeAuthState?.creds?.registered) {
                bots[number] = { state: engineConnected ? 'online' : 'offline', connected: engineConnected, updatedAt: new Date().toISOString() }
            } else if (number === pendingPairNumber && !activeAuthState?.creds?.registered) {
                bots[number] = { state: 'pairing', connected: false, updatedAt: new Date().toISOString() }
            } else {
                bots[number] = { state: 'offline', connected: false, updatedAt: new Date().toISOString() }
            }
        }
        return send(200, { success: true, bots })
    }

    if (requestUrl.pathname.startsWith('/api/session/') && req.method === 'DELETE') {
        const number = decodeURIComponent(requestUrl.pathname.slice('/api/session/'.length)).replace(/\D/g, '')
        const linked = lastLinkedNumber || String(activeSocket?.user?.id || '').split(':')[0].split('@')[0]
        if (!number || (linked && number !== linked && number !== pendingPairNumber)) {
            return send(404, { success: false, error: 'That WhatsApp session was not found on this engine.' })
        }
        try {
            deletingSession = true
            if (activeSocket) { try { activeSocket.end(new Error('Session removed from KING MD V4')) } catch (e) {} }
            activeSocket = null
            activeAuthState = null
            engineConnected = false
            lastLinkedNumber = null
            pendingPairNumber = null
            rmSync(process.env.SESSION_DIR || './session', { recursive: true, force: true })
            try { fs.rmSync('./.kingmd-linked-number.json', { force: true }) } catch (e) {}
            setTimeout(() => { deletingSession = false; startXeonBotInc().catch(err => console.error('[KING MD restart after delete]', err)) }, 1000)
            return send(200, { success: true, deleted: true })
        } catch (error) {
            console.error('[KING MD session delete]', error?.message || error)
            return send(500, { success: false, error: 'Could not remove the WhatsApp session.' })
        }
    }

    return send(404, { success: false, error: 'Not found' })
})

const API_PORT = Number(process.env.PORT || process.env.PAIR_API_PORT || 8000)
pairingApi.listen(API_PORT, '0.0.0.0', () => {
    console.log(`KING MD V4 WhatsApp engine API listening on port ${API_PORT}`)
})

// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})