/**
 * Simple file-based JSON data store with in-memory cache.
 * No native dependencies -> works everywhere (Windows/Linux/Mac).
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const COLLECTIONS = ['users', 'courses', 'lessons', 'ebooks', 'ebookBatches', 'batches', 'categories', 'platforms', 'coupons', 'orders', 'admins'];

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
      featured: { enabled: true, title: 'Featured Courses', subtitle: 'Hand-picked by the StudyMart team' },
      howToBuy: { enabled: true, title: 'How To Buy', subtitle: 'Course kinar sohoj niyom', description: '1. Pochonder course select kore <b>Buy Now</b> chap dao<br>2. bKash / Nagad / Rocket diye payment complete koro<br>3. Admin confirm korlei course tomar <b>Dashboard</b> e peye jabe', videoUrl: '', btnText: 'Browse Courses', btnLink: 'courses.html' },
      stats: { enabled: true, title: 'StudyMart at a Glance' },
      batchesSection: { enabled: false, title: 'Our Batches' },
      browseCategory: { enabled: false, title: 'Browse by Category' }
    }
  };
}

function emptyDB() {
  const db = { settings: {}, homePage: defaultHomePage() };
  db.admins = [{ id: 1, username: 'admin', password: 'admin123', name: 'Super Admin', role: 'superadmin' }];
  COLLECTIONS.forEach(c => { if (c !== 'admins') db[c] = []; });
  return db;
}

function normalize(db) {
  const base = emptyDB();
  const out = Object.assign({}, base, db || {});
  COLLECTIONS.forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
  if (!out.settings || typeof out.settings !== 'object') out.settings = base.settings;
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
  defaultHomePage
};
