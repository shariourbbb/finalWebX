/**
 * Authentication: password hashing (crypto scrypt) + in-memory sessions.
 * Admin and user sessions share the same token map, differentiated by role.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const SESSIONS_PATH = path.join(__dirname, '..', 'data', 'sessions.json');
const sessions = new Map(); // token -> { id, role, name, email, username, expiresAt }

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_PATH)) {
      const raw = fs.readFileSync(SESSIONS_PATH, 'utf-8');
      const data = JSON.parse(raw || '{}');
      const now = Date.now();
      for (const [tok, s] of Object.entries(data)) {
        if (!s.expiresAt || s.expiresAt > now) {
          sessions.set(tok, s);
        }
      }
    }
  } catch (e) {
    console.error('[auth] Failed to load sessions:', e.message);
  }
}

function saveSessions() {
  try {
    const obj = {};
    const now = Date.now();
    for (const [tok, s] of sessions.entries()) {
      if (!s.expiresAt || s.expiresAt > now) {
        obj[tok] = s;
      }
    }
    fs.mkdirSync(path.dirname(SESSIONS_PATH), { recursive: true });
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.error('[auth] Failed to save sessions:', e.message);
  }
}

// Load saved sessions on startup
loadSessions();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  // Support plain-text legacy values (e.g. default admin password in db.json)
  if (!String(stored).includes(':')) {
    return String(stored) === String(password) || String(stored) === String(password).trim();
  }
  const [salt, hash] = String(stored).split(':');
  try {
    const test = crypto.scryptSync(String(password), salt, 32).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(test, 'hex');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;

    // Fallback: verify with trimmed password if user accidentally typed space
    if (String(password).trim() !== String(password)) {
      const testTrim = crypto.scryptSync(String(password).trim(), salt, 32).toString('hex');
      const bTrim = Buffer.from(testTrim, 'hex');
      if (a.length === bTrim.length && crypto.timingSafeEqual(a, bTrim)) return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

function createSession(payload, ttlMs = 30 * 24 * 60 * 60 * 1000) { // 30 days session
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Object.assign({ token, expiresAt: Date.now() + ttlMs }, payload));
  saveSessions();
  return token;
}

function destroySession(token) {
  const res = sessions.delete(token);
  saveSessions();
  return res;
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.headers['x-auth-token'] || '';
}

function getSession(req) {
  const token = getToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt && session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session || session.role !== 'admin') {
    return res.status(401).json({ success: false, message: 'Unauthorized. Admin login required.' });
  }
  req.session = session;
  next();
}

function requireUser(req, res, next) {
  const session = getSession(req);
  if (!session || (session.role !== 'user' && session.role !== 'admin')) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Please login first.' });
  }
  if (session.role === 'user') {
    const user = store.find('users', session.id);
    if (user && (user.status === 'banned' || user.status === 'blocked')) {
      return res.status(403).json({ success: false, message: 'Your account has been banned/blocked. Please contact support.' });
    }
  }
  req.session = session;
  next();
}

function optionalUser(req, res, next) {
  req.session = getSession(req) || null;
  next();
}

function publicAdmin(admin) {
  return { id: admin.id, username: admin.username, name: admin.name, role: admin.role };
}

function publicUser(user) {
  const { password, ...rest } = user;
  return rest;
}

function loginAdmin(username, password) {
  const admin = store.findBy('admins', 'username', username || '');
  if (!admin || !verifyPassword(password, admin.password)) return null;
  // Upgrade plain-text password to hashed on first successful login
  if (!String(admin.password).includes(':')) {
    admin.password = hashPassword(password);
    store.save();
  }
  const token = createSession({ id: admin.id, role: 'admin', name: admin.name, username: admin.username });
  return { token, admin: publicAdmin(admin) };
}

function loginUser(email, password) {
  const user = store.findBy('users', 'email', email || '');
  if (!user) return null;
  if (!verifyPassword(password, user.password)) return null;
  if (user.status === 'blocked') return null;
  const token = createSession({ id: user.id, role: 'user', name: user.name, email: user.email });
  return { token, user: publicUser(user) };
}

module.exports = {
  hashPassword, verifyPassword,
  createSession, destroySession, getSession, getToken,
  requireAdmin, requireUser, optionalUser,
  publicAdmin, publicUser,
  loginAdmin, loginUser,
  sessions
};
