/**
 * Admin API - everything the Admin Panel controls.
 * Every route here requires an admin session (Bearer token).
 */
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const tracker = require('../tracker');

const router = express.Router();
router.use(auth.requireAdmin);

const FIELDS = {
  batches: ['name', 'slug', 'icon', 'iconUrl', 'color', 'status', 'order'],
  ebookBatches: ['name', 'slug', 'icon', 'iconUrl', 'color', 'status', 'order'],
  categories: ['name', 'slug', 'icon', 'color', 'status'],
  platforms: ['name', 'status'],
  courses: ['title', 'slug', 'batchId', 'categoryId', 'platformId', 'teacher', 'price', 'oldPrice',
    'duration', 'totalClass', 'thumbnail', 'description', 'featured', 'status',
    'telegramLink', 'telegramLinks', 'telegramChatIds', 'previewVideoId', 'features', 'tags', 'bannerColor'],
  lessons: ['courseId', 'section', 'title', 'videoId', 'duration', 'isFree', 'order', 'status'],
  coupons: ['code', 'type', 'value', 'minOrder', 'maxDiscount', 'usageLimit', 'used', 'expiresAt', 'status', 'courseIds'],
  ebooks: ['title', 'slug', 'cover', 'details', 'author', 'price', 'oldPrice', 'fileUrl', 'fileName', 'fileSize', 'linkUrl', 'downloads', 'status', 'batchId', 'categoryId', 'ebookBatchId']
};

const NUMBER_FIELDS = ['price', 'oldPrice', 'totalClass', 'value', 'minOrder', 'maxDiscount',
  'usageLimit', 'used', 'batchId', 'categoryId', 'platformId', 'order', 'ebookBatchId'];
const BOOL_FIELDS = ['featured'];

function pick(entity, body) {
  const out = {};
  (FIELDS[entity] || []).forEach(key => {
    if (body[key] === undefined) return;
    let value = body[key];
    if (NUMBER_FIELDS.includes(key)) value = Number(value) || 0;
    if (BOOL_FIELDS.includes(key)) value = (value === true || value === 'true' || value === 1);
    out[key] = value;
  });
  return out;
}

