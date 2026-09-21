/**
 * Simple file-based JSON data store with in-memory cache.
 * No native dependencies -> works everywhere (Windows/Linux/Mac).
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const COLLECTIONS = ['users', 'courses', 'lessons', 'ebooks', 'ebookBatches', 'batches', 'categories', 'platforms', 'coupons', 'orders', 'admins', 'adminInvites'];

let cache = null;

function defaultHomePage() {
  return {
    hero: {
      enabled: true,
      badge: 'Smart Learning, Better Future',
      titleLine1: 'Your Learning',
      titleLine2: 'Journey',
      highlight: 'Starts Here',
      description: 'Explore our wide range of academic, admission<br> and skill development courses.',
      searchPlaceholder: 'Search for courses, subjects or topics...',
      ctaText: 'Explore Courses',
      ctaLink: '#secPopular',
      imageUrl: '',
      imageAlt: 'StudyMart Hero Image'
    },
    sections: {
      categories: {
        enabled: true,
        title: '',
        limit: 5,
        layout: '1row',
        showArrows: true,
        equalHeight: true,
        batchIds: [],
        items: [
          { id: 'hsc26', name: 'HSC 26', icon: 'fa-graduation-cap', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=hsc26', enabled: true },
          { id: 'hsc27', name: 'HSC 27', icon: 'fa-graduation-cap', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=hsc27', enabled: true },
          { id: 'hsc28', name: 'HSC 28', icon: 'fa-graduation-cap', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=hsc28', enabled: true },
          { id: 'ssc', name: 'SSC', icon: 'fa-book-open', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=ssc26', enabled: true },
          { id: 'skill', name: 'Skill Development', icon: 'fa-briefcase', color: '#6366F1', bg: '#EEF2FF', link: 'batch.html?batch=skill-development', enabled: true }
        ]
      },
      ebookCategory: { enabled: true, title: 'E-Book Category', subtitle: '', limit: 8, rows: 1 },
      popular: { enabled: true, title: 'Popular Courses', subtitle: '', limit: 8, rows: 2 },
      latest: { enabled: false, title: 'Latest Courses', subtitle: '', limit: 8, rows: 2 },
      ebooks: { enabled: true, title: 'Ebooks', subtitle: '', limit: 4, rows: 1 },
      popularEbooks: { enabled: true, title: 'Popular Ebooks', subtitle: '', limit: 4, rows: 1 },
      featured: { enabled: true, title: 'Featured Courses', subtitle: 'Hand-picked by the StudyMart team' },
      howToBuy: { enabled: true, title: 'How To Buy', subtitle: 'Course kinar sohoj niyom', description: '1. Pochonder course select kore <b>Buy Now</b> chap dao<br>2. bKash / Nagad / Rocket diye payment complete koro<br>3. Admin confirm korlei course tomar <b>Dashboard</b> e peye jabe', videoUrl: '', btnText: 'Browse Courses', btnLink: 'courses.html' },
      stats: { enabled: true, title: 'StudyMart at a Glance' },
      batchesSection: { enabled: false, title: 'Our Batches' },
      browseCategory: { enabled: false, title: 'Browse by Category' }
    }
  };
}

function defaultEmailTemplates() {
  return {
    welcome: {
      name: 'Welcome (new student)',
      enabled: true,
      subject: 'Welcome to {{siteName}}, {{name}}!',
      body: 'Hi {{name}},\nYour account has been created successfully.\nLog in to view your courses from the Dashboard.\n\n- {{siteName}} Team'
    },
    order_pending: {
      name: 'Order received (pending)',
      enabled: true,
      subject: 'Order {{orderNo}} received - {{siteName}}',
      body: 'Hi {{name}},\nWe have received your order {{orderNo}} ({{total}}).\nItems: {{items}}\nOnce your payment is confirmed, your courses will appear on the Dashboard.\n\n- {{siteName}} Team'
    },
    order_confirmed: {
      name: 'Order confirmed',
      enabled: true,
      subject: 'Order {{orderNo}} confirmed!',
      body: 'Hi {{name}},\nGreat news! Your order {{orderNo}} has been confirmed.\nItems: {{items}}\nStart learning right now from your Dashboard.\n\n- {{siteName}} Team'
    },
    order_completed: {
      name: 'Order completed',
      enabled: true,
      subject: 'Order {{orderNo}} completed - enjoy!',
      body: 'Hi {{name}},\nYour order {{orderNo}} is now complete.\nItems: {{items}}\nHappy learning!\n\n- {{siteName}} Team'
    },
    order_cancelled: {
      name: 'Order cancelled',
      enabled: false,
      subject: 'Order {{orderNo}} cancelled',
      body: 'Hi {{name}},\nYour order {{orderNo}} has been cancelled.\nPlease contact support if you think this is a mistake.\n\n- {{siteName}} Team'
    },
    new_order_admin: {
      name: 'Admin alert (new order)',
      enabled: true,
      subject: 'New order {{orderNo}} - {{total}} ({{siteName}})',
      body: 'A new order has arrived!\n\nOrder No: {{orderNo}}\nCustomer: {{name}} ({{phone}}, {{email}})\nItems: {{items}}\nTotal: {{total}}\nPayment: {{payment}}\nStatus: {{status}}\n\nPlease confirm it from Admin Panel > Orders.\n\n- {{siteName}}'
    }
  };
}

/* Legacy Banglish template bodies — untouched custom templates are never
 * overwritten; only stored templates identical to these old defaults are
 * upgraded to the English versions above. */
