/**
 * PipaPay payment gateway integration (docs: docs.piprapay.com).
 *
 * Flow:
 *  1. createCharge() -> { pp_id, pp_url } -> redirect student to pp_url
 *  2. After payment PipaPay redirects back to our redirect_url with pp_id
 *     (GET or POST per return_type) -> verifyPayment({ pp_id })
 *  3. status === 'completed' + amount match => mark order as paid.
 */

const SANDBOX_URL = 'https://sandbox.piprapay.com';

function baseUrl(settings) {
  const u = String((settings && settings.piprapayBaseUrl) || '').trim().replace(/\/+$/, '');
  return u || SANDBOX_URL;
}

function apiKey(settings) {
  return String((settings && settings.piprapayApiKey) || '').trim();
}

function isEnabled(settings) {
  return !!(settings && settings.piprapayEnabled) && !!apiKey(settings);
}

async function callApi(url, key, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'mh-piprapay-api-key': key },
    body: JSON.stringify(body)
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) {
    const msg = (j && j.error && j.error.message) || (j && j.message) || ('PipaPay request failed (HTTP ' + r.status + ')');
    const err = new Error(msg);
    err.status = r.status;
    err.data = j;
    throw err;
  }
  return j;
}

async function createCharge(settings, opts) {
  const key = apiKey(settings);
  if (!key) throw new Error('PipaPay API key is not configured');
  const base = baseUrl(settings);
  const payload = {
    full_name: String(opts.fullName || 'Student'),
    email_mobile: String(opts.emailMobile || ''),
    amount: String(opts.amount),
    metadata: { invoice_id: String(opts.invoiceId || '') },
    redirect_url: opts.redirectUrl,
    cancel_url: opts.cancelUrl,
    return_type: opts.returnType || 'GET',
    webhook_url: opts.webhookUrl || '',
    currency: opts.currency || 'BDT'
  };
  const j = await callApi(base + '/api/create-charge', key, payload);
  if (!j || j.status !== true || !j.pp_url) {
    throw new Error((j && j.message) || 'PipaPay did not return a payment URL');
  }
  return { pp_id: j.pp_id, pp_url: j.pp_url, raw: j };
}

async function verifyPayment(settings, ppId) {
  const key = apiKey(settings);
  if (!key) throw new Error('PipaPay API key is not configured');
  if (!ppId) throw new Error('Missing transaction id (pp_id)');
  const base = baseUrl(settings);
  const j = await callApi(base + '/api/verify-payment', key, { pp_id: String(ppId) });
  return j;
}

module.exports = { SANDBOX_URL, baseUrl, apiKey, isEnabled, createCharge, verifyPayment };