function slugify(text) {
  return String(text || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

/* ---------- Multi Telegram normalize (error-proof) ----------
 * telegramLinks: [{label, url}] — static channel links (oneke add kora jabe)
 * telegramChatIds: [{label, chatId}] — private group/channel ID (auto invite-er jonno)
 * Purono single telegramLink thakleo cholbe (backward compat). */
function normalizeTelegramLinks(legacyLink, links) {
  const out = [];
  const push = (label, url) => {
    url = String(url || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !/^t\.me\//i.test(url)) return; // vul link bad
    if (/^t\.me\//i.test(url)) url = 'https://' + url;
    if (out.some(x => x.url.toLowerCase() === url.toLowerCase())) return; // duplicate bad
    out.push({ label: String(label || ('Channel ' + (out.length + 1))), url });
  };
  if (Array.isArray(links)) {
    links.forEach((x, i) => {
      if (typeof x === 'string') push('Channel ' + (i + 1), x);
      else if (x && typeof x === 'object') push(x.label || ('Channel ' + (i + 1)), x.url || x.link || '');
    });
  } else if (typeof links === 'string' && links.trim()) {
    // comma/newline separated string holeo vag kore ney (error khabe na)
    links.split(/[\n,]+/).forEach((u, i) => push('Channel ' + (i + 1), u));
  }
  if (legacyLink && String(legacyLink).trim()) push('Main Channel', legacyLink);
  return out.slice(0, 20); // max 20 ta
}

function normalizeTelegramChatIds(ids) {
  const out = [];
  const push = (label, chatId) => {
    chatId = String(chatId || '').trim().replace(/\s+/g, '');
    if (!chatId) return;
    if (!/^-?\d+$/.test(chatId)) return; // ID sudhu number/ -100xxx hoy
    if (out.some(x => x.chatId === chatId)) return; // duplicate bad
    out.push({ label: String(label || ('Group ' + (out.length + 1))), chatId });
  };
  if (Array.isArray(ids)) {
    ids.forEach((x, i) => {
      if (typeof x === 'string' || typeof x === 'number') push('Group ' + (i + 1), x);
      else if (x && typeof x === 'object') push(x.label || ('Group ' + (i + 1)), x.chatId || x.id || x.chat_id || '');
    });
  } else if (ids !== undefined && ids !== null && String(ids).trim() !== '') {
    String(ids).split(/[\n,]+/).forEach((c, i) => push('Group ' + (i + 1), c));
  }
  return out.slice(0, 20);
}

function pageResponse(res, paged, items) {
  res.json({
    success: true,
    count: paged.total,
    page: paged.page,
    limit: paged.limit,
    totalPages: paged.totalPages,
    data: items
  });
}

/* ---------- Dashboard ---------- */
router.get('/stats', (req, res) => {
  const courses = store.all('courses');
  const orders = store.all('orders');
  const users = store.all('users');
  const paid = ['confirmed', 'completed'];
  const sum = list => list.reduce((s, o) => s + Number(o.total || 0), 0);

  const byBatch = store.all('batches').map(b => ({
    batch: b.name,
    color: b.color,
    courses: courses.filter(c => String(c.batchId) === String(b.id)).length
  }));

  const byStatus = ['pending', 'confirmed', 'completed', 'cancelled'].map(status => ({
    status,
    count: orders.filter(o => o.status === status).length
  }));

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const dayOrders = orders.filter(o => String(o.createdAt || '').slice(0, 10) === key);
    last7Days.push({ date: key, orders: dayOrders.length, revenue: sum(dayOrders) });
  }

  const todayVisitors = tracker.getTodayStats();
  const visitorHistory = tracker.getHistory(7);

  res.json({
    success: true,
    data: {
      totals: {
        courses: courses.length,
        activeCourses: courses.filter(c => c.status === 'active').length,
        batches: store.all('batches').length,
        categories: store.all('categories').length,
        platforms: store.all('platforms').length,
        coupons: store.all('coupons').length,
        users: users.length,
        orders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        revenue: sum(orders.filter(o => paid.includes(o.status))),
        pendingRevenue: sum(orders.filter(o => o.status === 'pending'))
      },
      todayVisitors,
      visitorHistory,
      byBatch,
      byStatus,
      last7Days,
      recentOrders: orders.slice(-6).reverse(),
      recentUsers: users.slice(-5).reverse().map(auth.publicUser)
    }
  });
});

router.get('/visitors/today', (req, res) => {
  res.json({ success: true, data: tracker.getTodayStats() });
});

/* ---------- Batch serial: keep `order` unique (swap on collision) ----------
 * Courses-er batch + E-Book batch — duitar jonnoi same niyom. */
function resolveBatchOrder(id, newOrder, coll) {
  const target = coll || 'batches';
  const n = Number(newOrder);
  if (!n || n <= 0) return;
  const clash = store.all(target)
    .find(b => String(b.id) !== String(id) && Number(b.order) === n);
  if (!clash) return;
  if (id) {
    // editing: swap serials with the clashing batch
    const me = store.find(target, id);
    const oldOrder = me ? Number(me.order) || 0 : 0;
    if (oldOrder && oldOrder !== n) {
      store.update(target, clash.id, { order: oldOrder });
      return;
    }
  }
  // new batch (or no old serial): shift clashing + higher serials down by one
  store.all(target)
    .filter(b => Number(b.order) >= n)
    .sort((a, b) => Number(b.order) - Number(a.order))
    .forEach(b => store.update(target, b.id, { order: Number(b.order) + 1 }));
}

/* ---------- Coupon course targeting: [] / khali = sob course-e cholbe ---------- */
function normalizeCouponCourses(v) {
  const out = [];
  const push = (x) => {
    const s = String(x == null ? '' : x).trim();
    if (!s || out.includes(s)) return;
    out.push(s);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (v !== undefined && v !== null && String(v).trim() !== '') String(v).split(/[\n,]+/).forEach(push);
  return out.slice(0, 100);
}

/* ---------- Generic CRUD: batches / categories / platforms / courses / coupons ---------- */
Object.keys(FIELDS).forEach(entity => {
  router.get('/' + entity, (req, res) => {
    let list = store.all(entity).slice();
    const { q, status } = req.query;
    if (status) list = list.filter(i => i.status === status);
    if (q) {
      const term = String(q).toLowerCase();
      list = list.filter(i => JSON.stringify(i).toLowerCase().includes(term));
    }
    list.reverse();
    const paged = store.paginate(list, req.query);
    res.json({
      success: true,
      count: paged.total, page: paged.page, limit: paged.limit, totalPages: paged.totalPages,
      data: paged.items
    });
  });

  router.get('/' + entity + '/:id', (req, res) => {
    const item = store.find(entity, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  });

  router.post('/' + entity, (req, res) => {
    const data = pick(entity, req.body || {});
    if (entity === 'courses' && !data.title) {
      return res.status(400).json({ success: false, message: 'Course title is required' });
    }
    if (entity === 'coupons' && !data.code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }
    if (entity === 'ebooks' && !data.title) {
      return res.status(400).json({ success: false, message: 'E-Book Name is required' });
    }
    if (entity !== 'courses' && entity !== 'coupons' && entity !== 'ebooks' && !data.name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (data.slug === undefined && (data.name || data.title)) data.slug = slugify(data.name || data.title);
    if (data.status === undefined) data.status = 'active';
    if (entity === 'batches' || entity === 'ebookBatches') {
      if (data.order === undefined || data.order === 0) {
        const maxOrder = Math.max(0, ...store.all(entity).map(b => Number(b.order) || 0));
        data.order = maxOrder + 1;
      } else {
        resolveBatchOrder(null, data.order, entity);
      }
      if (data.icon === undefined) data.icon = 'fa-layer-group';
      if (data.iconUrl === undefined) data.iconUrl = '';
      if (data.color === undefined) data.color = '#6366F1';
    }
    if (entity === 'courses') {
      if (data.featured === undefined) data.featured = false;
      ['price', 'oldPrice', 'totalClass'].forEach(k => { if (data[k] === undefined) data[k] = 0; });
      // Multi Telegram: normalize arrays, keep legacy telegramLink (first link) for backward compat
      data.telegramLinks = normalizeTelegramLinks(data.telegramLink, data.telegramLinks);
      data.telegramChatIds = normalizeTelegramChatIds(data.telegramChatIds);
      if (!data.telegramLink && data.telegramLinks.length) data.telegramLink = data.telegramLinks[0].url;
    }
    if (entity === 'coupons') {
      if (data.usageLimit === undefined) data.usageLimit = 0;
      if (data.used === undefined) data.used = 0;
      if (data.type === undefined) data.type = 'percent';
      if (data.value === undefined) data.value = 0;
    }
    if (entity === 'coupons') {
      data.code = String(data.code).toUpperCase().trim();
      if (store.findBy('coupons', 'code', data.code)) {
        return res.status(409).json({ success: false, message: 'This coupon code already exists' });
      }
      data.courseIds = normalizeCouponCourses(data.courseIds);
    }
    const item = store.insert(entity, data);
    res.status(201).json({ success: true, message: 'Created successfully', data: item });
  });

  router.put('/' + entity + '/:id', (req, res) => {
    const data = pick(entity, req.body || {});
    if (entity === 'courses') {
      if (data.telegramLinks !== undefined || data.telegramLink !== undefined) {
        const prev = store.find('courses', req.params.id) || {};
        data.telegramLinks = normalizeTelegramLinks(
          data.telegramLink !== undefined ? data.telegramLink : prev.telegramLink,
          data.telegramLinks !== undefined ? data.telegramLinks : prev.telegramLinks
        );
        if (!data.telegramLink && data.telegramLinks.length) data.telegramLink = data.telegramLinks[0].url;
      }
      if (data.telegramChatIds !== undefined) {
        data.telegramChatIds = normalizeTelegramChatIds(data.telegramChatIds);
      }
    }
    if ((entity === 'batches' || entity === 'ebookBatches') && data.order !== undefined && Number(data.order) > 0) {
      resolveBatchOrder(req.params.id, data.order, entity);
    }
    if (entity === 'coupons' && data.code) {
      data.code = String(data.code).toUpperCase().trim();
      const existing = store.findBy('coupons', 'code', data.code);
      if (existing && String(existing.id) !== String(req.params.id)) {
        return res.status(409).json({ success: false, message: 'This coupon code already exists' });
      }
    }
    if (entity === 'coupons' && data.courseIds !== undefined) {
      data.courseIds = normalizeCouponCourses(data.courseIds);
    }
    const item = store.update(entity, req.params.id, data);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Updated successfully', data: item });
  });

  router.delete('/' + entity + '/:id', (req, res) => {
    const removed = store.remove(entity, req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Not found' });
    // cascade: deleting a course removes its classes too
    if (entity === 'courses') {
      store.all('lessons')
        .filter(l => String(l.courseId) === String(removed.id))
        .forEach(l => store.remove('lessons', l.id));
    }
    // cascade: deleting an e-book removes its uploaded PDF file too
    if (entity === 'ebooks' && removed.fileUrl && removed.fileUrl.startsWith('/uploads/')) {
      try {
        const fs = require('fs');
        const path = require('path');
        const fp = path.join(__dirname, '..', '..', removed.fileUrl);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (e) { /* ignore */ }
    }
    res.json({ success: true, message: 'Deleted successfully', data: removed });
  });
});

/* ---------- Lessons (course classes) ----------
 * Only the YouTube videoId is stored - never the raw URL.
 * The videoId is NEVER exposed in public APIs (see public.js watch endpoint). */
function extractYouTubeId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  // raw 11-char id
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return '';
}

function nextLessonOrder(courseId) {
  const list = store.all('lessons').filter(l => String(l.courseId) === String(courseId));
  return list.length ? Math.max(...list.map(l => Number(l.order) || 0)) + 1 : 1;
}

// List lessons of a course (admin sees videoId; public never does)
router.get('/courses/:courseId/lessons', (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const list = store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  res.json({ success: true, count: list.length, data: list });
});

// Add a lesson to a course
router.post('/courses/:courseId/lessons', (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const { section, title, youtubeUrl, videoId, duration, isFree, order, status } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, message: 'Lesson title is required' });
  }
  const vid = extractYouTubeId(videoId || youtubeUrl);
  if (!vid) {
    return res.status(400).json({ success: false, message: 'Valid YouTube link is required' });
  }
  const lesson = store.insert('lessons', {
    courseId: course.id,
    section: section ? String(section) : '',
    title: String(title).trim(),
    videoId: vid,
    duration: duration ? String(duration) : '',
    isFree: (isFree === true || isFree === 'true' || isFree === 1),
    order: order === undefined ? nextLessonOrder(course.id) : (Number(order) || 0),
    status: status || 'active'
  });
  res.status(201).json({ success: true, message: 'Class added', data: lesson });
});

// Update a lesson
router.put('/lessons/:id', (req, res) => {
  const lesson = store.find('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
  const data = pick('lessons', req.body || {});
  if (req.body && (req.body.youtubeUrl !== undefined || req.body.videoId !== undefined)) {
    const vid = extractYouTubeId(req.body.videoId !== undefined ? req.body.videoId : req.body.youtubeUrl);
    if (!vid) return res.status(400).json({ success: false, message: 'Valid YouTube link is required' });
    data.videoId = vid;
  }
  if (data.isFree !== undefined) data.isFree = (data.isFree === true || data.isFree === 'true' || data.isFree === 1);
  if (data.order !== undefined) data.order = Number(data.order) || 0;
  if (data.courseId !== undefined) data.courseId = Number(data.courseId) || data.courseId;
  const updated = store.update('lessons', req.params.id, data);
  res.json({ success: true, message: 'Class updated', data: updated });
});

// Delete a lesson
router.delete('/lessons/:id', (req, res) => {
  const removed = store.remove('lessons', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, message: 'Class deleted', data: removed });
});

/* ---------- Duplicate course (Copy-Paste with classes) ----------
 * POST /api/admin/courses/:id/duplicate
 * Body (all optional): { title, batchId, categoryId, platformId }
 * Akei course onno batch/category-te rakhte chaile alada kore class upload
 * korte hoy na — course + sob class copy hoye notun course hobe. */
router.post('/courses/:id/duplicate', (req, res) => {
  const src = store.find('courses', req.params.id);
  if (!src) return res.status(404).json({ success: false, message: 'Course not found' });
  const b = req.body || {};
  const copy = {};
  Object.keys(src).forEach(k => {
    if (k === 'id' || k === 'createdAt' || k === 'updatedAt') return;
    const v = src[k];
    copy[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  });
  copy.title = (b.title && String(b.title).trim()) || (src.title + ' (Copy)');
  if (b.batchId !== undefined && String(b.batchId) !== '') copy.batchId = Number(b.batchId) || b.batchId;
  if (b.categoryId !== undefined && String(b.categoryId) !== '') copy.categoryId = Number(b.categoryId) || b.categoryId;
  if (b.platformId !== undefined && String(b.platformId) !== '') copy.platformId = b.platformId;
  // slug unique rakho (nahole public URL clash korbe)
  let base = slugify(copy.title) || ('course-' + Date.now());
  let slug = base;
  let n = 2;
  while (store.all('courses').some(c => String(c.slug) === String(slug))) {
    slug = base + '-' + (n++);
  }
  copy.slug = slug;
  const created = store.insert('courses', copy);
  // sob class copy (videoId, section, order soho)
  const lessons = store.all('lessons')
    .filter(l => String(l.courseId) === String(src.id))
    .sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0));
  let copied = 0;
  lessons.forEach(l => {
    store.insert('lessons', {
      courseId: created.id,
      section: l.section || '',
      title: l.title || '',
      videoId: l.videoId || '',
      duration: l.duration || '',
      isFree: !!l.isFree,
      order: Number(l.order) || 0,
      status: l.status || 'active'
    });
    copied++;
  });
  res.status(201).json({
    success: true,
    message: 'Course duplicated with ' + copied + ' class(es)',
    data: created,
    copiedLessons: copied
  });
});

/* ---------- E-book PDF file upload (raw bytes, max 50MB) ---------- */
router.post('/ebooks/:id/file', (req, res) => {
  const ebook = store.find('ebooks', req.params.id);
  if (!ebook) return res.status(404).json({ success: false, message: 'E-book not found' });
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No PDF file received' });
  }
  // basic PDF magic-byte check
  if (req.body.slice(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ success: false, message: 'Only PDF files are allowed' });
  }
  try {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const dir = path.join(__dirname, '..', '..', 'uploads', 'ebooks');
    fs.mkdirSync(dir, { recursive: true });
    // unguessable name: file URL alone grants the download
    const filename = 'ebook-' + ebook.id + '-' + crypto.randomBytes(8).toString('hex') + '.pdf';
    // remove previous upload if any
    if (ebook.fileUrl && ebook.fileUrl.startsWith('/uploads/ebooks/')) {
      try {
        const old = path.join(__dirname, '..', '..', ebook.fileUrl);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      } catch (e) { /* ignore */ }
    }
    fs.writeFileSync(path.join(dir, filename), req.body);
    const fileUrl = '/uploads/ebooks/' + filename;
    store.update('ebooks', ebook.id, {
      fileUrl, fileSize: req.body.length,
      fileName: req.headers['x-file-name'] ? String(req.headers['x-file-name']).slice(0, 120) : (ebook.fileName || '')
    });
    res.json({ success: true, message: 'PDF uploaded', data: { fileUrl, fileSize: req.body.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save file' });
  }
});

/* ---------- Users management ---------- */
function getUserEnrolledCourses(userId) {
  const user = store.find('users', userId);
  if (!user) return [];
  const manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  const revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  const orders = store.all('orders').filter(o => String(o.userId) === String(userId) && ['confirmed', 'completed'].includes(o.status));
  const orderCourseIds = [];
  orders.forEach(o => {
    (o.items || []).forEach(i => {
      const cid = String(i.courseId || '');
      if (cid && !orderCourseIds.includes(cid)) orderCourseIds.push(cid);
    });
  });

  const allIds = Array.from(new Set([...manual, ...orderCourseIds])).filter(id => !revoked.includes(id));
  const courses = store.all('courses');
  const batches = store.all('batches');
  const categories = store.all('categories');

  return allIds.map(id => {
    const c = courses.find(x => String(x.id) === String(id));
    if (!c) return null;
    const b = batches.find(x => String(x.id) === String(c.batchId));
    const cat = categories.find(x => String(x.id) === String(c.categoryId));
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      thumbnail: c.thumbnail || '',
      price: c.price,
      batchId: c.batchId,
      batchName: b ? b.name : '',
      batchColor: b ? b.color : '',
      categoryName: cat ? cat.name : '',
      teacher: c.teacher || '',
      isManual: manual.includes(String(c.id)),
      isOrdered: orderCourseIds.includes(String(c.id))
    };
  }).filter(Boolean);
}

router.get('/users', (req, res) => {
  let list = store.all('users').slice();
  const { q, status } = req.query;
  if (status) list = list.filter(u => u.status === status);
  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter(u => (u.name + ' ' + u.email + ' ' + (u.phone || '')).toLowerCase().includes(term));
  }
  list.reverse();
  const paged = store.paginate(list, req.query);
  const orders = store.all('orders');
  const items = paged.items.map(u => {
    const userOrders = orders.filter(o => String(o.userId) === String(u.id));
    const enrolled = getUserEnrolledCourses(u.id);
    return Object.assign(auth.publicUser(u), {
      orderCount: userOrders.length,
      enrolledCount: enrolled.length,
      totalSpent: userOrders.filter(o => ['confirmed', 'completed'].includes(o.status))
        .reduce((s, o) => s + Number(o.total || 0), 0)
    });
  });
  res.json({
    success: true,
    count: paged.total, page: paged.page, limit: paged.limit, totalPages: paged.totalPages,
    data: items
  });
});

router.get('/users/:id', (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const orders = store.all('orders').filter(o => String(o.userId) === String(user.id));
  const enrolledCourses = getUserEnrolledCourses(user.id);
  res.json({ success: true, data: Object.assign(auth.publicUser(user), { orders, enrolledCourses }) });
});

// Grant course access to student
router.post('/users/:id/access', (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ success: false, message: 'Course ID is required' });
  const course = store.find('courses', courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

  const cId = String(course.id);
  let manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  let revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  revoked = revoked.filter(x => x !== cId);
  if (!manual.includes(cId)) manual.push(cId);

  store.update('users', user.id, { enrolledCourses: manual, revokedCourses: revoked });
  res.json({
    success: true,
    message: `Access to "${course.title}" granted successfully`,
    data: getUserEnrolledCourses(user.id)
  });
});

// Revoke course access from student
router.post('/users/:id/revoke', (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ success: false, message: 'Course ID is required' });

  const cId = String(courseId);
  let manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  let revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  manual = manual.filter(x => x !== cId);
  if (!revoked.includes(cId)) revoked.push(cId);

  store.update('users', user.id, { enrolledCourses: manual, revokedCourses: revoked });
  res.json({
    success: true,
    message: 'Course access removed successfully',
    data: getUserEnrolledCourses(user.id)
  });
});

