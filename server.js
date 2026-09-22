/**
 * StudyMart - Node.js (Express) backend + Admin Panel
 * ---------------------------------------------------
 * Frontend  : http://localhost:3000
 * Admin     : http://localhost:3000/admin.html
 * API       : /api/*          (public endpoints)
 *             /api/admin/*    (admin-only, token protected)
 */
const express = require('express');
const path = require('path');
const store = require('./src/store');
const auth = require('./src/auth');
const tracker = require('./src/tracker');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- Core middleware ---------- */
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
// Raw PDF bytes for e-book file uploads (no extra dependency needed)
app.use(express.raw({ type: 'application/pdf', limit: '50mb' }));
// Raw video bytes for class video uploads (mp4/webm, max 500MB per file)
app.use(express.raw({ type: 'video/*', limit: '500mb' }));

app.use((req, res, next) => {
  tracker.trackRequest(req);
  const start = Date.now();
  res.on('finish', () => {
    const time = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${time}ms)`);
  });
  next();
});

/* ---------- Admin auth (separate from student auth) ---------- */
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username/email and password are required' });
  }
  const result = auth.loginAdmin(username, password);
  if (!result) {
    return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
  }
  res.json({ success: true, message: 'Login successful', token: result.token, data: result.admin });
});

app.post('/api/admin/logout', (req, res) => {
  auth.destroySession(auth.getToken(req));
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/admin/me', auth.requireAdmin, (req, res) => {
  // fresh DB record theke role/permission naw (change sathe sathe karjokor hobe)
  const admin = store.find('admins', req.session.id);
  if (!admin) return res.status(401).json({ success: false, message: 'Admin not found' });
  res.json({ success: true, data: auth.publicAdmin(admin) });
});

/* ---------- API routes ---------- */
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);   // used by the public website (assets/app.js)
app.use('/api', publicRoutes);          // legacy/short paths: /api/courses, /api/batches ...

/* ---------- Bootstrap injection (prevent flicker - old template blink) ---------- */
const fs = require('fs');
/* Lightweight public catalogue snapshot for instant first paint (zero-fetch render).
 * Media migration-er por egula choto (~30-60KB), tai HTML-er sathei pathano jay.
 * Frontend bootstrap theke songe songe render kore, background-e revalidate kore. */
function buildCatalog() {
  try {
    const db = store.load();
    const active = list => (list || []).filter(i => (i.status || 'active') === 'active');
    const batches = active(db.batches).slice()
      .sort((a, b) => ((Number(a.order) || 999) - (Number(b.order) || 999)) || (Number(a.id) - Number(b.id)));
    const categories = active(db.categories);
    const batchById = {}, catById = {}, platById = {};
    (db.batches || []).forEach(b => { batchById[String(b.id)] = b; });
    (db.categories || []).forEach(c => { catById[String(c.id)] = c; });
    (db.platforms || []).forEach(p => { platById[String(p.id)] = p; });
    const liteCourse = c => {
      const b = batchById[String(c.batchId)], cat = catById[String(c.categoryId)], p = platById[String(c.platformId)];
      return {
        id: c.id, title: c.title, slug: c.slug, thumbnail: c.thumbnail || '',
        teacher: c.teacher || '', price: Number(c.price) || 0, oldPrice: Number(c.oldPrice) || 0,
        batchId: c.batchId, batchName: b ? b.name : '', batchColor: b ? b.color : '#4F46E5',
        categoryName: cat ? cat.name : '', categorySlug: cat ? cat.slug : '',
        platformName: p ? p.name : 'Online', featured: !!c.featured,
        discount: (Number(c.oldPrice) || 0) > (Number(c.price) || 0)
          ? Math.round(((c.oldPrice - c.price) / c.oldPrice) * 100) : 0
      };
    };
    const courses = active(db.courses).slice(-80).reverse().map(liteCourse);
    const ebBatchById = {};
    (db.ebookBatches || []).forEach(b => { ebBatchById[String(b.id)] = b; });
    const ebookBatches = active(db.ebookBatches).slice()
      .sort((a, b) => ((Number(a.order) || 999) - (Number(b.order) || 999)) || (Number(a.id) - Number(b.id)));
    const ebooks = active(db.ebooks).slice(-40).reverse().map(e => {
      const eb = ebBatchById[String(e.ebookBatchId)] || batchById[String(e.batchId)];
      const cat = catById[String(e.categoryId)];
      return {
        id: e.id, title: e.title, slug: e.slug, cover: e.cover || '',
        author: e.author || '', price: Number(e.price) || 0, oldPrice: Number(e.oldPrice) || 0,
        ebookBatchId: e.ebookBatchId || '', ebookBatchName: eb ? eb.name : '', batchName: eb ? eb.name : '',
        batchColor: eb ? eb.color : '#4F46E5', categoryName: cat ? cat.name : ''
      };
    });
    return { batches, categories, courses, ebooks, ebookBatches };
  } catch (e) { return { batches: [], categories: [], courses: [], ebooks: [], ebookBatches: [] }; }
}
function injectBootstrap(html) {
  try {
    const db = store.load();
    const safeSettings = Object.assign({}, db.settings || {});
    delete safeSettings.piprapayApiKey; // never expose gateway secret to the browser
    delete safeSettings.smtpPass; // never expose mail secrets
    delete safeSettings.sendgridApiKey;
    delete safeSettings.botToken;
    const bootstrap = {
      settings: safeSettings,
      homePage: db.homePage || store.defaultHomePage(),
      catalog: buildCatalog()
    };
    const json = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
    const bootstrapScript = `<script>window.__SM_BOOTSTRAP__=${json};</script>`;
    // FIX (old-data flash): hardcoded template (StudyMart name, SVG logo, tagline,
    // hero texts, footer, notice, sections) browser first-paint-e dekhiye pore
    // DB data diye replace hoto. Tai sm-loading obosthay SOB dynamic zone
    // opacity:0 rakha hoy — data apply kore sm-ready dilei ekbare sothik
    // data visible hobe, majhe purono template ar dekhabe na.
    const flickerStyle = `<style>html.sm-loading #secHero,html.sm-loading #secCategories,html.sm-loading #secEbookCategory,html.sm-loading #secPopular,html.sm-loading #secFeatured,html.sm-loading #secEbooks,html.sm-loading #secPopularEbooks,html.sm-loading #secHowToBuy,html.sm-loading #secLatest,html.sm-loading #secBatches,html.sm-loading #secStats,html.sm-loading #secBrowseCategory{opacity:0!important}html.sm-loading #siteLogoImg,html.sm-loading #siteLogoFallback,html.sm-loading [data-sm-desk-logo],html.sm-loading [data-sm-desk-logo-fb],html.sm-loading #siteNameDisplay,html.sm-loading #siteFooterNameDisplay,html.sm-loading #siteFooterLogoImg,html.sm-loading #siteFooterLogoFallback,html.sm-loading #siteTaglineDisplay,html.sm-loading #siteFooterTaglineDisplay{opacity:0!important}html.sm-loading #noticeBar{display:none!important}html.sm-ready #secHero,html.sm-ready #secCategories,html.sm-ready #secEbookCategory,html.sm-ready #secPopular,html.sm-ready #secFeatured,html.sm-ready #secEbooks,html.sm-ready #secPopularEbooks,html.sm-ready #secHowToBuy,html.sm-ready #siteLogoImg,html.sm-ready #siteLogoFallback,html.sm-ready #siteNameDisplay,html.sm-ready #siteFooterNameDisplay,html.sm-ready #siteTaglineDisplay,html.sm-ready #siteFooterTaglineDisplay{opacity:1;transition:opacity .18s ease}</style><script>document.documentElement.classList.add('sm-loading');window.__SM_READY_DONE__={branding:0,homepage:0};window.__smMarkReady=function(p){try{window.__SM_READY_DONE__[p]=1;var b=window.__SM_READY_DONE__.branding,h=window.__SM_READY_DONE__.homepage;var needH=(typeof applyHomePageData==='function')||document.getElementById('secHero')?1:0;if(b&&(needH?h:1)){document.documentElement.classList.remove('sm-loading');document.documentElement.classList.add('sm-ready');}}catch(e){try{document.documentElement.classList.remove('sm-loading');document.documentElement.classList.add('sm-ready');}catch(x){}}};setTimeout(function(){try{if(!document.documentElement.classList.contains('sm-ready')){document.documentElement.classList.remove('sm-loading');document.documentElement.classList.add('sm-ready');}}catch(e){}},3500);</script>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', flickerStyle + bootstrapScript + '</head>');
    }
    return bootstrapScript + html;
  } catch (e) { return html; }
}
const BOOTSTRAP_PAGES = ['/', '/index.html', '/courses.html', '/course.html', '/batch.html', '/ebook.html', '/ebooks.html', '/ebbatch.html', '/my-courses.html', '/learn.html', '/my-ebooks.html', '/auth.html', '/dashboard.html', '/cart.html', '/payment-success.html'];

