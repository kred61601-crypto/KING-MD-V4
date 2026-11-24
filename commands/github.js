const moment = require('moment-timezone');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
async function githubCommand(sock, chatId, message) {
  try {
    const repoUrl = String(settings.updateZipUrl || 'https://github.com').match(/github\.com\/([^/]+\/[^/]+)/i);
    if (!repoUrl) throw new Error('Repository URL is not configured');
    const repo = repoUrl[1].replace(/\.git$/i, '').replace(/\/archive.*$/i, '');
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: { 'User-Agent': 'KING-MD-V4' }, timeout: 12000 });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const json = await res.json();
    const txt = `*乂 KING MD V4 REPOSITORY 乂*\n\n✩ *Name:* ${json.full_name}\n✩ *Watchers:* ${json.watchers_count}\n✩ *Size:* ${(json.size / 1024).toFixed(2)} MB\n✩ *Last Updated:* ${moment(json.updated_at).format('DD/MM/YY - HH:mm:ss')}\n✩ *URL:* ${json.html_url}\n✩ *Forks:* ${json.forks_count}\n✩ *Stars:* ${json.stargazers_count}`;
    const imgPath = path.join(__dirname, '../assets/bot_image.jpg');
    if (fs.existsSync(imgPath)) await sock.sendMessage(chatId, { image: fs.readFileSync(imgPath), caption: txt }, { quoted: message });
    else await sock.sendMessage(chatId, { text: txt }, { quoted: message });
  } catch (error) {
    await sock.sendMessage(chatId, { text: '❌ Could not fetch repository information. Check the repository URL in settings.js.' }, { quoted: message });
  }
}
module.exports = githubCommand;
