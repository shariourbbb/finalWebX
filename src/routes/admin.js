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
  categories: ['name', 'slug', 'icon', 'color', 'status', 'for'],
  platforms: ['name', 'status'],
  courses: ['title', 'slug', 'batchId', 'categoryId', 'platformId', 'teacher', 'price', 'oldPrice',
    'duration', 'totalClass', 'thumbnail', 'description', 'featured', 'status',
    'telegramLink', 'telegramLinks', 'telegramChatIds', 'previewVideoId', 'features', 'tags', 'bannerColor'],
  lessons: ['courseId', 'section', 'title', 'videoId', 'videoUrl', 'videoName', 'videoSize', 'videoType', 'duration', 'isFree', 'order', 'status'],
  coupons: ['code', 'type', 'value', 'minOrder', 'maxDiscount', 'usageLimit', 'used', 'expiresAt', 'status', 'courseIds', 'batchIds', 'categoryIds', 'userIds', 'allowedEmails', 'allowedPhones'],
  ebooks: ['title', 'slug', 'cover', 'details', 'author', 'price', 'oldPrice', 'fileUrl', 'fileName', 'fileSize', 'linkUrl', 'downloads', 'status', 'batchId', 'categoryId', 'ebookBatchId']
};

const NUMBER_FIELDS = ['price', 'oldPrice', 'totalClass', 'value', 'minOrder', 'maxDiscount',
  'usageLimit', 'used', 'batchId', 'categoryId', 'platformId', 'order', 'ebookBatchId', 'videoSize'];
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

/* ---------- Slug: khali thakle name/title theke auto + unique rakho ----------
 * Admin slug field khali rekhe save korle ("slug: -") public link/lookup
 * nosto hoy. Tai empty slug auto-generate + same entity-te clash hole -2/-3. */
function ensureUniqueSlug(entity, data, ignoreId) {
  if (!data.slug && (data.name || data.title)) data.slug = slugify(data.name || data.title);
  if (!data.slug) return;
  const all = store.all(entity);
  const base = String(data.slug);
  let slug = base, n = 2;
  while (all.some(x => String(x.id) !== String(ignoreId) && String(x.slug) === slug)) slug = base + '-' + (n++);
  data.slug = slug;
}

