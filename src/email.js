/**
 * StudyMart - Email notifications (Gmail SMTP / SendGrid API / Brevo API).
 * No crash if not configured: sendMail resolves { ok:false, skipped:true }.
 * Settings keys (store.settings):
 *   emailEnabled, emailProvider ('smtp'|'sendgrid'|'brevo'),
 *   senderName, senderEmail,
 *   smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass,
 *   sendgridApiKey, brevoApiKey
 *
 * Brevo (ex-Sendinblue): free 300 mail/day, kono credit card lage na.
 * https://app.brevo.com -> SMTP & API -> API Keys -> xkeysib-... key banay
 * Settings > Email > Provider = Brevo API te bosan. Sender Email-ta Brevo-te
 * verify kora (Senders & IP) address hote hobe, nahole mail jabe na.
 */
const store = require('./store');

function settings() {
  try { return store.load().settings || {}; } catch (e) { return {}; }
}

function isRealEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
    && !v.includes('@mobile.studymart');
}

function renderTemplate(str, vars) {
  let out = String(str == null ? '' : str);
  const v = vars || {};
  Object.keys(v).forEach(k => {
    const re = new RegExp('\\{\\{\\s*' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'g');
    out = out.replace(re, String(v[k] == null ? '' : v[k]));
  });
  // common defaults
  const s = settings();
  out = out.replace(/\{\{\s*siteName\s*\}\}/g, s.siteName || 'StudyMart');
  return out;
}

function orderVars(order, extra) {
  const s = settings();
  const items = Array.isArray(order.items) ? order.items.map(i => i.title).join(', ') : '';
  return Object.assign({
    name: (order.customer && order.customer.name) || '',
    email: (order.customer && order.customer.email) || '',
    phone: (order.customer && order.customer.phone) || '',
    orderNo: order.orderNo || order.id || '',
    total: (s.currency || '৳') + Number(order.total || 0).toLocaleString('en-IN'),
    items,
    payment: order.paymentMethod || '',
    status: order.status || '',
    siteName: s.siteName || 'StudyMart'
  }, extra || {});
}

/* ---------- transport ---------- */
let cachedTransporter = null;
let cachedKey = '';

function getSmtpTransporter(s) {
  const nodemailer = require('nodemailer');
  const key = [s.smtpHost, s.smtpPort, s.smtpUser, s.smtpPass].join('|');
  if (cachedTransporter && cachedKey === key) return cachedTransporter;
  const port = Number(s.smtpPort) || 587;
  const secure = (s.smtpSecure === true || s.smtpSecure === 'true' || s.smtpSecure === 1 || s.smtpSecure === '1')
    || port === 465;
  cachedTransporter = nodemailer.createTransport({
    host: s.smtpHost,
    port,
    secure,
    auth: (s.smtpUser && s.smtpPass) ? { user: s.smtpUser, pass: s.smtpPass } : undefined,
    tls: { rejectUnauthorized: false }
  });
  cachedKey = key;
  return cachedTransporter;
}

async function sendViaSmtp(s, to, subject, html, text) {
  const transporter = getSmtpTransporter(s);
  const from = (s.senderName || s.siteName || 'StudyMart') + ' <' + (s.senderEmail || s.smtpUser) + '>';
  await transporter.sendMail({ from, to, subject, text: text || String(html || '').replace(/<[^>]+>/g, ' '), html });
}

async function sendViaSendgrid(s, to, subject, html, text) {
  const key = String(s.sendgridApiKey || '').trim();
  if (!key) throw new Error('SendGrid API key set kora nai');
  const fromEmail = s.senderEmail || 'no-reply@studymart.com';
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: s.senderName || s.siteName || 'StudyMart' },
      subject,
      content: [
        { type: 'text/plain', value: text || String(html || '').replace(/<[^>]+>/g, ' ') },
        { type: 'text/html', value: html }
      ]
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('SendGrid error (' + res.status + '): ' + t.slice(0, 200));
  }
}

