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
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  const result = auth.loginAdmin(username, password);
  if (!result) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
  res.json({ success: true, message: 'Login successful', token: result.token, data: result.admin });
});

app.post('/api/admin/logout', (req, res) => {
  auth.destroySession(auth.getToken(req));
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/admin/me', auth.requireAdmin, (req, res) => {
  res.json({ success: true, data: { id: req.session.id, name: req.session.name, username: req.session.username } });
});

/* ---------- API routes ---------- */
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);   // used by the public website (assets/app.js)
app.use('/api', publicRoutes);          // legacy/short paths: /api/courses, /api/batches ...

/* ---------- Bootstrap injection (prevent flicker - old template blink) ---------- */
const fs = require('fs');
function injectBootstrap(html) {
  try {
    const db = store.load();
    const safeSettings = Object.assign({}, db.settings || {});
    delete safeSettings.piprapayApiKey; // never expose gateway secret to the browser
    const bootstrap = {
      settings: safeSettings,
      homePage: db.homePage || store.defaultHomePage()
    };
    const json = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
    const bootstrapScript = `<script>window.__SM_BOOTSTRAP__=${json};</script>`;
    const flickerStyle = `<style>html.sm-loading #secHero{opacity:0}html.sm-loading #siteLogoImg,html.sm-loading #siteLogoFallback{opacity:0}html.sm-ready #secHero{opacity:1;transition:opacity .18s ease}</style><script>document.documentElement.classList.add('sm-loading');</script>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', flickerStyle + bootstrapScript + '</head>');
    }
    return bootstrapScript + html;
  } catch (e) { return html; }
}
const BOOTSTRAP_PAGES = ['/', '/index.html', '/courses.html', '/course.html', '/batch.html', '/ebook.html', '/ebooks.html', '/auth.html', '/dashboard.html', '/cart.html', '/payment-success.html'];
app.get(BOOTSTRAP_PAGES, (req, res, next) => {
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

/* ---------- Health check ---------- */
app.get('/api/health', (req, res) => {
  const db = store.load();
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
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
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