/* ---------- Maintenance mode (Admin > Settings > Maintenance) ----------
 * ON thakle public pages maintenance.html dekhabe.
 * Admin panel (/admin.html), admin API, assets, uploads always open thakbe
 * jate admin kaj korte pare. Preview: ?preview=1 dile page dekha jabe. */
function isMaintenanceOn() {
  try {
    const s = store.load().settings || {};
    return s.maintenanceEnabled === true || s.maintenanceEnabled === 'true';
  } catch (e) { return false; }
}
function serveMaintenance(res) {
  try {
    let html = fs.readFileSync(path.join(__dirname, 'maintenance.html'), 'utf-8');
    html = injectBootstrap(html);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(503).send(html);
  } catch (e) { return res.status(503).send('Site maintenance cholche. Kichukkhon por abar aso.'); }
}
app.get(BOOTSTRAP_PAGES, (req, res, next) => {
  if (isMaintenanceOn() && req.query.preview !== '1') return serveMaintenance(res);
  const fileName = req.path === '/' ? 'index.html' : req.path.slice(1);
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) return next();
  try {
    let html = fs.readFileSync(filePath, 'utf-8');
    html = injectBootstrap(html);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.send(html);
  } catch (e) { return next(e); }
});

/* ---------- Static frontend (HTML pages, assets/) ---------- */
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache')
}));

