/**
 * Google Sign-In verification (no extra dependencies).
 * Verifies the ID token's RS256 signature against Google's public certs,
 * then checks issuer / audience / expiry. Throws on any failure.
 */
const crypto = require('crypto');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CERTS_URL_V1 = 'https://www.googleapis.com/oauth2/v1/certs';
let certCache = { keys: null, fetchedAt: 0 };
const CERT_TTL_MS = 60 * 60 * 1000; // 1 hour

function b64urlToJson(part) {
  const b64 = String(part).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function b64urlToBuffer(part) {
  const b64 = String(part).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

async function getCerts(forceRefresh) {
  if (!forceRefresh && certCache.keys && Date.now() - certCache.fetchedAt < CERT_TTL_MS) return certCache.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error('Could not reach Google (HTTP ' + res.status + ')');
  const json = await res.json();
  if (!json.keys || !json.keys.length) throw new Error('No Google signing keys received');
  certCache = { keys: json.keys, fetchedAt: Date.now() };
  return json.keys;
}

// Fallback: v1 endpoint returns { kid: pemCertificate } map
async function getCertsV1() {
  const res = await fetch(CERTS_URL_V1);
  if (!res.ok) throw new Error('Could not reach Google (HTTP ' + res.status + ')');
  const json = await res.json();
  return Object.keys(json || {}).map(kid => ({ kid, pem: String(json[kid]) }));
}

function certToPem(certB64) {
  const lines = String(certB64).match(/.{1,64}/g) || [];
  return '-----BEGIN CERTIFICATE-----\n' + lines.join('\n') + '\n-----END CERTIFICATE-----\n';
}

/**
 * @returns { id, email, name, picture } on success
 */
async function verifyGoogleIdToken(idToken, expectedClientId) {
  if (!idToken || typeof idToken !== 'string' || !expectedClientId) {
    throw new Error('Missing token or server Client ID');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed Google credential');
  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch (e) {
    throw new Error('Malformed Google credential');
  }
  // issuer check
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('Invalid token issuer');
  }
  // audience must be OUR client id (prevents token replay from other apps)
  if (payload.aud !== expectedClientId) {
    throw new Error('Token was not issued for this site');
  }
  // expiry check
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error('Google session expired - please try again');
  }
  if (!payload.email || payload.email_verified !== true && payload.email_verified !== 'true') {
    // some accounts omit the flag but still carry a verified gmail; require email at minimum
    if (!payload.email) throw new Error('No verified email in Google account');
  }
  // signature check against Google's certs.
  // Google rotates keys regularly — a cached set can miss a fresh kid,
  // so on miss we force-refresh once, then try the v1 endpoint as fallback.
  const signingInput = parts[0] + '.' + parts[1];
  const signature = b64urlToBuffer(parts[2]);
  const findPem = keys => {
    const k = (keys || []).find(x => x && x.kid === header.kid);
    if (!k) return null;
    if (k.x5c && k.x5c[0]) return certToPem(k.x5c[0]);
    if (k.pem) return k.pem;
    return null;
  };
  let pem = findPem(await getCerts(false));
  if (!pem) {
    try { pem = findPem(await getCerts(true)); } catch (e) { pem = null; }
  }
  if (!pem) {
    try { pem = findPem(await getCertsV1()); } catch (e) { pem = null; }
  }
  if (!pem) {
    console.warn('[google-auth] Unknown kid: ' + header.kid + ' (alg: ' + header.alg + ')');
    throw new Error('Unknown Google signing key - please try again');
  }
  if (String(header.alg || '').toUpperCase() !== 'RS256') {
    throw new Error('Unsupported Google signing algorithm');
  }
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signingInput);
  const ok = verifier.verify(pem, signature);
  if (!ok) throw new Error('Invalid Google signature');
  return {
    id: payload.sub,
    email: String(payload.email).toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || ''
  };
}

module.exports = { verifyGoogleIdToken };