function legacyEmailTemplateBodies() {
  return {
    welcome: 'Hi {{name}},\nYour account has been created successfully.\nLogin kore tomar courses Dashboard theke dekhte parbe.\n\n- {{siteName}} Team',
    order_pending: 'Hi {{name}},\nTomar order {{orderNo}} peyechi ({{total}}).\nItems: {{items}}\nPayment confirm holei Dashboard-e course peye jabe.\n\n- {{siteName}} Team',
    order_confirmed: 'Hi {{name}},\nGreat news! Tomar order {{orderNo}} confirm hoyeche.\nItems: {{items}}\nDashboard theke ekhoni shuru koro.\n\n- {{siteName}} Team',
    order_completed: 'Hi {{name}},\nTomar order {{orderNo}} complete.\nItems: {{items}}\nHappy learning!\n\n- {{siteName}} Team',
    order_cancelled: 'Hi {{name}},\nTomar order {{orderNo}} cancel kora hoyeche.\nSupport-e contact koro jodi vul hoye thake.\n\n- {{siteName}} Team',
    new_order_admin: 'New order eseche!\n\nOrder No: {{orderNo}}\nCustomer: {{name}} ({{phone}}, {{email}})\nItems: {{items}}\nTotal: {{total}}\nPayment: {{payment}}\nStatus: {{status}}\n\nAdmin panel > Orders theke confirm koro.\n\n- {{siteName}}'
  };
}

function defaultEmailSettings() {
  return {
    emailEnabled: false,
    emailProvider: 'smtp',
    senderName: 'StudyMart',
    senderEmail: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    sendgridApiKey: '',
    brevoApiKey: '',
    adminNotifyEnabled: false,
    adminNotifyEmail: '',
    maintenanceEnabled: false,
    maintenanceTitle: 'Maintenance cholche 🔧',
    maintenanceMessage: 'Amra site update korchi. Kichukkhon por abar aso.',
    maintenanceEta: ''
  };
}

function emptyDB() {
  const db = { settings: Object.assign({}, defaultEmailSettings()), homePage: defaultHomePage(), emailTemplates: defaultEmailTemplates() };
  db.admins = [{ id: 1, username: 'admin', password: 'admin123', name: 'Super Admin', role: 'superadmin' }];
  COLLECTIONS.forEach(c => { if (c !== 'admins') db[c] = []; });
  return db;
}

function normalize(db) {
  const base = emptyDB();
  const out = Object.assign({}, base, db || {});
  COLLECTIONS.forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
  if (!out.settings || typeof out.settings !== 'object') out.settings = base.settings;
  out.settings = Object.assign({}, defaultEmailSettings(), out.settings);
  if (!out.emailTemplates || typeof out.emailTemplates !== 'object') out.emailTemplates = defaultEmailTemplates();
  const legacyBodies = legacyEmailTemplateBodies();
  Object.keys(defaultEmailTemplates()).forEach(k => {
    out.emailTemplates[k] = Object.assign({}, defaultEmailTemplates()[k], out.emailTemplates[k] || {});
    // Upgrade stored templates that still match the old Banglish defaults (custom edits untouched)
    if (legacyBodies[k] && out.emailTemplates[k].body === legacyBodies[k]) {
      out.emailTemplates[k].body = defaultEmailTemplates()[k].body;
    }
    if (k === 'new_order_admin' && out.emailTemplates[k].name === 'Admin alert (new order asle)') {
      out.emailTemplates[k].name = defaultEmailTemplates()[k].name;
    }
  });
  if (!out.homePage || typeof out.homePage !== 'object') out.homePage = base.homePage;
  // deep merge homePage defaults
  out.homePage.hero = Object.assign({}, base.homePage.hero, out.homePage.hero || {});
  out.homePage.sections = Object.assign({}, base.homePage.sections, out.homePage.sections || {});
  Object.keys(base.homePage.sections).forEach(k => {
    out.homePage.sections[k] = Object.assign({}, base.homePage.sections[k], (out.homePage.sections[k] || {}));
  });
  // ensure categories batchIds is array
  if (!Array.isArray(out.homePage.sections.categories.batchIds)) out.homePage.sections.categories.batchIds = [];
  if (!Array.isArray(out.homePage.sections.categories.items)) out.homePage.sections.categories.items = base.homePage.sections.categories.items.slice();
  return out;
}

function load() {
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')));
  } catch (err) {
    console.error('[store] DB read failed, starting with empty DB:', err.message);
    cache = emptyDB();
  }
  return cache;
}

function save() {
  const db = load();
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[store] DB write failed:', err.message);
  }
  return db;
}