async function sendViaBrevo(s, to, subject, html, text) {
  const key = String(s.brevoApiKey || '').trim();
  if (!key) throw new Error('Brevo API key set kora nai (Settings > Email > Brevo API Key)');
  const fromEmail = String(s.senderEmail || '').trim();
  if (!fromEmail) throw new Error('Sender Email din — Brevo-te verify kora address hote hobe');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: fromEmail, name: s.senderName || s.siteName || 'StudyMart' },
      to: [{ email: to }],
      subject,
      textContent: text || String(html || '').replace(/<[^>]+>/g, ' '),
      htmlContent: html
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Brevo error (' + res.status + '): ' + t.slice(0, 200));
  }
}

async function sendMail(opts) {
  const s = settings();
  const to = String((opts && opts.to) || '').trim();
  const subject = String((opts && opts.subject) || '').trim();
  const html = String((opts && (opts.html || opts.body)) || '');
  const text = opts && opts.text ? String(opts.text) : undefined;
  if (!s.emailEnabled) return { ok: false, skipped: true, reason: 'Email notifications off (Settings > Email)' };
  if (!isRealEmail(to)) return { ok: false, skipped: true, reason: 'No valid email address' };
  if (!subject || !html) return { ok: false, skipped: true, reason: 'Subject/body missing' };
  try {
    const provider = (s.emailProvider || 'smtp');
    if (provider === 'sendgrid') {
      await sendViaSendgrid(s, to, subject, html, text);
    } else if (provider === 'brevo') {
      await sendViaBrevo(s, to, subject, html, text);
    } else {
      if (!s.smtpHost || !s.smtpUser || !s.smtpPass) {
        return { ok: false, skipped: true, reason: 'SMTP host/user/pass set kora nai (Settings > Email). Gmail hole App Password use korun.' };
      }
      await sendViaSmtp(s, to, subject, html, text);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------- templates stored in db.emailTemplates ---------- */
function getTemplate(key) {
  try {
    const db = store.load();
    const t = (db.emailTemplates || {})[key];
    return t || null;
  } catch (e) { return null; }
}

async function sendTemplateMail(key, to, vars) {
  const t = getTemplate(key);
  if (!t || t.enabled === false) return { ok: false, skipped: true, reason: 'Template disabled: ' + key };
  const subject = renderTemplate(t.subject, vars);
  const body = renderTemplate(t.body, vars);
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F2043">'
    + '<div style="background:linear-gradient(90deg,#1A56FF,#7C3AED);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">'
    + '<div style="font-size:18px;font-weight:800">' + escapeHtml(settings().siteName || 'StudyMart') + '</div></div>'
    + '<div style="border:1px solid #E2E8F0;border-top:0;padding:22px;border-radius:0 0 12px 12px">'
    + body.split('\n').map(line => '<p style="font-size:14px;line-height:1.7;margin:0 0 10px">' + line + '</p>').join('')
    + '</div></div>';
  return sendMail({ to, subject, html });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* fire-and-forget wrapper: never throws, never blocks requests */
function sendLater(promise) {
  try {
    Promise.resolve(promise).catch(e => console.error('[email]', e.message));
  } catch (e) { console.error('[email]', e.message); }
}

function notifyWelcome(user) {
  if (!user) return;
  const to = user.email || '';
  if (!isRealEmail(to)) return;
  sendLater(sendTemplateMail('welcome', to, { name: user.name || '', email: to }));
}

function notifyOrder(order, kind) {
  if (!order) return;
  const to = (order.customer && order.customer.email) || '';
  if (!isRealEmail(to)) return;
  const map = { pending: 'order_pending', confirmed: 'order_confirmed', completed: 'order_completed', cancelled: 'order_cancelled' };
  const key = map[kind] || ('order_' + kind);
  sendLater(sendTemplateMail(key, to, orderVars(order)));
}

/* Notun order aslei admin-ke alert mail (Notice page > Admin Email Alert).
 * Fire-and-forget: mail fail/off holeo order atkabe na. */
function notifyAdminNewOrder(order) {
  if (!order) return;
  const s = settings();
  if (!s.adminNotifyEnabled) return;
  const targets = String(s.adminNotifyEmail || '').split(/[\n,;]+/)
    .map(x => x.trim()).filter(x => isRealEmail(x));
  if (!targets.length) return;
  const vars = orderVars(order);
  targets.forEach(to => sendLater(sendTemplateMail('new_order_admin', to, vars)));
}

module.exports = {
  sendMail, sendTemplateMail, renderTemplate, orderVars,
  notifyWelcome, notifyOrder, notifyAdminNewOrder, isRealEmail, sendLater
};
