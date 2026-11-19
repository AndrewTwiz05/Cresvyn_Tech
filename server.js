'use strict';
/**
 * Cresvyn Tech website server
 * - Serves the static site from /public
 * - POST /api/contact  -> validates, saves to data/messages.jsonl, emails you (if SMTP is configured)
 * - GET  /admin        -> password-protected inbox of every message received
 * - GET  /healthz      -> health check for hosting platforms
 */
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.jsonl');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const CONTACT_TO = process.env.CONTACT_TO || 'cresvyn.tech@gmail.com';

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- email (optional) ----------
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (Number(process.env.SMTP_PORT) || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  mailer.verify().then(
    () => console.log('✓ SMTP ready — enquiries will be emailed to', CONTACT_TO),
    (e) => console.warn('⚠ SMTP configured but not working:', e.message)
  );
} else {
  console.log('ℹ SMTP not configured — enquiries are saved to', MESSAGES_FILE, 'and visible at /admin');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind Render/Railway/Nginx/Cloudflare

// ---------- security headers ----------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ---------- static site ----------
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, file) {
    if (/\.(webp|png|jpg|jpeg|svg|woff2?)$/.test(file)) res.set('Cache-Control', 'public, max-age=2592000'); // 30 days
    else res.set('Cache-Control', 'public, max-age=300'); // html/css/js: 5 min
  },
}));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- rate limiting (in-memory, per IP) ----------
const hits = new Map();
const WINDOW_MS = 15 * 60 * 1000, MAX_PER_WINDOW = 5;
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_WINDOW;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < WINDOW_MS)) hits.delete(ip);
}, WINDOW_MS).unref();

// ---------- contact API ----------
const TOPICS = new Set(['General enquiry', 'NeoVoice enquiry', 'Drip Fix', 'ConsultLens', 'Pipeline / Glycosense',
  'Partnership / distribution', 'Investment', 'Careers']);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

app.post('/api/contact', express.json({ limit: '20kb' }), async (req, res) => {
  const body = req.body || {};
  if (body.website) return res.json({ ok: true }); // honeypot filled -> bot; pretend success
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many messages — please try again in a few minutes.' });

  const msg = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    name: clean(body.name, 100),
    email: clean(body.email, 200),
    organisation: clean(body.organisation, 150),
    topic: TOPICS.has(body.topic) ? body.topic : 'General enquiry',
    message: clean(body.message, 5000),
    ip: req.ip,
  };
  if (!msg.name || !msg.message) return res.status(400).json({ error: 'Please include your name and a message.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  try {
    await fs.promises.appendFile(MESSAGES_FILE, JSON.stringify(msg) + '\n');
  } catch (e) {
    console.error('Could not save message:', e);
    return res.status(500).json({ error: 'We could not save your message.' });
  }

  if (mailer) {
    mailer.sendMail({
      from: `"Cresvyn Website" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: CONTACT_TO,
      replyTo: `"${msg.name.replace(/"/g, '')}" <${msg.email}>`,
      subject: `[Website] ${msg.topic} — ${msg.name}`,
      text: `Name: ${msg.name}\nEmail: ${msg.email}\nOrganisation: ${msg.organisation || '-'}\nTopic: ${msg.topic}\n\n${msg.message}\n\n— Sent from the Cresvyn Tech website contact form`,
      html: `<table style="font-family:sans-serif;font-size:14px">
        <tr><td><b>Name</b></td><td>${esc(msg.name)}</td></tr>
        <tr><td><b>Email</b></td><td>${esc(msg.email)}</td></tr>
        <tr><td><b>Organisation</b></td><td>${esc(msg.organisation || '-')}</td></tr>
        <tr><td><b>Topic</b></td><td>${esc(msg.topic)}</td></tr></table>
        <p style="font-family:sans-serif;white-space:pre-wrap">${esc(msg.message)}</p>`,
    }).catch((e) => console.error('Email failed (message still saved):', e.message));
  }

  console.log(`✉ New enquiry from ${msg.name} <${msg.email}> — ${msg.topic}`);
  res.json({ ok: true });
});

// ---------- admin inbox ----------
function checkAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(404).send('Admin is disabled. Set ADMIN_PASSWORD to enable it.');
  const [type, encoded] = (req.headers.authorization || '').split(' ');
  const pass = type === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (crypto.timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Cresvyn admin"').status(401).send('Authentication required.');
}

async function readMessages() {
  try {
    const raw = await fs.promises.readFile(MESSAGES_FILE, 'utf8');
    return raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  } catch { return []; }
}

app.get('/admin', checkAdmin, async (req, res) => {
  const msgs = await readMessages();
  res.set('Cache-Control', 'no-store').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Cresvyn inbox</title><link rel="stylesheet" href="/admin.css"></head><body>
<header><h1>Website enquiries <span>${msgs.length}</span></h1><a href="/admin/export.csv">Download CSV</a></header>
<main>${msgs.length ? msgs.map((m) => `<article>
  <div class="meta"><strong>${esc(m.name)}</strong> · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.organisation ? ' · ' + esc(m.organisation) : ''}
  <span class="topic">${esc(m.topic)}</span><time>${new Date(m.receivedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</time></div>
  <p>${esc(m.message)}</p></article>`).join('') : '<p class="empty">No messages yet.</p>'}</main></body></html>`);
});

app.get('/admin/export.csv', checkAdmin, async (req, res) => {
  const msgs = await readMessages();
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['receivedAt', 'name', 'email', 'organisation', 'topic', 'message'],
    ...msgs.map((m) => [m.receivedAt, m.name, m.email, m.organisation, m.topic, m.message])];
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="cresvyn-enquiries.csv"', 'Cache-Control': 'no-store' })
    .send(rows.map((r) => r.map(q).join(',')).join('\n'));
});

// ---------- 404 ----------
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(PORT, () => console.log(`Cresvyn Tech site running on http://localhost:${PORT}`));