router.delete('/users/:id/access/:courseId', (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const cId = String(req.params.courseId);

  let manual = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.map(String) : [];
  let revoked = Array.isArray(user.revokedCourses) ? user.revokedCourses.map(String) : [];

  manual = manual.filter(x => x !== cId);
  if (!revoked.includes(cId)) revoked.push(cId);

  store.update('users', user.id, { enrolledCourses: manual, revokedCourses: revoked });
  res.json({
    success: true,
    message: 'Course access removed successfully',
    data: getUserEnrolledCourses(user.id)
  });
});

// Ban or unban user
router.post('/users/:id/ban', (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  let newStatus = 'banned';
  if (req.body && req.body.status) {
    newStatus = req.body.status;
  } else {
    newStatus = (user.status === 'banned' || user.status === 'blocked') ? 'active' : 'banned';
  }

  const updated = store.update('users', user.id, { status: newStatus });
  res.json({
    success: true,
    message: newStatus === 'banned' ? `User "${user.name}" has been banned` : `User "${user.name}" has been unbanned and activated`,
    data: auth.publicUser(updated)
  });
});

router.post('/users', (req, res) => {
  const { name, email, phone, password, status, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required' });
  }
  if (store.findBy('users', 'email', email)) {
    return res.status(409).json({ success: false, message: 'This email already exists' });
  }
  const user = store.insert('users', {
    name: String(name),
    email: String(email).toLowerCase(),
    phone: phone || '',
    password: auth.hashPassword(password),
    role: role || 'student',
    status: status || 'active'
  });
  res.status(201).json({ success: true, message: 'User created', data: auth.publicUser(user) });
});