/* ---------- Public maintenance status (frontend banner / polling) ---------- */
app.get('/api/public/maintenance-status', (req, res) => {
  const s = store.load().settings || {};
  const on = s.maintenanceEnabled === true || s.maintenanceEnabled === 'true';
  res.json({ success: true, data: {
    enabled: on,
    title: s.maintenanceTitle || '',
    message: s.maintenanceMessage || '',
    eta: s.maintenanceEta || ''
  }});
});

/* ---------- Health check ---------- */
app.get('/api/health', (req, res) => {  const db = store.load();
  res.json({
    success: true,
    status: 'ok',
    uptime: Math.round(process.uptime()) + 's',
    collections: Object.keys(db).filter(k => Array.isArray(db[k])).reduce((acc, k) => {
      acc[k] = db[k].length;
      return acc;
    }, {})
  });
});

/* ---------- 404 ---------- */
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API route not found: ' + req.originalUrl });
  }
  if (isMaintenanceOn()) return serveMaintenance(res);
  // 404-eo bootstrap inject kore pathano hoy — nahole purono hardcoded
  // template (logo/name/hero) flash korto
  try {
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    html = injectBootstrap(html);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(404).send(html);
  } catch (e) { return res.status(404).sendFile(path.join(__dirname, 'index.html')); }
});

/* ---------- Central error handler ---------- */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err.stack || err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

/* ---------- Crash guards (server never dies silently) ---------- */
process.on('unhandledRejection', reason => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', err => console.error('[uncaughtException]', err.stack || err.message));

/* ---------- Start ---------- */
app.listen(PORT, () => {
  const db = store.load();
  try { store.migrateMedia(); } catch (e) { console.error('[media]', e.message); }
  console.log('==================================================');
  console.log('  StudyMart server running');
  console.log('  Frontend : http://localhost:' + PORT);
  console.log('  Admin    : http://localhost:' + PORT + '/admin.html');
  console.log('  API      : http://localhost:' + PORT + '/api/health');
  console.log('  Admin login -> admin / admin123');
  console.log('  Data     : courses=' + db.courses.length + ' batches=' + db.batches.length +
    ' users=' + db.users.length + ' orders=' + db.orders.length);
  console.log('==================================================');
});
