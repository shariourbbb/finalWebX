/**
 * Telegram helper - Web uses the SAME Bot token, Bot code is untouched.
 * Creates single-use (member_limit=1) invite links, just like the Bot does.
 * No new dependency - uses native https.
 */
const https = require('https');
const store = require('./store');

function getBotToken() {
  // 1. cPanel env / process env (recommended)
  if (process.env.BOT_TOKEN && String(process.env.BOT_TOKEN).trim()) {
    return String(process.env.BOT_TOKEN).trim();
  }
  // 2. Admin settings -> botToken (set from Admin panel > Settings)
  try {
    const s = (store.load().settings || {}).botToken;
    if (s && String(s).trim()) return String(s).trim();
  } catch (e) { /* ignore */ }
  return '';
}

function tgApi(token, method, payload) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(payload || {});
      const req = https.request({
        hostname: 'api.telegram.org',
        path: '/bot' + token + '/' + method,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 12000
      }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(raw);
            if (j && j.ok) return resolve({ ok: true, data: j.result });
            return resolve({ ok: false, error: (j && j.description) || ('HTTP ' + res.statusCode) });
          } catch (e) {
            return resolve({ ok: false, error: 'Bad telegram response' });
          }
        });
      });
      req.on('timeout', () => { try { req.destroy(); } catch (e) {} resolve({ ok: false, error: 'Telegram timeout' }); });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

/**
 * Create ONE single-use invite link for a private group/channel.
 * Bot must be admin with "Invite Users" permission, else ok:false.
 */
async function createInviteLink(chatId, name) {
  const token = getBotToken();
  if (!token) return { ok: false, error: 'BOT_TOKEN set kora nai (cPanel env / Settings > Bot Token)' };
  if (!chatId) return { ok: false, error: 'Chat ID khali' };
  const safeName = String(name || 'StudyMart Order').slice(0, 32);
  // member_limit=1 => join korlei link expired (Bot-er moto same)
  return tgApi(token, 'createChatInviteLink', {
    chat_id: String(chatId).trim(),
    member_limit: 1,
    name: safeName
  });
}

/**
 * Course-er sob chatId-er jonno invite banay.
 * chatIds: [{label, chatId}] | ['-100xxx'] | mixed
 * Returns: [{label, chatId, inviteLink, error}]
 */
async function createMultiInvites(chatIds, orderNo) {
  const list = Array.isArray(chatIds) ? chatIds : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    const label = (raw && typeof raw === 'object' ? (raw.label || '') : '') || ('Group ' + (i + 1));
    const chatId = (raw && typeof raw === 'object' ? (raw.chatId || raw.id || '') : raw);
    if (!chatId || !String(chatId).trim()) continue;
    const r = await createInviteLink(String(chatId).trim(), 'Order ' + (orderNo || ''));
    out.push({
      label: String(label),
      chatId: String(chatId).trim(),
      inviteLink: r.ok && r.data ? (r.data.invite_link || '') : '',
      error: r.ok ? '' : (r.error || 'Failed')
    });
  }
  return out;
}

module.exports = { getBotToken, createInviteLink, createMultiInvites };
