/**
 * Visitor Tracking & Analytics Module
 * Tracks daily unique visitors and views partitioned by PC vs Phone.
 * Persists data to data/visitors.json without triggering server restarts.
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'visitors.json');

// In-memory analytics store
let store = {
  dates: {}
};

// Load existing data from file
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    store = JSON.parse(raw);
    if (!store.dates) store.dates = {};
  }
} catch (e) {
  console.error('[tracker] Failed to load visitors.json:', e.message);
  store = { dates: {} };
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // Clean up records older than 60 days to keep file light
      const keys = Object.keys(store.dates).sort();
      if (keys.length > 60) {
        const toDelete = keys.slice(0, keys.length - 60);
        toDelete.forEach(k => delete store.dates[k]);
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
      console.error('[tracker] Failed to save visitors.json:', err.message);
    }
  }, 1000);
}

function getTodayKey() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date()); // Returns YYYY-MM-DD
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

function detectDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  const isMobile = /mobile|iphone|ipod|android|blackberry|opera mini|opera mobi|windows phone|iemobile|wpdesktop/i.test(ua);
  return isMobile ? 'phone' : 'pc';
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function trackRequest(req) {
  try {
    const url = req.originalUrl || req.url || '';
    
    // Ignore static assets, health checks, and admin API
    if (url.startsWith('/assets/') ||
        url.startsWith('/img/') ||
        url.startsWith('/uploads/') ||
        url === '/favicon.ico' ||
        url === '/api/health' ||
        url.startsWith('/api/admin') ||
        url.startsWith('/admin.html') ||
        /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|pdf)$/i.test(url)) {
      return;
    }

    const today = getTodayKey();
    if (!store.dates[today]) {
      store.dates[today] = {
        total: 0,
        pc: 0,
        phone: 0,
        views: 0,
        pcViews: 0,
        phoneViews: 0,
        ips: []
      };
    }

    const dayData = store.dates[today];
    const device = detectDevice(req.headers['user-agent']);
    const ip = getClientIp(req);
    const visitorKey = `${ip}_${device}`;

    // Update views
    dayData.views = (dayData.views || 0) + 1;
    if (device === 'phone') {
      dayData.phoneViews = (dayData.phoneViews || 0) + 1;
    } else {
      dayData.pcViews = (dayData.pcViews || 0) + 1;
    }

    // Check unique visitor for today
    if (!Array.isArray(dayData.ips)) dayData.ips = [];
    if (!dayData.ips.includes(visitorKey)) {
      dayData.ips.push(visitorKey);
      dayData.total = (dayData.total || 0) + 1;
      if (device === 'phone') {
        dayData.phone = (dayData.phone || 0) + 1;
      } else {
        dayData.pc = (dayData.pc || 0) + 1;
      }
    }

    scheduleSave();
  } catch (err) {
    // Non-blocking, tracking should never break the request
    console.error('[tracker] Tracking error:', err.message);
  }
}

function getTodayStats() {
  const today = getTodayKey();
  const d = store.dates[today] || { total: 0, pc: 0, phone: 0, views: 0, pcViews: 0, phoneViews: 0 };
  const total = d.total || 0;
  const pc = d.pc || 0;
  const phone = d.phone || 0;
  const pcPct = total > 0 ? Math.round((pc / total) * 100) : 0;
  const phonePct = total > 0 ? (100 - pcPct) : 0;

  return {
    date: today,
    total,
    pc,
    phone,
    pcPercent: pcPct,
    phonePercent: phonePct,
    views: d.views || 0,
    pcViews: d.pcViews || 0,
    phoneViews: d.phoneViews || 0
  };
}

function getHistory(days = 7) {
  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    let key = '';
    try {
      key = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch (e) {
      key = d.toISOString().slice(0, 10);
    }
    const dayData = store.dates[key] || { total: 0, pc: 0, phone: 0, views: 0 };
    list.push({
      date: key,
      total: dayData.total || 0,
      pc: dayData.pc || 0,
      phone: dayData.phone || 0,
      views: dayData.views || 0
    });
  }
  return list;
}

module.exports = {
  trackRequest,
  getTodayStats,
  getHistory,
  detectDevice
};