router.put('/users/:id', (req, res) => {
  const b = req.body || {};
  const data = {};
  ['name', 'email', 'phone', 'status', 'role'].forEach(k => { if (b[k] !== undefined) data[k] = b[k]; });
  if (b.password) data.password = auth.hashPassword(b.password);
  const user = store.update('users', req.params.id, data);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'User updated', data: auth.publicUser(user) });
});

router.delete('/users/:id', (req, res) => {
  const removed = store.remove('users', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'User deleted', data: auth.publicUser(removed) });
});

/* ---------- Orders management ---------- */
router.get('/orders', (req, res) => {
  let list = store.all('orders').slice();
  const { q, status } = req.query;
  if (status) list = list.filter(o => o.status === status);
  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter(o => (o.orderNo + ' ' + ((o.customer && o.customer.name) || '') + ' ' +
      ((o.customer && o.customer.email) || '') + ' ' + ((o.customer && o.customer.phone) || '') + ' ' +
      JSON.stringify(o.items)).toLowerCase().includes(term));
  }
  list.reverse();
  const paged = store.paginate(list, req.query);
  res.json({
    success: true,
    count: paged.total, page: paged.page, limit: paged.limit, totalPages: paged.totalPages,
    data: paged.items
  });
});

router.get('/orders/:id', (req, res) => {
  const order = store.find('orders', req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, data: order });
});