/* ---------- Image fields: base64 ele file banaw (db + API light rakhar jonno) ---------- */
const IMAGE_FIELDS = { courses: ['thumbnail'], ebooks: ['cover'], batches: ['iconUrl'], ebookBatches: ['iconUrl'] };
function lightenImages(entity, data, prev) {
  (IMAGE_FIELDS[entity] || []).forEach(key => {
    if (data[key] === undefined) return;
    const v = data[key];
    if (typeof v === 'string' && v.startsWith('data:')) {
      data[key] = store.storeImage(v, entity);
      // replace hole purono media file mushe felo
      if (prev && typeof prev[key] === 'string' && prev[key].startsWith('/uploads/media/') && prev[key] !== data[key]) {
        try {
          const path = require('path');
          const fs = require('fs');
          const fp = path.join(__dirname, '..', '..', prev[key]);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (e) { /* ignore */ }
      }
    }
  });
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

/* ---------- Coupon targeting: [] / khali = sob course-e cholbe ----------
 * courseIds: nirdisto course | batchIds: puro batch | categoryIds: puro category
 * Tin-tar jekono ektay match korlei coupon cholbe (OR logic). */
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
const normalizeCouponBatches = normalizeCouponCourses;
const normalizeCouponCategories = normalizeCouponCourses;
const normalizeCouponUsers = normalizeCouponCourses;
function normalizeCouponEmails(v) {
  const out = [];
  const push = (x) => {
    const s = String(x == null ? '' : x).trim().toLowerCase();
    if (!s || out.includes(s)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return;
    out.push(s);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (v !== undefined && v !== null && String(v).trim() !== '') String(v).split(/[\n,;]+/).forEach(push);
  return out.slice(0, 200);
}
function normalizeCouponPhones(v) {
  const out = [];
  const push = (x) => {
    const s = String(x == null ? '' : x).replace(/[\s\-()]/g, '');
    if (!s || out.includes(s)) return;
    if (!/^\+?\d{6,15}$/.test(s)) return;
    out.push(s);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (v !== undefined && v !== null && String(v).trim() !== '') String(v).split(/[\n,;]+/).forEach(push);
  return out.slice(0, 200);
}

/* ---------- Generic CRUD: batches / categories / platforms / courses / coupons ----------
 * NOTE: 'lessons' FIELDS-e thakleo loop theke bad — lessons-er dedicated
 * YouTube/upload-aware routes niche ache (generic route shadow kore dito).
 * Protita entity-te oi section-er permission lage (Admin Manage > Permission).
 * Purono admin (permissions field nai) + superadmin = sob khanei access. */
const ENTITY_PERM = {
  batches: 'batches', ebookBatches: 'ebookBatches', categories: 'categories',
  platforms: 'platforms', courses: 'courses', lessons: 'courses',
  coupons: 'coupons', ebooks: 'ebooks'
};
Object.keys(FIELDS).filter(entity => entity !== 'lessons').forEach(entity => {
  const need = auth.requirePermission(ENTITY_PERM[entity] || 'settings');
  router.get('/' + entity, need, (req, res) => {
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

  router.get('/' + entity + '/:id', need, (req, res) => {
    const item = store.find(entity, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  });

  router.post('/' + entity, need, (req, res) => {
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
    ensureUniqueSlug(entity, data, null);
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
      data.batchIds = normalizeCouponBatches(data.batchIds);
      data.categoryIds = normalizeCouponCategories(data.categoryIds);
      data.userIds = normalizeCouponUsers(data.userIds);
      data.allowedEmails = normalizeCouponEmails(data.allowedEmails);
      data.allowedPhones = normalizeCouponPhones(data.allowedPhones);
    }
    lightenImages(entity, data, null);
    const item = store.insert(entity, data);
    // Notun batch create hole Home > Courses Category-te auto show koro:
    // manual tick mode-e (batchIds non-empty) thakleo notun batch auto-tick hobe.
    if (entity === 'batches') {
      try {
        const db = store.load();
        const cat = db.homePage && db.homePage.sections && db.homePage.sections.categories;
        if (cat && Array.isArray(cat.batchIds) && cat.batchIds.length && !cat.batchIds.map(String).includes(String(item.id))) {
          cat.batchIds.push(String(item.id));
          store.save();
        }
      } catch (e) { /* home auto-tick fail korleo batch create success */ }
    }
    res.status(201).json({ success: true, message: 'Created successfully', data: item });
  });

  router.put('/' + entity + '/:id', need, (req, res) => {
    const data = pick(entity, req.body || {});
    // Slug khali kore save korle name theke regenerate + unique rakho
    if (data.slug !== undefined && !String(data.slug).trim()) {
      const prev = store.find(entity, req.params.id) || {};
      const tmp = { slug: '', name: data.name !== undefined ? data.name : prev.name, title: data.title !== undefined ? data.title : prev.title };
      ensureUniqueSlug(entity, tmp, req.params.id);
      data.slug = tmp.slug;
    } else if (data.slug) {
      ensureUniqueSlug(entity, data, req.params.id);
    }
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
    if (entity === 'coupons' && data.batchIds !== undefined) {
      data.batchIds = normalizeCouponBatches(data.batchIds);
    }
    if (entity === 'coupons' && data.categoryIds !== undefined) {
      data.categoryIds = normalizeCouponCategories(data.categoryIds);
    }
    if (entity === 'coupons' && data.userIds !== undefined) {
      data.userIds = normalizeCouponUsers(data.userIds);
    }
    if (entity === 'coupons' && data.allowedEmails !== undefined) {
      data.allowedEmails = normalizeCouponEmails(data.allowedEmails);
    }
    if (entity === 'coupons' && data.allowedPhones !== undefined) {
      data.allowedPhones = normalizeCouponPhones(data.allowedPhones);
    }
    lightenImages(entity, data, store.find(entity, req.params.id));
    const item = store.update(entity, req.params.id, data);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Updated successfully', data: item });
  });

  router.delete('/' + entity + '/:id', need, (req, res) => {
    const removed = store.remove(entity, req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Not found' });
    // cascade: deleting a course removes its classes + uploaded class videos too
    if (entity === 'courses') {
      store.all('lessons')
        .filter(l => String(l.courseId) === String(removed.id))
        .forEach(l => { const r = store.remove('lessons', l.id); deleteLessonFile(r || l); });
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
    // cascade: cover/thumbnail/icon media file-o mushe felo (onno item use na korle)
    (IMAGE_FIELDS[entity] || []).forEach(key => {
      const u = removed[key];
      if (typeof u !== 'string' || !u.startsWith('/uploads/media/')) return;
      const stillUsed = store.all(entity).some(x => x[key] === u);
      if (stillUsed) return;
      try {
        const fs = require('fs');
        const path = require('path');
        const fp = path.join(__dirname, '..', '..', u);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (e) { /* ignore */ }
    });
    res.json({ success: true, message: 'Deleted successfully', data: removed });
  });
});

/* ---------- Lessons (course classes) ----------
 * Dui vabe video deya jabe: YouTube link (videoId store hoy) BA direct
 * video file upload (videoUrl = /uploads/videos/...).
 * Duitar kono raw link public API-te jay na (see public.js watch endpoint). */
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

function isUploadedVideoUrl(u) {
  return typeof u === 'string' && u.startsWith('/uploads/videos/');
}

// Lesson-er uploaded mp4 file thakle disk theke mushe felo (YouTube link-e hat dey na).
// Onno kono class same file use korle musbe na (duplicate course-er jonno safe).
function deleteLessonFile(lesson, ignoreId) {
  if (!lesson || !isUploadedVideoUrl(lesson.videoUrl)) return;
  try {
    const stillUsed = store.all('lessons').some(l =>
      String(l.id) !== String(ignoreId == null ? (lesson.id || '') : ignoreId) &&
      l.videoUrl === lesson.videoUrl);
    if (stillUsed) return;
    const path = require('path');
    const fs = require('fs');
    const fp = path.join(__dirname, '..', '..', lesson.videoUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* ignore */ }
}

function nextLessonOrder(courseId) {
  const list = store.all('lessons').filter(l => String(l.courseId) === String(courseId));
  return list.length ? Math.max(...list.map(l => Number(l.order) || 0)) + 1 : 1;
}

// List lessons of a course (admin sees videoId; public never does)
router.get('/courses/:courseId/lessons', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const list = store.all('lessons')
    .filter(l => String(l.courseId) === String(course.id))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  res.json({ success: true, count: list.length, data: list });
});

// Add a lesson to a course (YouTube link BA uploaded video file)
router.post('/courses/:courseId/lessons', auth.requirePermission('courses'), (req, res) => {
  const course = store.find('courses', req.params.courseId);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  const { section, title, youtubeUrl, videoId, videoUrl, videoName, videoSize, videoType, duration, isFree, order, status } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, message: 'Lesson title is required' });
  }
  const vid = extractYouTubeId(videoId || youtubeUrl);
  const uploaded = isUploadedVideoUrl(videoUrl) ? String(videoUrl) : '';
  if (!vid && !uploaded) {
    return res.status(400).json({ success: false, message: 'YouTube link BA uploaded video file din' });
  }
  const lesson = store.insert('lessons', {
    courseId: course.id,
    section: section ? String(section) : '',
    title: String(title).trim(),
    videoId: vid || '',
    videoUrl: uploaded,
    videoName: videoName ? String(videoName).slice(0, 150) : '',
    videoSize: Number(videoSize) || 0,
    videoType: uploaded ? 'upload' : 'youtube',
    duration: duration ? String(duration) : '',
    isFree: (isFree === true || isFree === 'true' || isFree === 1),
    order: order === undefined ? nextLessonOrder(course.id) : (Number(order) || 0),
    status: status || 'active'
  });
  res.status(201).json({ success: true, message: 'Class added', data: lesson });
});

// Update a lesson
router.put('/lessons/:id', auth.requirePermission('courses'), (req, res) => {
  const lesson = store.find('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
  const data = pick('lessons', req.body || {});
  if (req.body && (req.body.youtubeUrl !== undefined || req.body.videoId !== undefined)) {
    const vid = extractYouTubeId(req.body.videoId !== undefined ? req.body.videoId : req.body.youtubeUrl);
    // khali string mane YouTube clear kora (uploaded video thakle cholbe)
    if (vid) {
      data.videoId = vid; data.videoType = 'youtube'; data.videoUrl = '';
      // upload theke YouTube-e switch: purono mp4 mushe felo (onno class use na korle)
      if (lesson.videoUrl) deleteLessonFile(lesson, lesson.id);
    }
    else if (req.body.videoUrl === undefined && !isUploadedVideoUrl(lesson.videoUrl)) {
      return res.status(400).json({ success: false, message: 'Valid YouTube link is required' });
    } else if (vid === '' && (req.body.videoUrl !== undefined || req.body.videoId !== undefined)) {
      data.videoId = '';
    }
  }
  if (data.videoUrl !== undefined) {
    if (data.videoUrl && !isUploadedVideoUrl(data.videoUrl)) {
      return res.status(400).json({ success: false, message: 'Video age upload korun' });
    }
    // replace hole purono mp4 mushe felo (onno class use na korle)
    if (data.videoUrl && lesson.videoUrl && data.videoUrl !== lesson.videoUrl) deleteLessonFile(lesson, lesson.id);
    if (data.videoUrl) { data.videoType = 'upload'; data.videoId = ''; }
    else if (!extractYouTubeId(req.body.youtubeUrl || req.body.videoId || '') && !lesson.videoId) {
      return res.status(400).json({ success: false, message: 'YouTube link BA uploaded video file din' });
    }
  }
  if (data.videoName !== undefined) data.videoName = String(data.videoName).slice(0, 150);
  if (data.videoSize !== undefined) data.videoSize = Number(data.videoSize) || 0;
  if (data.isFree !== undefined) data.isFree = (data.isFree === true || data.isFree === 'true' || data.isFree === 1);
  if (data.order !== undefined) data.order = Number(data.order) || 0;
  if (data.courseId !== undefined) data.courseId = Number(data.courseId) || data.courseId;
  const updated = store.update('lessons', req.params.id, data);
  res.json({ success: true, message: 'Class updated', data: updated });
});

// Delete a lesson
router.delete('/lessons/:id', auth.requirePermission('courses'), (req, res) => {
  const removed = store.remove('lessons', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Not found' });
  deleteLessonFile(removed);
  res.json({ success: true, message: 'Class deleted', data: removed });
});

/* ---------- Class video file upload (raw bytes, max 500MB) ----------
 * Dui vabe use hoy:
 * 1) POST /api/admin/videos/upload -> lesson charai temp upload (course add-er somoy),
 *    response videoUrl pore lesson create/update-e pathano hoy.
 * 2) POST /api/admin/lessons/:id/video -> existing class-er video replace. */
function checkVideoBytes(buf) {
  if (!buf || !buf.length) return 'No video file received';
  if (buf.length < 12) return 'File too small to be a video';
  // MP4/MOV: 'ftyp' at offset 4 | WebM/MKV: EBML header 0x1A45DFA3
  const ftyp = buf.slice(4, 8).toString() === 'ftyp';
  const ebml = buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3;
  if (!ftyp && !ebml) return 'Only MP4 / WebM video files are allowed';
  return '';
}

function headerFileName(req, maxLen) {
  let n = req.headers['x-file-name'] ? String(req.headers['x-file-name']) : '';
  try { n = decodeURIComponent(n); } catch (e) {}
  return n.slice(0, maxLen || 150);
}

function saveVideoBuffer(buf, origName) {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const dir = path.join(__dirname, '..', '..', 'uploads', 'videos');
  fs.mkdirSync(dir, { recursive: true });
  const ext = /webm/i.test(String(origName || '')) ? '.webm' : '.mp4';
  const filename = 'class-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext;
  fs.writeFileSync(path.join(dir, filename), buf);
  return { videoUrl: '/uploads/videos/' + filename, videoSize: buf.length };
}

router.post('/videos/upload', auth.requirePermission('courses'), (req, res) => {
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No video file received' });
  }
  const bad = checkVideoBytes(req.body);
  if (bad) return res.status(400).json({ success: false, message: bad });
  try {
    const out = saveVideoBuffer(req.body, headerFileName(req));
    res.status(201).json({ success: true, message: 'Video uploaded', data: Object.assign(out, {
      videoName: headerFileName(req)
    })});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save video' });
  }
});

router.post('/lessons/:id/video', auth.requirePermission('courses'), (req, res) => {
  const lesson = store.find('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
  if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'No video file received' });
  }
  const bad = checkVideoBytes(req.body);
  if (bad) return res.status(400).json({ success: false, message: bad });
  try {
    deleteLessonFile(lesson, lesson.id);
    const out = saveVideoBuffer(req.body, headerFileName(req));
    const updated = store.update('lessons', lesson.id, {
      videoUrl: out.videoUrl,
      videoSize: out.videoSize,
      videoName: headerFileName(req) || (lesson.videoName || ''),
      videoType: 'upload',
      videoId: ''
    });
    res.json({ success: true, message: 'Video uploaded', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save video' });
  }
});

/* ---------- Duplicate course (Copy-Paste with classes) ----------
 * POST /api/admin/courses/:id/duplicate
 * Body (all optional): { title, batchId, categoryId, platformId }
 * Akei course onno batch/category-te rakhte chaile alada kore class upload
 * korte hoy na — course + sob class copy hoye notun course hobe. */
router.post('/courses/:id/duplicate', auth.requirePermission('courses'), (req, res) => {
  const src = store.find('courses', req.params.id);
  if (!src) return res.status(404).json({ success: false, message: 'Course not found' });
  const b = req.body || {};
  const copy = {};
  Object.keys(src).forEach(k => {
    if (k === 'id' || k === 'createdAt' || k === 'updatedAt') return;
    const v = src[k];
    copy[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  });
  copy.title = (b.title && String(b.title).trim()) || src.title;
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
  // sob class copy (YouTube videoId BA uploaded videoUrl, section, order soho)
  // note: uploaded mp4 file share hobe (notun copy hoy na), delete korle file musbe na jodi onno class use kore
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
      videoUrl: l.videoUrl || '',
      videoName: l.videoName || '',
      videoSize: Number(l.videoSize) || 0,
      videoType: l.videoType || (l.videoUrl ? 'upload' : 'youtube'),
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
router.post('/ebooks/:id/file', auth.requirePermission('ebooks'), (req, res) => {
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

/* ---------- Orphan video cleanup (course save na kore modal bondho korle) ---------- */
router.delete('/videos', auth.requirePermission('courses'), (req, res) => {
  const { videoUrl } = req.body || {};
  if (!isUploadedVideoUrl(videoUrl)) return res.status(400).json({ success: false, message: 'Invalid video URL' });
  const used = store.all('lessons').some(l => l.videoUrl === videoUrl);
  if (used) return res.json({ success: true, message: 'Video is used by a class, kept' });
  try {
    const path = require('path');
    const fs = require('fs');
    const fp = path.join(__dirname, '..', '..', videoUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* ignore */ }
  res.json({ success: true, message: 'Video file removed' });
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

router.get('/users', auth.requirePermission('users'), (req, res) => {
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

router.get('/users/:id', auth.requirePermission('users'), (req, res) => {
  const user = store.find('users', req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const orders = store.all('orders').filter(o => String(o.userId) === String(user.id));
  const enrolledCourses = getUserEnrolledCourses(user.id);
  res.json({ success: true, data: Object.assign(auth.publicUser(user), { orders, enrolledCourses }) });
});

// Grant course access to student
router.post('/users/:id/access', auth.requirePermission('users'), (req, res) => {
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
router.post('/users/:id/revoke', auth.requirePermission('users'), (req, res) => {
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

router.delete('/users/:id/access/:courseId', auth.requirePermission('users'), (req, res) => {
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
router.post('/users/:id/ban', auth.requirePermission('users'), (req, res) => {
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

router.post('/users', auth.requirePermission('users'), (req, res) => {
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

router.put('/users/:id', auth.requirePermission('users'), (req, res) => {
  const b = req.body || {};
  const data = {};
  ['name', 'email', 'phone', 'status', 'role'].forEach(k => { if (b[k] !== undefined) data[k] = b[k]; });
  if (b.password) data.password = auth.hashPassword(b.password);
  const user = store.update('users', req.params.id, data);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'User updated', data: auth.publicUser(user) });
});

router.delete('/users/:id', auth.requirePermission('users'), (req, res) => {
  const removed = store.remove('users', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'User deleted', data: auth.publicUser(removed) });
});

/* ---------- Orders management ---------- */
router.get('/orders', auth.requirePermission('orders'), (req, res) => {
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

router.get('/orders/:id', auth.requirePermission('orders'), (req, res) => {
  const order = store.find('orders', req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, data: order });
});

router.put('/orders/:id', auth.requirePermission('orders'), async (req, res) => {
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
  // Approve (confirmed/completed) = explicit grant: revoke-list theke course soraw,
  // nahole approved order-er course dashboard-e show kore na
  if (status === 'confirmed' || status === 'completed') {
    try { auth.grantOrderAccess(store.find('orders', order.id)); } catch (e) {}
  }
  // Status change hole template onujayi auto email (fail korleo response atkabe na)
  if (status !== undefined && ['confirmed', 'completed', 'cancelled'].includes(status)) {
    try { sendOrderStatusMail(store.find('orders', order.id)); } catch (e) {}
  }
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
router.post('/orders/:id/telegram-invites', auth.requirePermission('orders'), async (req, res) => {
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

router.delete('/orders/:id', auth.requirePermission('orders'), (req, res) => {
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

router.put('/homepage', auth.requirePermission('homepage'), (req, res) => {
  const db = store.load();
  if (!db.homePage) db.homePage = store.defaultHomePage();
  const body = req.body || {};

  if (body.hero && typeof body.hero === 'object') {
    const allowedHero = ['enabled', 'badge', 'titleLine1', 'titleLine2', 'highlight', 'description', 'searchPlaceholder', 'ctaText', 'ctaLink', 'imageUrl', 'imageAlt'];
    allowedHero.forEach(k => { if (body.hero[k] !== undefined) db.homePage.hero[k] = body.hero[k]; });
  }
  const flatHeroMap = { badge: 'badge', titleLine1: 'titleLine1', titleLine2: 'titleLine2', highlight: 'highlight', description: 'description', searchPlaceholder: 'searchPlaceholder', ctaText: 'ctaText', ctaLink: 'ctaLink', imageUrl: 'imageUrl', imageAlt: 'imageAlt', heroEnabled: 'enabled' };
  Object.keys(flatHeroMap).forEach(k => { if (body[k] !== undefined) db.homePage.hero[flatHeroMap[k]] = body[k]; });
  // hero image base64 ele file banaw (db halka rakhar jonno)
  if (typeof db.homePage.hero.imageUrl === 'string' && db.homePage.hero.imageUrl.startsWith('data:')) {
    db.homePage.hero.imageUrl = store.storeImage(db.homePage.hero.imageUrl, 'hero');
  }

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

router.post('/homepage/reset', auth.requirePermission('homepage'), (req, res) => {
  const db = store.load();
  db.homePage = store.defaultHomePage();
  store.save();
  res.json({ success: true, message: 'Home page reset to default', data: db.homePage });
});

/* ---------- Settings ---------- */
router.get('/settings', (req, res) => {
  const data = Object.assign({}, store.load().settings);
  if (data.smtpPass) data.smtpPass = '••••••••'; // never leak secret; blank input = keep old
  if (data.sendgridApiKey) data.sendgridApiKey = '••••••••';
  if (data.brevoApiKey) data.brevoApiKey = '••••••••';
  if (data.piprapayApiKey) data.piprapayApiKey = '••••••••';
  if (data.botToken) data.botToken = '••••••••';
  res.json({ success: true, data });
});

router.put('/settings', auth.requirePermission('settings'), (req, res) => {
  const db = store.load();
  const allowed = ['siteName', 'tagline', 'currency', 'telegram', 'phone', 'email', 'address', 'footerText', 'logoUrl', 'logoAlt',
    'noticeEnabled', 'noticeText', 'noticeLink', 'noticeBg', 'noticeColor', 'noticeDismissible',
    'googleLoginEnabled', 'googleClientId',
    'piprapayEnabled', 'piprapayApiKey', 'piprapayBaseUrl',
    'botToken',
    'emailEnabled', 'emailProvider', 'senderName', 'senderEmail',
    'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass',
    'sendgridApiKey', 'brevoApiKey',
    'adminNotifyEnabled', 'adminNotifyEmail',
    'maintenanceEnabled', 'maintenanceTitle', 'maintenanceMessage', 'maintenanceEta'];
  const boolKeys = ['noticeEnabled', 'noticeDismissible', 'googleLoginEnabled', 'piprapayEnabled', 'emailEnabled', 'smtpSecure', 'adminNotifyEnabled', 'maintenanceEnabled'];
  const secretKeys = ['smtpPass', 'sendgridApiKey', 'brevoApiKey', 'piprapayApiKey', 'botToken'];
  allowed.forEach(k => {
    if (req.body && req.body[k] !== undefined) {
      if (boolKeys.includes(k)) {
        const v = req.body[k];
        db.settings[k] = (v === true || v === 'true' || v === 1 || v === '1');
      } else if (secretKeys.includes(k)) {
        // masked bullet value = keep old secret; empty string = clear
        const v = String(req.body[k]);
        if (v === '••••••••' || v === '********') return;
        db.settings[k] = v;
      } else {
        db.settings[k] = req.body[k] === null ? '' : String(req.body[k]);
      }
    }
  });
  if (req.body && req.body.emailProvider !== undefined) {
    const p = String(req.body.emailProvider).toLowerCase();
    db.settings.emailProvider = (p === 'sendgrid' || p === 'brevo') ? p : 'smtp';
  }
  // logo base64 ele file banaw (db halka rakhar jonno)
  if (typeof db.settings.logoUrl === 'string' && db.settings.logoUrl.startsWith('data:')) {
    db.settings.logoUrl = store.storeImage(db.settings.logoUrl, 'logo');
  }
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

/* ---------- Admin team: email invite + role + permissions ----------
 * - Email diye invite: auto temp password + Brevo/SMTP-te login mail jabe
 * - Permission: ke kon section dekhte/use korte parbe (superadmin = sob)
 * - Admin manage (add/edit/delete/invite) korte 'admins' permission lage */
function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function makeTempPassword() {
  return require('crypto').randomBytes(6).toString('hex'); // 12 char
}

// Notun admin-ke login info mail koro (Brevo/SMTP — Settings > Email onujayi)
async function sendAdminInviteMail(admin, tempPassword) {
  const emailer = require('../email');
  const s = store.load().settings || {};
  const site = s.siteName || 'StudyMart';
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F2043">'
    + '<div style="background:linear-gradient(90deg,#1A56FF,#7C3AED);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">'
    + '<div style="font-size:18px;font-weight:800">' + site.replace(/[<>&"]/g, '') + ' — Admin Invite</div></div>'
    + '<div style="border:1px solid #E2E8F0;border-top:0;padding:22px;border-radius:0 0 12px 12px">'
    + '<p style="font-size:14px;line-height:1.7">Hi ' + String(admin.name || admin.username).replace(/[<>&"]/g, '') + ',</p>'
    + '<p style="font-size:14px;line-height:1.7">Tomake <b>' + site.replace(/[<>&"]/g, '') + '</b>-er admin panel-e access dewa hoyeche. Nicher info diye login koro:</p>'
    + '<div style="background:#F8F9FD;border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;margin:14px 0;font-size:14px">'
    + '<div>🔑 Username: <b>' + String(admin.username).replace(/[<>&"]/g, '') + '</b></div>'
    + '<div>🔒 Temporary password: <b>' + String(tempPassword).replace(/[<>&"]/g, '') + '</b></div>'
    + '<div>👤 Role: <b>' + String(admin.role || 'admin').replace(/[<>&"]/g, '') + '</b></div>'
    + '</div>'
    + '<p style="font-size:14px;line-height:1.7">Login page: <b>/admin.html</b> (site-er seshe /admin.html bosao)</p>'
    + '<p style="font-size:13px;color:#DC2626;line-height:1.7">⚠️ Login kore Settings theke password change kore nio.</p>'
    + '</div></div>';
  return emailer.sendMail({
    to: admin.email,
    subject: site + ' — Admin panel invite (login info)',
    html
  });
}

// Nijer theke boro access dewa atkaw: superadmin chara keu superadmin
// banate ba 'admins' permission dite parbe na.
function sanitizeRoleAndPerms(editor, role, permissions) {
  let r = (role === 'superadmin' || role === 'admin') ? role : 'admin';
  let perms = auth.normalizePermissions(permissions);
  if (!editor || editor.role !== 'superadmin') {
    r = 'admin';
    perms = perms.filter(p => p !== 'admins');
  }
  return { role: r, permissions: perms };
}

router.get('/admins', auth.requirePermission('admins'), (req, res) => {
  const list = store.all('admins').map(a => Object.assign(auth.publicAdmin(a), { createdAt: a.createdAt }));
  res.json({ success: true, count: list.length, data: list });
});

router.post('/admins', auth.requirePermission('admins'), async (req, res) => {
  const { username, name, email, password, role, permissions, sendInvite } = req.body || {};
  if (!username || !String(username).trim()) return res.status(400).json({ success: false, message: 'Username is required' });
  if (store.findBy('admins', 'username', String(username).trim())) {
    return res.status(409).json({ success: false, message: 'Ei username diye admin already ache' });
  }
  const cleanEmail = (email && String(email).trim()) ? String(email).trim().toLowerCase() : '';
  if (email && String(email).trim() && !isValidEmail(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Valid email address din' });
  }
  if (cleanEmail && store.all('admins').some(a => String(a.email || '').toLowerCase() === cleanEmail)) {
    return res.status(409).json({ success: false, message: 'Ei email diye admin already ache' });
  }
  const editor = store.find('admins', req.session.id);
  const { role: finalRole, permissions: finalPerms } = sanitizeRoleAndPerms(editor, role, permissions);

  const wantInvite = (sendInvite === true || sendInvite === 'true' || sendInvite === 1 || sendInvite === '1');
  let tempPassword = null;
  let finalPass = password;
  if (wantInvite) {
    if (!cleanEmail) return res.status(400).json({ success: false, message: 'Invite pathate Email address dite hobe' });
    tempPassword = makeTempPassword();
    finalPass = tempPassword;
  }
  if (!finalPass || String(finalPass).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters (nahole "Send email invite" tick daw — auto password bosbe)' });
  const admin = store.insert('admins', {
    username: String(username).trim(),
    name: String(name || username).trim(),
    email: cleanEmail,
    password: auth.hashPassword(String(finalPass)),
    role: finalRole,
    permissions: finalPerms
  });
  // Invite mail ( Brevo / SMTP — fail korleo admin create hoyei thakbe,
  // temp password response-e pathiye deya hobe jate manually share kora jay )
  let mail = null;
  if (wantInvite) {
    try { mail = await sendAdminInviteMail(admin, tempPassword); }
    catch (e) { mail = { ok: false, error: e.message }; }
  }
  res.status(201).json({
    success: true,
    message: wantInvite
      ? (mail && mail.ok ? 'Invite email pathano hoyeche: ' + cleanEmail : 'Admin created — mail jayni (' + ((mail && (mail.error || mail.reason)) || 'email setup check koro') + '). Nicher password-ta copy kore manually daw')
      : 'Notun admin add hoyeche',
    data: auth.publicAdmin(admin),
    tempPassword: tempPassword, // ekbar-i dekhabe (mail fail hole manual share-er jonno)
    mail: mail ? { ok: !!mail.ok, error: mail.error || mail.reason || null } : null
  });
});

router.put('/admins/:id', auth.requirePermission('admins'), (req, res) => {
  const admin = store.find('admins', req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  const { name, email, password, role, permissions } = req.body || {};
  const editor = store.find('admins', req.session.id);
  const data = {};
  if (name !== undefined && String(name).trim()) data.name = String(name).trim();
  if (email !== undefined) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Valid email address din' });
    }
    if (cleanEmail && store.all('admins').some(a => String(a.id) !== String(admin.id) && String(a.email || '').toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Ei email diye onno admin already ache' });
    }
    data.email = cleanEmail;
  }
  if (password !== undefined && String(password).trim() !== '') {
    if (String(password).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    data.password = auth.hashPassword(String(password));
  }
  // role/permission change: superadmin-ke sudhu superadmin-i change korte parbe
  if (role !== undefined || permissions !== undefined) {
    if (String(admin.id) === String(req.session.id)) {
      return res.status(400).json({ success: false, message: 'Nijer role/permission nije change kora jabe na' });
    }
    if (admin.role === 'superadmin' && (!editor || editor.role !== 'superadmin')) {
      return res.status(403).json({ success: false, message: 'Super Admin-er role sudhu Super Admin change korte parbe' });
    }
    const s = sanitizeRoleAndPerms(editor, role !== undefined ? role : admin.role, permissions !== undefined ? permissions : admin.permissions);
    data.role = s.role;
    data.permissions = s.permissions;
  }
  const updated = store.update('admins', admin.id, data);
  res.json({ success: true, message: 'Admin updated', data: auth.publicAdmin(updated) });
});

/* ---------- Admin invitations (accept link, 24h expiry) ----------
 * POST /admins/invite -> email + role + permissions (link mail-e jabe)
 * GET  /admins/invites -> pending invite list
 * POST /admins/invites/:id/resend -> new link + 24h expiry
 * DELETE /admins/invites/:id -> revoke invite */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function escHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function siteBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  return proto + '://' + req.get('host');
}
function inviteAcceptUrl(req, token) {
  return siteBaseUrl(req) + '/admin-accept.html?token=' + token;
}

function publicInvite(inv) {
  if (!inv) return null;
  return {
    id: inv.id, email: inv.email, role: inv.role, permissions: inv.permissions,
    used: !!inv.used, expired: Date.now() > Number(inv.expiresAt || 0),
    expiresAt: inv.expiresAt, createdAt: inv.createdAt
  };
}

// Invitation mail — matches the Admin Invitation template
async function sendAdminInviteLinkMail({ email, role, acceptUrl, siteBase }) {
  const emailer = require('../email');
  const s = store.load().settings || {};
  const site = s.siteName || 'StudyMart';
  const base = siteBase || '';
  const host = base.replace(/^https?:\/\//, '') || 'website';
  const siteLink = base
    ? '<a href="' + escHtml(base) + '" style="color:#1A56FF;font-weight:700">' + escHtml(host) + '</a>'
    : '<b>' + escHtml(site) + '</b>';
  const roleLabel = role === 'superadmin' ? 'Super Administrator' : 'Administrator';
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F2043">'
    + '<div style="background:linear-gradient(90deg,#1A56FF,#7C3AED);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center">'
    + '<div style="font-size:26px">🔐</div>'
    + '<div style="font-size:19px;font-weight:800;margin-top:4px">Admin Invitation</div></div>'
    + '<div style="border:1px solid #E2E8F0;border-top:0;padding:24px;border-radius:0 0 12px 12px">'
    + '<p style="font-size:14px;line-height:1.7">You have been invited to join ' + siteLink + ' as an Administrator.</p>'
    + '<div style="background:#F8F9FD;border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;margin:14px 0;font-size:14px;line-height:2">'
    + '<div>👤 Role: <b>' + escHtml(roleLabel) + '</b></div>'
    + '<div>📧 Email: <b>' + escHtml(email) + '</b></div>'
    + '</div>'
    + '<div style="text-align:center;margin:20px 0">'
    + '<a href="' + escHtml(acceptUrl) + '" style="display:inline-block;background:#1A56FF;color:#fff;font-weight:800;font-size:15px;text-decoration:none;padding:13px 34px;border-radius:10px">🔗 Accept Invitation</a>'
    + '</div>'
    + '<p style="font-size:13px;color:#B45309;line-height:1.7">⏳ This invitation will expire in <b>24 hours</b>.</p>'
    + '<p style="font-size:12px;color:#64748B;line-height:1.7">If you did not expect this invitation, you can safely ignore this message.</p>'
    + '</div></div>';
  return emailer.sendMail({ to: email, subject: 'Admin Invitation - ' + site, html });
}

router.post('/admins/invite', auth.requirePermission('admins'), async (req, res) => {
  const { email, role, permissions } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }
  if (store.all('admins').some(a => String(a.email || '').toLowerCase() === cleanEmail)) {
    return res.status(409).json({ success: false, message: 'This email is already an admin' });
  }
  const dupe = store.all('adminInvites')
    .find(i => String(i.email || '').toLowerCase() === cleanEmail && !i.used && Date.now() <= Number(i.expiresAt || 0));
  if (dupe) {
    return res.status(409).json({ success: false, message: 'An invitation is already pending for this email' });
  }
  const editor = store.find('admins', req.session.id);
  const safe = sanitizeRoleAndPerms(editor, role, permissions);
  const token = require('crypto').randomBytes(24).toString('hex');
  const invite = store.insert('adminInvites', {
    email: cleanEmail, role: safe.role, permissions: safe.permissions,
    token, expiresAt: Date.now() + INVITE_TTL_MS, used: false,
    createdBy: req.session.id, createdAt: new Date().toISOString()
  });
  const acceptUrl = inviteAcceptUrl(req, token);
  let mail = null;
  try { mail = await sendAdminInviteLinkMail({ email: cleanEmail, role: safe.role, acceptUrl, siteBase: siteBaseUrl(req) }); }
  catch (e) { mail = { ok: false, error: e.message }; }
  res.status(201).json({
    success: true,
    message: mail && mail.ok
      ? 'Invitation sent to ' + cleanEmail
      : 'Invite created — email failed (' + ((mail && (mail.error || mail.reason)) || 'check email setup') + '). Copy the link below and share it manually.',
    data: publicInvite(invite),
    acceptUrl,
    mail: mail ? { ok: !!mail.ok, error: mail.error || mail.reason || null } : null
  });
});

router.get('/admins/invites', auth.requirePermission('admins'), (req, res) => {
  const all = store.all('adminInvites').slice().reverse();
  const list = all.map(inv => Object.assign(publicInvite(inv), {
    acceptUrl: (!inv.used && inv.token) ? inviteAcceptUrl(req, inv.token) : ''
  }));
  res.json({ success: true, count: list.length, data: list });
});

router.post('/admins/invites/:id/resend', auth.requirePermission('admins'), async (req, res) => {
  const invite = store.find('adminInvites', req.params.id);
  if (!invite) return res.status(404).json({ success: false, message: 'Invitation not found' });
  if (invite.used) return res.status(400).json({ success: false, message: 'This invitation was already accepted' });
  const token = require('crypto').randomBytes(24).toString('hex');
  store.update('adminInvites', invite.id, { token, expiresAt: Date.now() + INVITE_TTL_MS });
  const fresh = store.find('adminInvites', invite.id);
  const acceptUrl = inviteAcceptUrl(req, token);
  let mail = null;
  try { mail = await sendAdminInviteLinkMail({ email: fresh.email, role: fresh.role, acceptUrl, siteBase: siteBaseUrl(req) }); }
  catch (e) { mail = { ok: false, error: e.message }; }
  res.json({
    success: true,
    message: mail && mail.ok ? 'Invitation resent to ' + fresh.email : 'Invite renewed — email failed. Copy the link and share it manually.',
    data: publicInvite(fresh),
    acceptUrl,
    mail: mail ? { ok: !!mail.ok, error: mail.error || mail.reason || null } : null
  });
});

router.delete('/admins/invites/:id', auth.requirePermission('admins'), (req, res) => {
  const removed = store.remove('adminInvites', req.params.id);
  if (!removed) return res.status(404).json({ success: false, message: 'Invitation not found' });
  res.json({ success: true, message: 'Invitation revoked' });
});

// Ager invite hariye gele / mail na gele: notun temp password + abar mail
router.post('/admins/:id/resend-invite', auth.requirePermission('admins'), async (req, res) => {
  const admin = store.find('admins', req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (!admin.email || !isValidEmail(admin.email)) {
    return res.status(400).json({ success: false, message: 'Ei admin-er email set kora nai — age Edit kore email bosao' });
  }
  const tempPassword = makeTempPassword();
  store.update('admins', admin.id, { password: auth.hashPassword(tempPassword) });
  let mail = null;
  try { mail = await sendAdminInviteMail(store.find('admins', admin.id), tempPassword); }
  catch (e) { mail = { ok: false, error: e.message }; }
  res.json({
    success: true,
    message: mail && mail.ok ? 'Invite abar pathano hoyeche: ' + admin.email : 'Mail jayni (' + ((mail && (mail.error || mail.reason)) || 'email setup check koro') + ') — password-ta manually share koro',
    data: auth.publicAdmin(store.find('admins', admin.id)),
    tempPassword,
    mail: { ok: !!mail.ok, error: (mail && (mail.error || mail.reason)) || null }
  });
});

router.delete('/admins/:id', auth.requirePermission('admins'), (req, res) => {
  const admin = store.find('admins', req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (String(admin.id) === String(req.session.id)) {
    return res.status(400).json({ success: false, message: 'Nijer account delete kora jabe na' });
  }
  if (store.all('admins').length <= 1) {
    return res.status(400).json({ success: false, message: 'Last admin delete kora jabe na' });
  }
  const editor = store.find('admins', req.session.id);
  if (admin.role === 'superadmin' && (!editor || editor.role !== 'superadmin')) {
    return res.status(403).json({ success: false, message: 'Super Admin-ke sudhu Super Admin remove korte parbe' });
  }
  const removed = store.remove('admins', admin.id);
  res.json({ success: true, message: 'Admin removed', data: auth.publicAdmin(removed) });
});

/* ---------- Email templates (admin panel theke edit) ---------- */
router.get('/email-templates', auth.requirePermission('notify'), (req, res) => {
  const db = store.load();
  if (!db.emailTemplates) db.emailTemplates = store.defaultEmailTemplates();
  res.json({ success: true, data: db.emailTemplates });
});

router.put('/email-templates', auth.requirePermission('notify'), (req, res) => {
  const db = store.load();
  if (!db.emailTemplates) db.emailTemplates = store.defaultEmailTemplates();
  const body = req.body || {};
  const templates = body.templates || body;
  Object.keys(templates).forEach(key => {
    const t = templates[key];
    if (!t || typeof t !== 'object') return;
    if (!db.emailTemplates[key]) db.emailTemplates[key] = { name: key, enabled: true, subject: '', body: '' };
    if (t.subject !== undefined) db.emailTemplates[key].subject = String(t.subject);
    if (t.body !== undefined) db.emailTemplates[key].body = String(t.body);
    if (t.enabled !== undefined) db.emailTemplates[key].enabled = (t.enabled === true || t.enabled === 'true' || t.enabled === 1 || t.enabled === '1');
    if (t.name !== undefined) db.emailTemplates[key].name = String(t.name);
  });
  store.save();
  res.json({ success: true, message: 'Email templates saved', data: db.emailTemplates });
});

router.post('/email-templates/reset', auth.requirePermission('notify'), (req, res) => {
  const db = store.load();
  db.emailTemplates = store.defaultEmailTemplates();
  store.save();
  res.json({ success: true, message: 'Templates reset to default', data: db.emailTemplates });
});

/* ---------- Email: test + custom notification ---------- */
router.post('/email-test', auth.requirePermission('notify'), async (req, res) => {
  const emailer = require('../email');
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ success: false, message: 'Please enter a test email address' });
  const s = store.load().settings || {};
  const result = await emailer.sendMail({
    to: String(to).trim(),
    subject: 'Test email - ' + (s.siteName || 'StudyMart'),
    html: '<p>Hi,</p><p>Your email setup is working! This mail was sent from <b>' + (s.siteName || 'StudyMart') + '</b>.</p>'
  });
  if (result.ok) return res.json({ success: true, message: 'Test email sent to: ' + to });
  res.status(400).json({ success: false, message: result.error || result.reason || 'Could not send email' });
});

router.post('/notify', auth.requirePermission('notify'), async (req, res) => {
  const emailer = require('../email');
  const { to, userId, userIds, sendToAll, subject, message } = req.body || {};
  if (!subject || !String(subject).trim()) return res.status(400).json({ success: false, message: 'Subject din' });
  if (!message || !String(message).trim()) return res.status(400).json({ success: false, message: 'Message din' });
  let targets = [];
  if (sendToAll === true || sendToAll === 'true') {
    targets = store.all('users').map(u => u.email).filter(e => emailer.isRealEmail(e));
  } else if (Array.isArray(userIds)) {
    userIds.forEach(id => {
      const u = store.find('users', id);
      if (u && emailer.isRealEmail(u.email)) targets.push(u.email);
    });
  } else if (userId) {
    const u = store.find('users', userId);
    if (u && emailer.isRealEmail(u.email)) targets.push(u.email);
  } else if (to) {
    String(to).split(/[\n,;]+/).map(x => x.trim()).filter(x => emailer.isRealEmail(x)).forEach(x => targets.push(x));
  }
  targets = Array.from(new Set(targets));
  if (!targets.length) return res.status(400).json({ success: false, message: 'Kono valid email address pawa jayni' });
  if (targets.length > 200) return res.status(400).json({ success: false, message: 'Ekbare max 200 jon ke pathano jabe' });
  const s = store.load().settings || {};
  let sent = 0;
  const errors = [];
  for (const addr of targets) {
    const user = store.findBy('users', 'email', addr);
    const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F2043">'
      + '<div style="background:linear-gradient(90deg,#1A56FF,#7C3AED);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">'
      + '<div style="font-size:18px;font-weight:800">' + String(s.siteName || 'StudyMart').replace(/[<>&"]/g, '') + '</div></div>'
      + '<div style="border:1px solid #E2E8F0;border-top:0;padding:22px;border-radius:0 0 12px 12px">'
      + String(message).split('\n').map(line => '<p style="font-size:14px;line-height:1.7;margin:0 0 10px">' + line.replace(/[<>&"]/g, '') + '</p>').join('')
      + '</div></div>';
    const r = await emailer.sendMail({
      to: addr,
      subject: emailer.renderTemplate(String(subject), { name: user ? user.name : '', email: addr }),
      html: emailer.renderTemplate(html, { name: user ? user.name : '', email: addr })
    });
    if (r.ok) sent++;
    else errors.push(addr + ': ' + (r.error || r.reason));
  }
  res.json({ success: true, message: sent + '/' + targets.length + ' jon ke email pathano hoyeche', data: { sent, total: targets.length, errors: errors.slice(0, 5) } });
});

/* ---------- Order status change -> auto email (template onujayi) ---------- */
async function sendOrderStatusMail(order) {
  try {
    const emailer = require('../email');
    emailer.notifyOrder(order, order.status);
  } catch (e) { /* email fail korleo order update atkabe na */ }
}

module.exports = router;