/* ---------- One-time media migration (super-fast loading) ----------
 * Admin panel base64 data-URL hisebe save kore (thumbnail/cover/logo) —
 * egula protita API response-e MB er por MB jeto. Ekhane ekbar file-e
 * namiye /uploads/media/ URL bosiye dei, tarpor db.json + sob API choto
 * thake + browser image alada kore cache korte pare. */
const MEDIA_MIME_EXT = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
  'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg'
};
/* ---------- Save one data-URL image as file (admin write path) ----------
 * Admin panel thumbnail/cover/logo base64 pathale songe songe file baniye
 * URL return kore — db.json kokhono vari hoy na. Normal URL untouched. */
function storeImage(dataUrl, prefix) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!m) return dataUrl;
  const ext = MEDIA_MIME_EXT[String(m[1]).toLowerCase()] || '.png';
  let buf = null;
  try { buf = Buffer.from(m[3], 'base64'); } catch (e) { return dataUrl; }
  if (!buf || buf.length < 100 || buf.length > 8 * 1024 * 1024) return dataUrl;
  try {
    const crypto = require('crypto');
    const dir = path.join(__dirname, '..', 'uploads', 'media');
    fs.mkdirSync(dir, { recursive: true });
    const name = prefix + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    return '/uploads/media/' + name;
  } catch (e) { return dataUrl; }
}
let mediaMigrated = false;
function migrateMedia() {
  if (mediaMigrated) return false;
  mediaMigrated = true;
  let changed = 0;
  const saveDataUrl = (dataUrl, prefix) => {
    const m = String(dataUrl || '').match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!m) return null;
    const ext = MEDIA_MIME_EXT[String(m[1]).toLowerCase()] || '.png';
    let buf = null;
    try { buf = Buffer.from(m[3], 'base64'); } catch (e) { return null; }
    if (!buf || buf.length < 100 || buf.length > 8 * 1024 * 1024) return null;
    try {
      const crypto = require('crypto');
      const dir = path.join(__dirname, '..', 'uploads', 'media');
      fs.mkdirSync(dir, { recursive: true });
      const name = prefix + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
      fs.writeFileSync(path.join(dir, name), buf);
      changed++;
      return '/uploads/media/' + name;
    } catch (e) { return null; }
  };
  const fixField = (obj, key, prefix) => {
    if (obj && typeof obj[key] === 'string' && obj[key].startsWith('data:')) {
      const url = saveDataUrl(obj[key], prefix);
      if (url) obj[key] = url;
    }
  };
  try {
    const db = load();
    if (db.settings) fixField(db.settings, 'logoUrl', 'logo');
    if (db.homePage && db.homePage.hero) fixField(db.homePage.hero, 'imageUrl', 'hero');
    (db.courses || []).forEach((c, i) => fixField(c, 'thumbnail', 'course-' + (c.id || i)));
    (db.ebooks || []).forEach((e, i) => fixField(e, 'cover', 'ebook-' + (e.id || i)));
    (db.batches || []).forEach((b, i) => fixField(b, 'iconUrl', 'batch-' + (b.id || i)));
    (db.ebookBatches || []).forEach((b, i) => fixField(b, 'iconUrl', 'ebbatch-' + (b.id || i)));
    if (changed) {
      save();
      console.log('[store] Media migrated to files: ' + changed + ' image(s), db.json is light now');
    }
  } catch (e) { console.error('[store] Media migration failed:', e.message); }
  return changed > 0;
}

function all(collection) {
  return load()[collection] || [];
}

function find(collection, id) {
  return all(collection).find(item => String(item.id) === String(id)) || null;
}

function findBy(collection, key, value) {
  return all(collection).find(item => String(item[key]).toLowerCase() === String(value).toLowerCase()) || null;
}

function nextId(collection) {
  const list = all(collection);
  return list.length ? Math.max(...list.map(i => Number(i.id) || 0)) + 1 : 1;
}

function insert(collection, data) {
  const db = load();
  const item = Object.assign({ id: nextId(collection), createdAt: new Date().toISOString() }, data);
  db[collection].push(item);
  save();
  return item;
}

function update(collection, id, data) {
  const item = find(collection, id);
  if (!item) return null;
  Object.keys(data).forEach(k => {
    if (k === 'id' || k === 'createdAt') return;
    item[k] = data[k];
  });
  item.updatedAt = new Date().toISOString();
  save();
  return item;
}

function remove(collection, id) {
  const db = load();
  const idx = db[collection].findIndex(i => String(i.id) === String(id));
  if (idx === -1) return null;
  const [removed] = db[collection].splice(idx, 1);
  save();
  return removed;
}

function paginate(list, query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(0, parseInt(query.limit, 10) || 0)) || list.length || 1;
  const start = (page - 1) * limit;
  return {
    items: list.slice(start, start + limit),
    page,
    limit,
    total: list.length,
    totalPages: Math.max(1, Math.ceil(list.length / limit))
  };
}

module.exports = {
  DB_PATH, COLLECTIONS,
  load, save, all, find, findBy, nextId, insert, update, remove, paginate,
  defaultHomePage, defaultEmailTemplates, defaultEmailSettings, migrateMedia, storeImage
};