router.put('/orders/:id', async (req, res) => {
  const { status, note, paymentMethod } = req.body || {};
  const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
  const data = {};
  if (status !== undefined) {
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Allowed: ' + allowed.join(', ') });
    }
    data.status = status;
  }
  if (note !== undefined) data.note = note;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod;
  const order = store.update('orders', req.params.id, data);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  // Approved (confirmed/completed) hole same Bot token diye single-use invite auto-generate.
  // Telegram fail korleo order update atkabe na (error-proof).
  let telegramStatus = null;
  if (status === 'confirmed' || status === 'completed') {
    try { telegramStatus = await generateOrderInvites(order); }
    catch (e) { telegramStatus = { ok: false, error: e.message }; }
  }
  res.json({ success: true, message: 'Order updated', data: store.find('orders', order.id), telegram: telegramStatus });
});

/* ---------- Order telegram invites (regenerate) ----------
 * POST /api/admin/orders/:id/telegram-invites -> notun single-use link banay.
 * Bot code-ay hat deya lage na, Web same BOT_TOKEN use kore. */
router.post('/orders/:id/telegram-invites', async (req, res) => {
  const order = store.find('orders', req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  try {
    const result = await generateOrderInvites(order, true);
    res.json({ success: true, message: 'Invite links generated', data: store.find('orders', order.id), telegram: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Failed to generate invites' });
  }
});

/* Order-er protita course-er chatId theke single-use invite banay + order-e save kore. */
async function generateOrderInvites(order, force) {
  const telegram = require('../telegram');
  if (!telegram.getBotToken()) {
    return { ok: false, error: 'BOT_TOKEN set kora nai (cPanel env BOT_TOKEN / Admin Settings > Bot Token)' };
  }
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return { ok: false, error: 'Order-e kono course nai' };
  const prev = (order.telegramInvites && typeof order.telegramInvites === 'object') ? order.telegramInvites : {};
  const next = Object.assign({}, prev);
  let created = 0;
  const errors = [];
  for (const it of items) {
    const cid = String(it.courseId || '');
    if (!cid) continue;
    if (!force && next[cid] && Array.isArray(next[cid]) && next[cid].some(x => x.inviteLink)) continue; // age banano thakle skip
    const course = store.find('courses', cid);
    if (!course) continue;
    const chatIds = Array.isArray(course.telegramChatIds) ? course.telegramChatIds : [];
    if (!chatIds.length) continue;
    const invites = await telegram.createMultiInvites(chatIds, order.orderNo || order.id);
    const good = invites.filter(x => x.inviteLink);
    if (good.length) {
      next[cid] = invites;
      created += good.length;
    } else if (invites.length && invites[0].error) {
      errors.push(invites[0].error);
    }
  }
  store.update('orders', order.id, { telegramInvites: next });
  if (!created) {
    return { ok: false, error: errors[0] || 'Kono Group ID set kora nai / Bot admin na (Invite Users permission daw)' };
  }
  return { ok: true, created };
}

router.delete('/orders/:id', (req, res) => {
  const removed = store.remove('orders', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, message: 'Order deleted', data: removed });
});

/* ---------- Home Page ---------- */
router.get('/homepage', (req, res) => {
  const db = store.load();
  if (!db.homePage) db.homePage = store.defaultHomePage();
  res.json({ success: true, data: db.homePage });
});

router.put('/homepage', (req, res) => {
  const db = store.load();
  if (!db.homePage) db.homePage = store.defaultHomePage();
  const body = req.body || {};

  if (body.hero && typeof body.hero === 'object') {
    const allowedHero = ['enabled', 'badge', 'titleLine1', 'titleLine2', 'highlight', 'description', 'searchPlaceholder', 'ctaText', 'ctaLink', 'imageUrl', 'imageAlt'];
    allowedHero.forEach(k => { if (body.hero[k] !== undefined) db.homePage.hero[k] = body.hero[k]; });
  }
  const flatHeroMap = { badge: 'badge', titleLine1: 'titleLine1', titleLine2: 'titleLine2', highlight: 'highlight', description: 'description', searchPlaceholder: 'searchPlaceholder', ctaText: 'ctaText', ctaLink: 'ctaLink', imageUrl: 'imageUrl', imageAlt: 'imageAlt', heroEnabled: 'enabled' };
  Object.keys(flatHeroMap).forEach(k => { if (body[k] !== undefined) db.homePage.hero[flatHeroMap[k]] = body[k]; });

  if (body.sections && typeof body.sections === 'object') {
    Object.keys(body.sections).forEach(secKey => {
      if (db.homePage.sections[secKey] && typeof body.sections[secKey] === 'object') {
        Object.assign(db.homePage.sections[secKey], body.sections[secKey]);
      } else if (typeof body.sections[secKey] === 'object') {
        db.homePage.sections[secKey] = body.sections[secKey];
      }
    });
  }

  store.save();
  res.json({ success: true, message: 'Home page saved', data: db.homePage });
});

router.post('/homepage/reset', (req, res) => {
  const db = store.load();
  db.homePage = store.defaultHomePage();
  store.save();
  res.json({ success: true, message: 'Home page reset to default', data: db.homePage });
});

/* ---------- Settings ---------- */
router.get('/settings', (req, res) => {
  res.json({ success: true, data: store.load().settings });
});

router.put('/settings', (req, res) => {
  const db = store.load();
  const allowed = ['siteName', 'tagline', 'currency', 'telegram', 'phone', 'email', 'address', 'footerText', 'logoUrl', 'logoAlt',
    'noticeEnabled', 'noticeText', 'noticeLink', 'noticeBg', 'noticeColor', 'noticeDismissible',
    'googleLoginEnabled', 'googleClientId',
    'piprapayEnabled', 'piprapayApiKey', 'piprapayBaseUrl',
    'botToken'];
  const boolKeys = ['noticeEnabled', 'noticeDismissible', 'googleLoginEnabled', 'piprapayEnabled'];
  allowed.forEach(k => {
    if (req.body && req.body[k] !== undefined) {
      if (boolKeys.includes(k)) {
        const v = req.body[k];
        db.settings[k] = (v === true || v === 'true' || v === 1 || v === '1');
      } else {
        db.settings[k] = req.body[k] === null ? '' : String(req.body[k]);
      }
    }
  });
  store.save();
  res.json({ success: true, message: 'Settings saved', data: db.settings });
});

/* ---------- Admin account (change own password) ---------- */
router.put('/account/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const admin = store.find('admins', req.session.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (!auth.verifyPassword(currentPassword, admin.password)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }
  admin.password = auth.hashPassword(newPassword);
  store.save();
  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
