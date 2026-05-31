// ============================================================
// SuSayar SaaS Backend
// Yerel: SQLite | Production: PostgreSQL (DATABASE_URL)
// ============================================================

require('dotenv').config();
const express           = require('express');
const http              = require('http');
const { WebSocketServer } = require('ws');
const cors              = require('cors');
const helmet            = require('helmet');
const rateLimit         = require('express-rate-limit');
const path              = require('path');
const bcrypt            = require('bcryptjs');
const jwt               = require('jsonwebtoken');
const { randomUUID }    = require('crypto');
const { Resend }        = require('resend');
const Anthropic         = require('@anthropic-ai/sdk');
const speakeasy         = require('speakeasy');
const QRCode            = require('qrcode');
const cookieParser      = require('cookie-parser');
const db                = require('./db');

// ── E-posta ───────────────────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
const MAIL_FROM      = process.env.SMTP_FROM || 'SuSayar <noreply@susayar.com>';

function mailHtml({ title, body }) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">
<tr><td style="background:linear-gradient(135deg,#0e6e87,#1a9dbd);border-radius:16px 16px 0 0;padding:28px 40px;text-align:center">
<table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
<td style="padding-right:9px;vertical-align:middle"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 22 30"><path d="M11,2 C11,2 20,13 20,19 A9,9 0 0,1 2,19 C2,13 11,2 11,2 Z" fill="white"/></svg></td>
<td style="vertical-align:middle"><span style="font-size:20px;font-weight:900;color:white;letter-spacing:-.01em">SuSayar</span></td>
</tr></table>
<div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:6px">${title}</div>
</td></tr>
<tr><td style="background:white;padding:36px 40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">${body}</td></tr>
<tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center">
<p style="margin:0 0 4px;color:rgba(255,255,255,.4);font-size:12px">© ${new Date().getFullYear()} SuSayar · İstanbul, Türkiye</p>
<a href="https://www.susayar.com" style="color:#3bb5d4;font-size:12px;text-decoration:none">www.susayar.com</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendMail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[MAIL] RESEND_API_KEY ayarlı değil. Alıcı: ${to} | Konu: ${subject}`);
    return false;
  }
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: MAIL_FROM, to, subject, html });
  if (error) { console.error('[MAIL] Hata:', error); return false; }
  console.log(`[MAIL] Gönderildi → ${to}`);
  return true;
}

// ── Konfigürasyon ─────────────────────────────────────────────
const PORT       = parseInt(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[HATA] JWT_SECRET ortam değişkeni ayarlanmamış! Render > Environment > JWT_SECRET ekleyin.');
  process.exit(1);
}
const CORS_ORIGINS = process.env.CORS_ORIGINS || 'https://www.susayar.com,https://susayar.com';

// ── Rate Limiter'lar ──────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 20,
  message: { error: 'Çok fazla istek gönderildi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true, legacyHeaders: false,
});

const sensorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 60,             // ESP32 her 5 sn'de bir gönderir = 12/dk, 60 limit yeterli
  message: { error: 'Sensör hız limiti aşıldı.' },
  standardHeaders: true, legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10,                   // 10 deneme — brute force önlemi
  message: { error: 'Çok fazla OTP denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true, legacyHeaders: false,
});

// ── Express ───────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // Render reverse proxy arkasında çalışır
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false, // Helmet varsayılanlarını karıştırma
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // onclick, onsubmit gibi inline handler'lara izin ver
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // extern resimler için
})); // güvenlik headerları
app.use(cors({
  origin: CORS_ORIGINS.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '10kb' })); // body boyutu sınırı
app.use(cookieParser()); // signed cookie desteği
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'susayar-landing.html')));
// ── Admin TOTP oturumu ────────────────────────────────────────
function adminLoginPage(error) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SuSayar Admin Girişi</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0f172a;font-family:'Segoe UI',system-ui,sans-serif}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;
          padding:40px 36px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
    h1{color:#38bdf8;font-size:1.5rem;font-weight:700;margin-bottom:6px;text-align:center}
    p.sub{color:#94a3b8;font-size:.85rem;text-align:center;margin-bottom:28px}
    label{display:block;color:#cbd5e1;font-size:.82rem;font-weight:600;margin-bottom:6px}
    input{width:100%;padding:10px 14px;border-radius:8px;border:1px solid #475569;
          background:#0f172a;color:#f1f5f9;font-size:1rem;margin-bottom:18px;outline:none}
    input:focus{border-color:#38bdf8}
    button{width:100%;padding:12px;background:#0ea5e9;color:#fff;border:none;
           border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:.2s}
    button:hover{background:#0284c7}
    .err{color:#f87171;font-size:.82rem;text-align:center;margin-top:-10px;margin-bottom:14px}
    .hint{color:#64748b;font-size:.75rem;text-align:center;margin-top:18px}
  </style>
</head>
<body>
  <div class="card">
    <h1>🔐 Admin Girişi</h1>
    <p class="sub">SuSayar yönetici paneli</p>
    <form method="POST" action="/admin/login">
      <label>Yönetici Şifresi</label>
      <input type="password" name="secret" placeholder="••••••••" required autocomplete="current-password">
      <label>Google Authenticator Kodu</label>
      <input type="text" name="totp" placeholder="6 haneli kod" maxlength="6" pattern="[0-9]{6}" required
             autocomplete="one-time-code" inputmode="numeric">
      ${error ? `<p class="err">${error}</p>` : ''}
      <button type="submit">Giriş Yap</button>
    </form>
  </div>
</body>
</html>`;
}

function isAdminAuthenticated(req) {
  try {
    const token = req.cookies && req.cookies['admin_session'];
    if (!token) return false;
    const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (!data.sig || !data.exp || !data.ts) return false;
    if (Date.now() > data.exp) return false;
    // imzayı doğrula
    const { createHmac } = require('crypto');
    const expected = createHmac('sha256', COOKIE_SECRET).update(`admin:${data.ts}`).digest('hex');
    return data.sig === expected;
  } catch { return false; }
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.',
});

// Admin sayfası — cookie kontrolü + secret enjeksiyonu
app.get('/admin', (req, res) => {
  if (!isAdminAuthenticated(req)) return res.redirect('/admin/login');
  const fs = require('fs');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'susayar-admin.html'), 'utf8');
  // Sayfa yüklenince şifreyi enjekte et ve login ekranını atla
  const inject = `<script>
window.__ADMIN_SECRET__ = ${JSON.stringify(ADMIN_SECRET)};
window.addEventListener('DOMContentLoaded', function() {
  if (window.__ADMIN_SECRET__ && typeof adminSecret !== 'undefined') {
    adminSecret = window.__ADMIN_SECRET__;
    sessionStorage.setItem('admin_secret', adminSecret);
    if (typeof showAdmin === 'function') showAdmin();
  }
});
</script>`;
  res.send(html.replace('</head>', inject + '</head>'));
});

// Giriş formu
app.get('/admin/login', (req, res) => {
  if (isAdminAuthenticated(req)) return res.redirect('/admin');
  res.send(adminLoginPage());
});

// Giriş işlemi
app.post('/admin/login', adminLoginLimiter, express.urlencoded({ extended: false }), (req, res) => {
  const { secret, totp } = req.body;
  if (!secret || secret !== ADMIN_SECRET) {
    return res.send(adminLoginPage('Yönetici şifresi hatalı.'));
  }
  if (!ADMIN_TOTP_SECRET) {
    return res.send(adminLoginPage('TOTP henüz kurulmamış. Önce /admin/setup adresini ziyaret edin.'));
  }
  const valid = speakeasy.totp.verify({
    secret: ADMIN_TOTP_SECRET,
    encoding: 'base32',
    token: String(totp).trim(),
    window: 1, // ±30 saniye tolerans
  });
  if (!valid) {
    return res.send(adminLoginPage('Google Authenticator kodu hatalı veya süresi dolmuş.'));
  }
  // Oturum cookie oluştur
  const { createHmac } = require('crypto');
  const ts  = Date.now();
  const exp = ts + ADMIN_SESSION_TTL;
  const sig = createHmac('sha256', COOKIE_SECRET).update(`admin:${ts}`).digest('hex');
  const token = Buffer.from(JSON.stringify({ ts, exp, sig })).toString('base64');
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ADMIN_SESSION_TTL,
  });
  res.redirect('/admin');
});

// Çıkış
app.post('/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.redirect('/admin/login');
});

// İlk kurulum — şifre formu ile korunur (URL'de secret yok)
app.get('/admin/setup', (req, res) => {
  res.send(adminSetupFormPage());
});

app.post('/admin/setup', adminLoginLimiter, express.urlencoded({ extended: false }), async (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== ADMIN_SECRET) {
    return res.send(adminSetupFormPage('Yönetici şifresi hatalı.'));
  }
  if (ADMIN_TOTP_SECRET) {
    const otpauth = speakeasy.otpauthURL({
      secret: ADMIN_TOTP_SECRET,
      label: 'SuSayar Admin',
      issuer: 'SuSayar',
      encoding: 'base32',
    });
    const qr = await QRCode.toDataURL(otpauth);
    return res.send(adminSetupPage(ADMIN_TOTP_SECRET, qr, false));
  }
  const generated = speakeasy.generateSecret({ name: 'SuSayar Admin', issuer: 'SuSayar', length: 20 });
  const qr = await QRCode.toDataURL(generated.otpauth_url);
  res.send(adminSetupPage(generated.base32, qr, true));
});

function adminSetupFormPage(error) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SuSayar Admin TOTP Kurulum</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0f172a;font-family:'Segoe UI',system-ui,sans-serif}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;
          padding:40px 36px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
    h1{color:#38bdf8;font-size:1.4rem;font-weight:700;margin-bottom:6px;text-align:center}
    p.sub{color:#94a3b8;font-size:.85rem;text-align:center;margin-bottom:28px;line-height:1.6}
    label{display:block;color:#cbd5e1;font-size:.82rem;font-weight:600;margin-bottom:6px}
    input{width:100%;padding:10px 14px;border-radius:8px;border:1px solid #475569;
          background:#0f172a;color:#f1f5f9;font-size:1rem;margin-bottom:18px;outline:none}
    input:focus{border-color:#38bdf8}
    button{width:100%;padding:12px;background:#0ea5e9;color:#fff;border:none;
           border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:.2s}
    button:hover{background:#0284c7}
    .err{color:#f87171;font-size:.82rem;text-align:center;margin-bottom:14px}
  </style>
</head>
<body>
  <div class="card">
    <h1>🔑 TOTP Kurulum</h1>
    <p class="sub">Google Authenticator QR kodunu almak için yönetici şifresini girin.</p>
    <form method="POST" action="/admin/setup">
      <label>Yönetici Şifresi</label>
      <input type="password" name="secret" placeholder="••••••••" required autocomplete="current-password">
      ${error ? `<p class="err">${error}</p>` : ''}
      <button type="submit">Devam Et</button>
    </form>
  </div>
</body>
</html>`;
}

function adminSetupPage(base32, qrDataUrl, isNew) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SuSayar Admin TOTP Kurulum</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0f172a;font-family:'Segoe UI',system-ui,sans-serif;padding:24px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;
          padding:36px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.5);text-align:center}
    h1{color:#38bdf8;font-size:1.4rem;font-weight:700;margin-bottom:8px}
    p{color:#94a3b8;font-size:.88rem;margin-bottom:20px;line-height:1.6}
    img{border-radius:12px;margin-bottom:20px;max-width:220px}
    .secret{background:#0f172a;border:1px solid #475569;border-radius:8px;
            padding:12px 16px;font-family:monospace;font-size:1rem;
            color:#a5f3fc;letter-spacing:.15em;word-break:break-all;margin-bottom:20px}
    .warn{background:#422006;border:1px solid #92400e;border-radius:8px;
          padding:12px 16px;color:#fbbf24;font-size:.82rem;margin-bottom:20px}
    ol{text-align:left;color:#cbd5e1;font-size:.85rem;line-height:2;padding-left:20px;margin-bottom:20px}
    .env{background:#0f172a;border:1px solid #475569;border-radius:8px;
         padding:10px 14px;font-family:monospace;font-size:.82rem;color:#86efac;text-align:left}
  </style>
</head>
<body>
  <div class="card">
    <h1>🔑 Google Authenticator Kurulum</h1>
    <p>${isNew ? 'Yeni TOTP secret üretildi. Bu sayfayı kaydedin, bir daha gösterilmeyecek.' : 'Mevcut TOTP yapılandırması.'}</p>
    <img src="${qrDataUrl}" alt="QR Kod">
    <p style="margin-bottom:8px"><strong style="color:#f1f5f9">Manuel giriş kodu:</strong></p>
    <div class="secret">${base32}</div>
    ${isNew ? `<div class="warn">⚠️ Bu secret'ı şimdi Render > Environment'a ekleyin:</div>
    <div class="env">ADMIN_TOTP_SECRET=${base32}</div>
    <br>` : ''}
    <ol>
      <li>Google Authenticator uygulamasını açın</li>
      <li>"+" → "QR kodu tara" seçin</li>
      <li>Yukarıdaki QR kodu taratın</li>
      <li>Render > Environment > <code>ADMIN_TOTP_SECRET</code> = <code>${base32}</code></li>
      <li>Servisi yeniden başlatın</li>
      <li><a href="/admin/login" style="color:#38bdf8">/admin/login</a> adresinden giriş yapın</li>
    </ol>
  </div>
</body>
</html>`;
}

// ── Middleware ────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Yetkilendirme gerekli' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' }); }
}

async function requireDeviceKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'X-API-Key header gerekli' });
  const device = await db.queryOne(`SELECT * FROM devices WHERE api_key = $1`, [key]);
  if (!device) return res.status(401).json({ error: 'Geçersiz API anahtarı' });
  req.device = device;
  next();
}

function broadcastToUser(userId, msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1 && c.userId === userId) c.send(str); });
}

// ── Auth ──────────────────────────────────────────────────────

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur' });
    if (!phone) return res.status(400).json({ error: 'Telefon numarası zorunludur' });
    if (name.trim().length > 100) return res.status(400).json({ error: 'Ad en fazla 100 karakter olabilir' });
    if (email.length > 254) return res.status(400).json({ error: 'Geçersiz e-posta' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçersiz e-posta formatı' });
    if (password.length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır' });
    if (password.length > 128) return res.status(400).json({ error: 'Şifre en fazla 128 karakter olabilir' });
    const exists = await db.queryOne(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (exists) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });
    const hash = await bcrypt.hash(password, 10);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 dk
    const user = { id: randomUUID(), name: name.trim(), email: email.toLowerCase().trim(), password: hash, phone: phone.trim(), created_at: new Date().toISOString() };
    await db.queryRun(
      `INSERT INTO users (id,name,email,password,phone,email_otp,email_otp_expires,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [user.id, user.name, user.email, user.password, user.phone, otp, otpExpires, user.created_at]
    );
    // OTP e-postası gönder
    const sent = await sendMail({
      to: user.email,
      subject: 'SuSayar — E-posta Doğrulama Kodunuz',
      html: mailHtml({ title: 'E-posta Doğrulama', body: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 12px">Merhaba <strong>${user.name}</strong>,</p>
        <p style="font-size:14px;color:#475569;margin:0 0 24px">Kaydınızı tamamlamak için aşağıdaki doğrulama kodunu girin.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:28px;text-align:center;margin:0 0 24px">
          <div style="font-size:38px;font-weight:900;letter-spacing:10px;color:#0f172a;font-family:monospace">${otp}</div>
          <p style="margin:10px 0 0;font-size:12px;color:#94a3b8">Bu kod 10 dakika geçerlidir</p>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin:0">Bu kaydı siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
      ` }),
    });
    if (!sent) console.log(`[AUTH] OTP gönderilemedi → ${user.email}`);
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[AUTH] Kayıt: ${user.email}`);
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, phone_verified: 0 }, needsVerification: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// OTP doğrula
app.post('/api/auth/verify-otp', otpLimiter, requireAuth, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'Kod zorunludur' });
    const user = await db.queryOne(
      `SELECT id, email_otp, email_otp_expires, phone_verified FROM users WHERE id=$1`, [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (user.phone_verified === 1 || user.phone_verified === true) return res.json({ ok: true, already: true });
    if (!user.email_otp || user.email_otp !== otp.trim())
      return res.status(400).json({ error: 'Kod hatalı' });
    if (new Date(user.email_otp_expires) < new Date())
      return res.status(400).json({ error: 'Kodun süresi dolmuş' });
    await db.queryRun(`UPDATE users SET phone_verified=1, email_otp=NULL, email_otp_expires=NULL WHERE id=$1`, [req.user.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// OTP yeniden gönder
app.post('/api/auth/resend-otp', authLimiter, requireAuth, async (req, res) => {
  try {
    const user = await db.queryOne(`SELECT name, email, phone_verified FROM users WHERE id=$1`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (user.phone_verified === 1 || user.phone_verified === true) return res.json({ ok: true, already: true });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await db.queryRun(`UPDATE users SET email_otp=$1, email_otp_expires=$2 WHERE id=$3`, [otp, otpExpires, req.user.id]);
    const sent = await sendMail({
      to: user.email,
      subject: 'SuSayar — Yeni Doğrulama Kodunuz',
      html: mailHtml({ title: 'E-posta Doğrulama', body: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 12px">Merhaba <strong>${user.name}</strong>,</p>
        <p style="font-size:14px;color:#475569;margin:0 0 24px">Yeni doğrulama kodunuz aşağıda.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:28px;text-align:center;margin:0 0 24px">
          <div style="font-size:38px;font-weight:900;letter-spacing:10px;color:#0f172a;font-family:monospace">${otp}</div>
          <p style="margin:10px 0 0;font-size:12px;color:#94a3b8">Bu kod 10 dakika geçerlidir</p>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin:0">Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
      ` }),
    });
    if (!sent) console.log(`[AUTH] OTP yeniden gönderilemedi → ${user.email}`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-posta ve şifre zorunludur' });
    const user = await db.queryOne(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[AUTH] Giriş: ${user.email}`);
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// Şifremi unuttum
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-posta zorunludur' });
    const user = await db.queryOne(`SELECT id FROM users WHERE email=$1`, [email.toLowerCase().trim()]);
    // Güvenlik: kullanıcı yoksa da aynı mesajı ver
    if (user) {
      const token = randomUUID().replace(/-/g, '');
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 saat
      await db.queryRun(`UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3`, [token, expires, user.id]);
      const appUrl = process.env.APP_URL || 'https://www.susayar.com';
      const resetUrl = `${appUrl}/susayar-auth.html?reset_token=${token}`;
      const u = await db.queryOne(`SELECT name FROM users WHERE id=$1`, [user.id]);
      const sent = await sendMail({
        to: email,
        subject: 'SuSayar — Şifre Sıfırlama',
        html: mailHtml({ title: 'Şifre Sıfırlama', body: `
          <p style="font-size:16px;color:#1e293b;margin:0 0 12px">Merhaba${u ? ' <strong>' + u.name + '</strong>' : ''},</p>
          <p style="font-size:14px;color:#475569;margin:0 0 28px">Hesabınızın şifresini sıfırlamak için aşağıdaki butona tıklayın. Link <strong>1 saat</strong> geçerlidir.</p>
          <div style="text-align:center;margin:0 0 28px">
            <a href="${resetUrl}" style="display:inline-block;background:#3bb5d4;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Şifremi Sıfırla</a>
          </div>
          <p style="font-size:12px;color:#94a3b8;margin:0">Bu isteği siz yapmadıysanız bu e-postayı güvenle görmezden gelebilirsiniz.</p>
        ` }),
      });
      if (!sent) console.log(`[RESET] Şifre sıfırlama linki: ${resetUrl}`);
    }
    res.json({ ok: true, message: 'Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// Şifre sıfırla
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token ve şifre zorunludur' });
    if (password.length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır' });
    const user = await db.queryOne(
      `SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires>$2`,
      [token, new Date().toISOString()]
    );
    if (!user) return res.status(400).json({ error: 'Link geçersiz veya süresi dolmuş' });
    const hash = await bcrypt.hash(password, 10);
    await db.queryRun(`UPDATE users SET password=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2`, [hash, user.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// Profil güncelle
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { name, current_password, new_password } = req.body;
    const user = await db.queryOne(`SELECT * FROM users WHERE id=$1`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (name && name.trim().length < 2) return res.status(400).json({ error: 'Ad en az 2 karakter olmalıdır' });
    if (new_password) {
      if (!current_password) return res.status(400).json({ error: 'Mevcut şifre gerekli' });
      if (!(await bcrypt.compare(current_password, user.password))) return res.status(401).json({ error: 'Mevcut şifre hatalı' });
      if (new_password.length < 8) return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalıdır' });
      const hash = await bcrypt.hash(new_password, 10);
      await db.queryRun(`UPDATE users SET password=$1 WHERE id=$2`, [hash, req.user.id]);
    }
    if (name && name.trim() !== user.name) {
      await db.queryRun(`UPDATE users SET name=$1 WHERE id=$2`, [name.trim(), req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await db.queryOne(`SELECT id, name, email, plan, phone, phone_verified FROM users WHERE id=$1`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ ok: true, user });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Cihaz Yönetimi ────────────────────────────────────────────

app.get('/api/devices', requireAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const devs = await db.queryAll(
      `SELECT d.id, d.name, d.device_id, d.api_key, d.last_seen, d.rssi_dbm, d.created_at,
        (SELECT r.flow_lpm FROM readings r WHERE r.device_id=d.device_id AND r.user_id=d.user_id ORDER BY r.ts DESC LIMIT 1) AS flow_lpm,
        COALESCE((SELECT SUM((r.flow_lpm/60.0)*2.5) FROM readings r WHERE r.device_id=d.device_id AND r.user_id=d.user_id AND r.ts>=$2), 0) AS today_liters
       FROM devices d WHERE d.user_id=$1 ORDER BY d.created_at DESC`,
      [req.user.id, todayStart.toISOString()]
    );
    res.json(devs);
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

const PLAN_LIMITS = { starter: 0, individual: 1 };

app.post('/api/devices', requireAuth, async (req, res) => {
  try {
    const { name, device_id } = req.body;
    if (!name || !device_id) return res.status(400).json({ error: 'name ve device_id zorunludur' });
    if (name.trim().length > 64) return res.status(400).json({ error: 'Cihaz adı en fazla 64 karakter olabilir' });
    if (device_id.trim().length > 64) return res.status(400).json({ error: 'Device ID en fazla 64 karakter olabilir' });
    // Plan limiti kontrolü
    const user = await db.queryOne(`SELECT plan FROM users WHERE id=$1`, [req.user.id]);
    const limit = PLAN_LIMITS[user?.plan || 'starter'] ?? 0;
    const count = await db.queryOne(`SELECT COUNT(*) as n FROM devices WHERE user_id=$1`, [req.user.id]);
    if (parseInt(count?.n || 0) >= limit) return res.status(403).json({ error: `Plan limitine ulaştınız (maks ${limit} cihaz)` });
    const exists = await db.queryOne(`SELECT id FROM devices WHERE device_id = $1`, [device_id.trim()]);
    if (exists) return res.status(409).json({ error: 'Bu device_id zaten kayıtlı' });
    const dev = {
      id: randomUUID(), user_id: req.user.id, name: name.trim(),
      device_id: device_id.trim(), api_key: randomUUID().replace(/-/g,''),
      created_at: new Date().toISOString(),
    };
    await db.queryRun(
      `INSERT INTO devices (id,user_id,name,device_id,api_key,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [dev.id, dev.user_id, dev.name, dev.device_id, dev.api_key, dev.created_at]
    );
    console.log(`[DEVICE] Yeni: ${dev.device_id} → ${req.user.email}`);
    res.json({ ok: true, device: dev });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.patch('/api/devices/:id', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Cihaz adı boş olamaz' });
    const n = await db.queryRun(
      `UPDATE devices SET name=$1 WHERE id=$2 AND user_id=$3`,
      [name.trim(), req.params.id, req.user.id]
    );
    if (!n) return res.status(404).json({ error: 'Cihaz bulunamadı' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.delete('/api/devices/:id', requireAuth, async (req, res) => {
  try {
    const n = await db.queryRun(`DELETE FROM devices WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    if (!n) return res.status(404).json({ error: 'Bulunamadı' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Anomaliler ────────────────────────────────────────────────
app.get('/api/anomalies', requireAuth, async (req, res) => {
  try {
    const device = req.query.device;
    const rows = device
      ? await db.queryAll(`SELECT * FROM anomalies WHERE user_id=$1 AND device=$2 ORDER BY id DESC LIMIT 50`, [req.user.id, device])
      : await db.queryAll(`SELECT * FROM anomalies WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [req.user.id]);
    res.json(rows.map(db.normalizeAnomaly));
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.put('/api/anomalies/:id/resolve', requireAuth, async (req, res) => {
  try {
    const row = await db.queryOne(`SELECT resolved FROM anomalies WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Bulunamadı' });
    const newVal = (row.resolved === true || row.resolved === 1) ? 0 : 1;
    await db.queryRun(`UPDATE anomalies SET resolved=$1 WHERE id=$2 AND user_id=$3`, [newVal, req.params.id, req.user.id]);
    res.json({ ok: true, resolved: !!newVal });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/anomalies/:id/notify', requireAuth, async (req, res) => {
  try {
    const a = await db.queryOne(`SELECT * FROM anomalies WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    if (!a) return res.status(404).json({ error: 'Bulunamadı' });
    const s = await db.queryOne(`SELECT notify_telegram, telegram_chat_id FROM user_settings WHERE user_id=$1`, [req.user.id]);
    if (!s?.telegram_chat_id) return res.status(400).json({ error: 'Telegram Chat ID ayarlı değil' });
    if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(500).json({ error: 'Bot token sunucuda tanımlı değil' });
    const LABELS = { 'yuksek-akis':'Yüksek Akış','surekli-akis':'Sürekli Akış','kacak':'Sızıntı Tespiti','gece-akis':'Gece Akışı','saat-akis':'Saat Uyarısı' };
    const label = LABELS[a.type] || a.type;
    const ts = new Date(a.ts).toLocaleString('tr-TR');
    const msg = `⚠️ <b>SuSayar Anomali Bildirimi</b>\n\n🔴 <b>${label}</b>\n📡 Cihaz: ${a.device}\n📝 ${a.detail}\n🕐 ${ts}`;
    const result = await sendTelegram(s.telegram_chat_id.trim(), msg);
    if (!result?.ok) return res.status(500).json({ error: result?.description || 'Telegram hatası' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.put('/api/anomalies/:id/feedback', requireAuth, async (req, res) => {
  try {
    const { feedback } = req.body; // 'real' | 'false_positive'
    if (!['real', 'false_positive'].includes(feedback))
      return res.status(400).json({ error: 'Geçersiz feedback' });
    const row = await db.queryOne(`SELECT id FROM anomalies WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Bulunamadı' });
    await db.queryRun(`UPDATE anomalies SET feedback=$1 WHERE id=$2 AND user_id=$3`, [feedback, req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── AI Endpoints ──────────────────────────────────────────────
function getAI() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

// Eşik öneri analizi (son 30 günlük veri → Claude)
app.post('/api/ai/analyze-thresholds', requireAuth, async (req, res) => {
  try {
    const ai = getAI();
    if (!ai) return res.status(503).json({ error: 'AI servisi yapılandırılmamış (ANTHROPIC_API_KEY eksik)' });

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const readings = await db.queryAll(
      `SELECT flow_lpm, ts FROM readings WHERE user_id=$1 AND ts>=$2 ORDER BY ts DESC LIMIT 2000`,
      [req.user.id, cutoff]
    );
    if (readings.length < 20) return res.status(400).json({ error: 'Yeterli veri yok (en az 20 okuma gerekli)' });

    const settings = await db.queryOne(`SELECT * FROM user_settings WHERE user_id=$1`, [req.user.id]) || {};
    const flows = readings.map(r => r.flow_lpm).filter(f => f > 0).sort((a, b) => a - b);
    const avg = flows.reduce((a, b) => a + b, 0) / flows.length;
    const max = flows[flows.length - 1];
    const p95 = flows[Math.floor(flows.length * 0.95)];
    const nightFlows = readings.filter(r => { const h = new Date(r.ts).getHours(); return h >= 0 && h < 6 && r.flow_lpm > 0; });
    const nightAvg = nightFlows.length
      ? (nightFlows.reduce((a, b) => a + b.flow_lpm, 0) / nightFlows.length).toFixed(2)
      : '0.00';

    const prompt = `Sen bir su tüketimi analiz uzmanısın. Kullanıcının sensör verilerine bakarak uyarı eşikleri için öneri sun.

VERİ ÖZETİ (son 30 gün, ${readings.length} okuma):
- Ortalama akış (>0): ${avg.toFixed(2)} L/dk
- Maksimum akış: ${max.toFixed(2)} L/dk
- %95 persentil: ${p95?.toFixed(2) ?? 'N/A'} L/dk
- Gece (00-06) akış sayısı: ${nightFlows.length} | ortalama: ${nightAvg} L/dk

MEVCUT AYARLAR:
- Gece aralığı: ${settings.night_start_hour ?? 0}:${String(settings.night_start_minute ?? 0).padStart(2,'0')} – ${settings.night_end_hour ?? 5}:${String(settings.night_end_minute ?? 0).padStart(2,'0')}
- Yüksek akış eşiği: ${settings.high_flow_lpm ?? 8} L/dk
- Sürekli akış alarm süresi: ${settings.continuous_flow_min ?? 30} dk
- Sızıntı eşiği: ${settings.leak_flow_lpm ?? 0.3} L/dk, ${settings.leak_cont_min ?? 30} dk
- Cihaz offline tekrar: ${settings.offline_repeat_min ?? 60} dk

Kısa, net ve Türkçe öneri ver. Veriye dayalı ol. Mevcut ayar zaten uygunsa bunu da belirt. Maksimum 5 madde, her madde 1-2 cümle.`;

    const msg = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ ok: true, analysis: msg.content[0]?.text || '' });
  } catch (e) {
    console.error('[AI] analyze-thresholds:', e.message);
    res.status(500).json({ error: 'AI analiz hatası' });
  }
});

// Anomali açıklama
app.post('/api/ai/explain-anomaly/:id', requireAuth, async (req, res) => {
  try {
    const ai = getAI();
    if (!ai) return res.status(503).json({ error: 'AI servisi yapılandırılmamış (ANTHROPIC_API_KEY eksik)' });

    const anomaly = await db.queryOne(
      `SELECT * FROM anomalies WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]
    );
    if (!anomaly) return res.status(404).json({ error: 'Anomali bulunamadı' });

    const from = new Date(new Date(anomaly.ts).getTime() - 2 * 60 * 60 * 1000).toISOString();
    const to   = new Date(new Date(anomaly.ts).getTime() + 30 * 60 * 1000).toISOString();
    const readings = await db.queryAll(
      `SELECT flow_lpm, ts FROM readings WHERE user_id=$1 AND device_id=$2 AND ts>=$3 AND ts<=$4 ORDER BY ts ASC LIMIT 60`,
      [req.user.id, anomaly.device, from, to]
    );

    const TYPE_LABELS = { 'yuksek-akis':'Yüksek Akış','surekli-akis':'Sürekli Akış','kacak':'Sızıntı Tespiti','gece-akis':'Gece Akışı','saat-akis':'Saat Uyarısı','cihaz-offline':'Cihaz Çevrimdışı' };
    const sample = readings.slice(0, 15).map(r => `${new Date(r.ts).toLocaleTimeString('tr-TR')} → ${r.flow_lpm.toFixed(2)} L/dk`).join('\n');

    const prompt = `Sen bir su tüketimi analiz uzmanısın. Aşağıdaki anomaliyi Türkçe, kısa ve anlaşılır biçimde açıkla.

ANOMALİ:
- Tip: ${TYPE_LABELS[anomaly.type] || anomaly.type}
- Zaman: ${new Date(anomaly.ts).toLocaleString('tr-TR')}
- Detay: ${anomaly.detail}

YAKIN ZAMANLI OKUMALAR:
${sample || '(veri yok)'}

Lütfen şunları açıkla:
1. Bu anomali muhtemelen ne anlama geliyor? (Gerçek hayattan örnek: çamaşır makinesi, bahçe sulama, musluk sızıntısı vb.)
2. Tehlikeli mi yoksa normal mi?
3. Kullanıcı ne yapmalı?

Maksimum 4 cümle. Sade ve net.`;

    const msg = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ ok: true, explanation: msg.content[0]?.text || '' });
  } catch (e) {
    console.error('[AI] explain-anomaly:', e.message);
    res.status(500).json({ error: 'AI açıklama hatası' });
  }
});

// ── Öğrenme istatistikleri ────────────────────────────────────
const ALL_ANOMALY_TYPES = ['gece-akis','saat-akis','yuksek-akis','surekli-akis','kacak','cihaz-offline'];

app.get('/api/learning', requireAuth, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Tüm cihazları al
    const devices = await db.queryAll(`SELECT device_id, name FROM devices WHERE user_id=$1`, [req.user.id]);
    // Feedback sayıları
    const rows = await db.queryAll(
      `SELECT type, device, feedback, COUNT(*) as cnt
       FROM anomalies
       WHERE user_id=$1 AND feedback IS NOT NULL AND ts>=$2
       GROUP BY type, device, feedback`,
      [req.user.id, cutoff]
    );
    const map = {};
    for (const r of rows) {
      const key = `${r.device}||${r.type}`;
      if (!map[key]) map[key] = { device: r.device, type: r.type, real: 0, false_positive: 0 };
      map[key][r.feedback] = parseInt(r.cnt);
    }
    // Tüm cihaz+tip kombinasyonlarını oluştur
    const learning = [];
    for (const dev of devices) {
      for (const type of ALL_ANOMALY_TYPES) {
        const key = `${dev.device_id}||${type}`;
        const m = map[key] || { real: 0, false_positive: 0 };
        learning.push({
          device: dev.device_id, deviceName: dev.name || dev.device_id,
          type, real: m.real, false_positive: m.false_positive,
          suppressed: m.false_positive >= 3,
        });
      }
    }
    res.json({ learning });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// Manuel baskılama (toggle)
app.post('/api/learning/suppress', requireAuth, async (req, res) => {
  try {
    const { device, type, suppress } = req.body;
    if (!device || !type) return res.status(400).json({ error: 'device ve type zorunlu' });
    if (suppress) {
      // 3 adet false_positive ekle — baskıla
      const now = new Date().toISOString();
      for (let i = 0; i < 3; i++) {
        const id = Date.now() + i;
        await db.queryRun(
          `INSERT INTO anomalies (id,user_id,type,device,detail,ts,resolved,feedback) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, req.user.id, type, device, 'Manuel baskılama', now, 1, 'false_positive']
        );
      }
    } else {
      // Sıfırla — tüm feedback kaldır
      await db.queryRun(`UPDATE anomalies SET feedback=NULL WHERE user_id=$1 AND device=$2 AND type=$3`, [req.user.id, device, type]);
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.delete('/api/learning', requireAuth, async (req, res) => {
  try {
    const { device, type } = req.body;
    if (!device || !type) return res.status(400).json({ error: 'device ve type zorunlu' });
    await db.queryRun(
      `UPDATE anomalies SET feedback=NULL WHERE user_id=$1 AND device=$2 AND type=$3`,
      [req.user.id, device, type]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// DELETE /api/readings kaldırıldı — veriler korunur

// ── Kullanıcı Ayarları ────────────────────────────────────────
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const device = req.query.device;
    const global = await db.queryOne(`SELECT * FROM user_settings WHERE user_id=$1`, [req.user.id]);
    if (device) {
      const ds = await db.queryOne(`SELECT * FROM device_alert_settings WHERE user_id=$1 AND device_id=$2`, [req.user.id, device]) || {};
      res.json({ ok: true, settings: {
        alert_after_hour:    ds.alert_after_hour    ?? global?.alert_after_hour    ?? 22,
        alert_after_minute:  ds.alert_after_minute  ?? global?.alert_after_minute  ?? 0,
        continuous_flow_min: ds.continuous_flow_min ?? global?.continuous_flow_min ?? 30,
        daily_report:            !!global?.daily_report,
        weekly_report:           !!global?.weekly_report,
        notify_realtime_email:   !!global?.notify_realtime_email,
        notify_telegram:         !!global?.notify_telegram,
        telegram_chat_id:        global?.telegram_chat_id || '',
      }});
    } else {
      const s = global || {};
      res.json({ ok: true, settings: {
        alert_after_hour:    s.alert_after_hour    ?? 22,
        alert_after_minute:  s.alert_after_minute  ?? 0,
        continuous_flow_min: s.continuous_flow_min ?? 30,
        daily_report:           !!s.daily_report,
        weekly_report:          !!s.weekly_report,
        notify_realtime_email:  !!s.notify_realtime_email,
        notify_telegram:        !!s.notify_telegram,
        telegram_chat_id:       s.telegram_chat_id || '',
        ai_auto_manage:         !!(s.ai_auto_manage),
        ai_last_action:         s.ai_last_action || null,
        ai_last_action_ts:      s.ai_last_action_ts || null,
        tatil_modu:             !!(s.tatil_modu),
        tatil_modu_until:       s.tatil_modu_until || null,
        tatil_yetkili:          s.tatil_yetkili || '',
        night_start_hour:       s.night_start_hour   ?? 0,
        night_start_minute:     s.night_start_minute ?? 0,
        night_end_hour:         s.night_end_hour     ?? 5,
        night_end_minute:       s.night_end_minute   ?? 0,
        high_flow_lpm:          s.high_flow_lpm      ?? 8,
        leak_flow_lpm:          s.leak_flow_lpm      ?? 0.3,
        leak_cont_min:          s.leak_cont_min      ?? 30,
        offline_repeat_min:     s.offline_repeat_min ?? 60,
        night_flow_enabled:     s.night_flow_enabled  !== 0 && s.night_flow_enabled  !== false,
        alert_hour_enabled:     s.alert_hour_enabled  !== 0 && s.alert_hour_enabled  !== false,
        high_flow_enabled:      s.high_flow_enabled   !== 0 && s.high_flow_enabled   !== false,
        cont_flow_enabled:      s.cont_flow_enabled   !== 0 && s.cont_flow_enabled   !== false,
        leak_enabled:           s.leak_enabled        !== 0 && s.leak_enabled        !== false,
        offline_enabled:        s.offline_enabled     !== 0 && s.offline_enabled     !== false,
      }});
    }
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const device = req.query.device;
    const { alert_after_hour, alert_after_minute, continuous_flow_min, daily_report, weekly_report,
            notify_realtime_email, notify_telegram, telegram_chat_id,
            night_start_hour, night_start_minute, night_end_hour, night_end_minute,
            high_flow_lpm, leak_flow_lpm, leak_cont_min, offline_repeat_min,
            ai_auto_manage,
            tatil_modu, tatil_modu_until, tatil_yetkili,
            night_flow_enabled, alert_hour_enabled, high_flow_enabled,
            cont_flow_enabled, leak_enabled, offline_enabled } = req.body;
    const hour   = parseInt(alert_after_hour   ?? 22);
    const minute = parseInt(alert_after_minute ?? 0);
    const mins   = parseInt(continuous_flow_min ?? 30);
    if (hour < 0 || hour > 23)    return res.status(400).json({ error: 'Saat 0-23 arasında olmalı' });
    if (minute < 0 || minute > 59) return res.status(400).json({ error: 'Dakika 0-59 arasında olmalı' });
    if (mins < 5 || mins > 1440)  return res.status(400).json({ error: 'Süre 5-1440 dk arasında olmalı' });
    if (device) {
      await db.queryRun(
        `INSERT INTO device_alert_settings (user_id,device_id,alert_after_hour,alert_after_minute,continuous_flow_min)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id,device_id) DO UPDATE SET alert_after_hour=$3, alert_after_minute=$4, continuous_flow_min=$5`,
        [req.user.id, device, hour, minute, mins]
      );
    } else {
      // Mevcut ayarları yükle — body'de gelmeyen alanlar için DB değerini koru
      const cur = await db.queryOne(`SELECT * FROM user_settings WHERE user_id=$1`, [req.user.id]) || {};
      // alert_after_hour/minute ve continuous_flow_min de DB'den koru
      const hour_save = alert_after_hour   !== undefined ? parseInt(alert_after_hour)   : (cur.alert_after_hour   ?? 22);
      const min_save  = alert_after_minute !== undefined ? parseInt(alert_after_minute) : (cur.alert_after_minute ?? 0);
      const mins_save = continuous_flow_min !== undefined ? parseInt(continuous_flow_min) : (cur.continuous_flow_min ?? 30);
      const nsh = night_start_hour   !== undefined ? parseInt(night_start_hour)   : (cur.night_start_hour   ?? 0);
      const nsm = night_start_minute !== undefined ? parseInt(night_start_minute) : (cur.night_start_minute ?? 0);
      const neh = night_end_hour     !== undefined ? parseInt(night_end_hour)     : (cur.night_end_hour     ?? 5);
      const nem = night_end_minute   !== undefined ? parseInt(night_end_minute)   : (cur.night_end_minute   ?? 0);
      const hfl = high_flow_lpm      !== undefined ? parseFloat(high_flow_lpm)    : (cur.high_flow_lpm      ?? 8);
      const lfl = leak_flow_lpm      !== undefined ? parseFloat(leak_flow_lpm)    : (cur.leak_flow_lpm      ?? 0.3);
      const lcm = leak_cont_min      !== undefined ? parseInt(leak_cont_min)      : (cur.leak_cont_min      ?? 30);
      const orm = offline_repeat_min !== undefined ? parseInt(offline_repeat_min) : (cur.offline_repeat_min ?? 60);
      // Bildirim alanları da aynı şekilde koru
      const nre = notify_realtime_email !== undefined ? notify_realtime_email : cur.notify_realtime_email;
      const ntg = notify_telegram       !== undefined ? notify_telegram       : cur.notify_telegram;
      const cid = telegram_chat_id      !== undefined ? telegram_chat_id      : cur.telegram_chat_id;
      const dr  = daily_report          !== undefined ? daily_report          : cur.daily_report;
      const wr  = weekly_report         !== undefined ? weekly_report         : cur.weekly_report;
      const aam = ai_auto_manage        !== undefined ? ai_auto_manage        : cur.ai_auto_manage;
      const tm  = tatil_modu            !== undefined ? tatil_modu            : cur.tatil_modu;
      const tmu = tatil_modu_until      !== undefined ? tatil_modu_until      : cur.tatil_modu_until;
      const tmy = tatil_yetkili         !== undefined ? tatil_yetkili         : cur.tatil_yetkili;
      const nfe = night_flow_enabled  !== undefined ? night_flow_enabled  : (cur.night_flow_enabled  ?? 1);
      const ahe = alert_hour_enabled  !== undefined ? alert_hour_enabled  : (cur.alert_hour_enabled  ?? 1);
      const hfe = high_flow_enabled   !== undefined ? high_flow_enabled   : (cur.high_flow_enabled   ?? 1);
      const cfe = cont_flow_enabled   !== undefined ? cont_flow_enabled   : (cur.cont_flow_enabled   ?? 1);
      const le  = leak_enabled        !== undefined ? leak_enabled        : (cur.leak_enabled        ?? 1);
      const oe  = offline_enabled     !== undefined ? offline_enabled     : (cur.offline_enabled     ?? 1);
      await db.queryRun(
        `INSERT INTO user_settings
           (user_id,alert_after_hour,alert_after_minute,continuous_flow_min,daily_report,weekly_report,
            notify_realtime_email,notify_telegram,telegram_chat_id,
            night_start_hour,night_start_minute,night_end_hour,night_end_minute,
            high_flow_lpm,leak_flow_lpm,leak_cont_min,offline_repeat_min,ai_auto_manage,
            tatil_modu,tatil_modu_until,tatil_yetkili,
            night_flow_enabled,alert_hour_enabled,high_flow_enabled,cont_flow_enabled,leak_enabled,offline_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
         ON CONFLICT (user_id) DO UPDATE SET
           alert_after_hour=$2, alert_after_minute=$3, continuous_flow_min=$4,
           daily_report=$5, weekly_report=$6, notify_realtime_email=$7, notify_telegram=$8, telegram_chat_id=$9,
           night_start_hour=$10, night_start_minute=$11, night_end_hour=$12, night_end_minute=$13,
           high_flow_lpm=$14, leak_flow_lpm=$15, leak_cont_min=$16, offline_repeat_min=$17,
           ai_auto_manage=$18, tatil_modu=$19, tatil_modu_until=$20, tatil_yetkili=$21,
           night_flow_enabled=$22, alert_hour_enabled=$23, high_flow_enabled=$24,
           cont_flow_enabled=$25, leak_enabled=$26, offline_enabled=$27`,
        [req.user.id, hour_save, min_save, mins_save,
         dr ? 1 : 0, wr ? 1 : 0,
         nre ? 1 : 0, ntg ? 1 : 0,
         cid || null,
         nsh, nsm, neh, nem, hfl, lfl, lcm, orm,
         aam ? 1 : 0,
         tm ? 1 : 0, tmu || null, tmy || null,
         nfe ? 1 : 0, ahe ? 1 : 0, hfe ? 1 : 0, cfe ? 1 : 0, le ? 1 : 0, oe ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (e) { console.error('[PUT /api/settings]', e?.message || e); res.status(500).json({ error: e?.message || 'Sunucu hatası' }); }
});

// ── Telegram test ─────────────────────────────────────────────
app.post('/api/test-notify', requireAuth, async (req, res) => {
  try {
    const user = await db.queryOne(`SELECT name, email FROM users WHERE id=$1`, [req.user.id]);
    const s    = await db.queryOne(`SELECT notify_realtime_email, notify_telegram, telegram_chat_id FROM user_settings WHERE user_id=$1`, [req.user.id]);
    const results = { email: null, telegram: null };

    // Telegram
    if (s?.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
      const r = await sendTelegram(s.telegram_chat_id.trim(), '✅ <b>SuSayar test mesajı</b>\n\nBildirimler çalışıyor!');
      results.telegram = r?.ok ? 'ok' : (r?.description || 'hata');
    } else {
      results.telegram = 'ayarlı değil';
    }

    // E-posta
    if (user?.email) {
      const sent = await sendMail({
        to: user.email,
        subject: '✅ SuSayar — Bildirim Testi',
        html: mailHtml({ title: '✅ Test Bildirimi', body: `<p>Merhaba <strong>${user.name}</strong>,</p><p>SuSayar e-posta bildirimleri çalışıyor!</p>` }),
      });
      results.email = sent ? 'ok' : 'gönderilemedi';
    }

    const errors = Object.entries(results).filter(([,v]) => v && v !== 'ok' && v !== 'ayarlı değil').map(([k]) => k);
    if (errors.length) return res.status(500).json({ error: `${errors.join(', ')} hatası`, results });
    res.json({ ok: true, results });
  } catch (e) { res.status(500).json({ error: 'Gönderilemedi' }); }
});
// Geriye dönük uyumluluk
app.post('/api/test-telegram', requireAuth, (req, res) => res.redirect(307, '/api/test-notify'));

// ── Sensör ────────────────────────────────────────────────────

app.post('/api/sensor', sensorLimiter, requireDeviceKey, async (req, res) => {
  try {
    const data = req.body;
    if (typeof data.flow_lpm !== 'number' || typeof data.total_liters !== 'number')
      return res.status(400).json({ error: 'flow_lpm ve total_liters gerekli' });


    const reading = {
      user_id: req.device.user_id, device_id: req.device.device_id,
      flow_lpm: data.flow_lpm, total_liters: data.total_liters,
      pulses: data.pulses ?? null, uptime_sec: data.uptime_sec ?? null,
      rssi_dbm: data.rssi_dbm ?? null, ts: new Date().toISOString(),
    };

    await db.queryRun(
      `INSERT INTO readings (user_id,device_id,flow_lpm,total_liters,pulses,uptime_sec,rssi_dbm,ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reading.user_id, reading.device_id, reading.flow_lpm, reading.total_liters,
       reading.pulses, reading.uptime_sec, reading.rssi_dbm, reading.ts]
    );
    await db.queryRun(
      `UPDATE devices SET last_seen=$1, rssi_dbm=$2 WHERE device_id=$3 AND user_id=$4`,
      [reading.ts, reading.rssi_dbm, reading.device_id, reading.user_id]
    );
    broadcastToUser(reading.user_id, { type: 'sensor_update', payload: reading });

    // ── Yeniden bağlantı tespiti ─────────────────────────────
    const openOffline = await db.queryOne(
      `SELECT id FROM anomalies WHERE user_id=$1 AND type='cihaz-offline' AND device=$2 AND NOT resolved`,
      [reading.user_id, reading.device_id]
    );
    if (openOffline) {
      const resolvedVal = db.isPg ? true : 1;
      await db.queryRun(`UPDATE anomalies SET resolved=$1 WHERE id=$2`, [resolvedVal, openOffline.id]);
      broadcastToUser(reading.user_id, { type: 'anomaly', payload: { id: openOffline.id, type: 'cihaz-offline', device: reading.device_id, resolved: true } });
      const devName = req.device.name || reading.device_id;
      const s    = await db.queryOne(`SELECT notify_telegram, telegram_chat_id FROM user_settings WHERE user_id=$1`, [reading.user_id]);
      const user = await db.queryOne(`SELECT name, email FROM users WHERE id=$1`, [reading.user_id]);
      const reconnMsg = `🟢 <b>Cihaz Yeniden Bağlandı</b>\n\n📡 ${devName}\n⏱ ${new Date().toLocaleString('tr-TR')}\n\nBağlantı yeniden kuruldu.`;
      if (s?.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
        await sendTelegram(s.telegram_chat_id.trim(), reconnMsg).catch(() => {});
      }
      if (user?.email) {
        sendMail({
          to: user.email,
          subject: `🟢 SuSayar — ${devName} yeniden bağlandı`,
          html: mailHtml({ title: '🟢 Cihaz Yeniden Bağlandı', body: `
            <p>Merhaba <strong>${user.name}</strong>,</p>
            <p><strong>${devName}</strong> cihazı yeniden bağlandı.</p>
            <p>Bağlantı başarıyla yeniden kuruldu.</p>
          ` }),
        }).catch(() => {});
      }
      console.log(`[RECONNECT] ${reading.device_id} (user: ${reading.user_id})`);
    }

    // ── Anomali tespiti ─────────────────────────────────────
    const now = new Date();
    const trHour   = ((now.getUTCHours()   + 3) % 24 + 24) % 24;
    const trMinute = now.getUTCMinutes();
    const trTotalMin = trHour * 60 + trMinute;
    const anomalies = [];

    // Kullanıcı ayarlarını al (cihaza özgü varsa önce onu dene)
    const settings   = await db.queryOne(`SELECT * FROM user_settings WHERE user_id=$1`, [reading.user_id]);
    const devSettings = await db.queryOne(`SELECT * FROM device_alert_settings WHERE user_id=$1 AND device_id=$2`, [reading.user_id, reading.device_id]);
    const alertHour   = devSettings?.alert_after_hour   ?? settings?.alert_after_hour   ?? 22;
    const alertMinute = devSettings?.alert_after_minute ?? settings?.alert_after_minute ?? 0;
    const contFlowMin = devSettings?.continuous_flow_min ?? settings?.continuous_flow_min ?? 30;
    const alertTotalMin = alertHour * 60 + alertMinute;

    // Gece akışı (yapılandırılabilir saat aralığı, varsayılan 00:00–05:00)
    const nightStartH = settings?.night_start_hour   ?? 0;
    const nightStartM = settings?.night_start_minute ?? 0;
    const nightEndH   = settings?.night_end_hour     ?? 5;
    const nightEndM   = settings?.night_end_minute   ?? 0;
    const nightStartTotalMin = nightStartH * 60 + nightStartM;
    const nightEndTotalMin   = nightEndH   * 60 + nightEndM;
    // Gece aralığı gece yarısını geçebilir (ör. 22:00–06:00)
    const isNight = nightStartTotalMin <= nightEndTotalMin
      ? (trTotalMin >= nightStartTotalMin && trTotalMin < nightEndTotalMin)
      : (trTotalMin >= nightStartTotalMin || trTotalMin < nightEndTotalMin);
    if (isNight && reading.flow_lpm > 0.1) {
      anomalies.push({ type: 'gece-akis', detail: `${String(trHour).padStart(2,'0')}:${String(trMinute).padStart(2,'0')} saatinde ${reading.flow_lpm.toFixed(1)} L/dk akış tespit edildi` });
    }
    // Kullanıcının belirlediği saatten sonra akış
    if (trTotalMin >= alertTotalMin && reading.flow_lpm > 0.1) {
      const alertStr = `${String(alertHour).padStart(2,'0')}:${String(alertMinute).padStart(2,'0')}`;
      const nowStr   = `${String(trHour).padStart(2,'0')}:${String(trMinute).padStart(2,'0')}`;
      anomalies.push({ type: 'saat-akis', detail: `${nowStr} saatinde (${alertStr} sonrası) ${reading.flow_lpm.toFixed(1)} L/dk akış tespit edildi` });
    }
    // Çok yüksek akış (yapılandırılabilir eşik, varsayılan 8 L/dk)
    const highFlowLpm = settings?.high_flow_lpm ?? 8;
    if (reading.flow_lpm > highFlowLpm) {
      anomalies.push({ type: 'yuksek-akis', detail: `Anlık akış ${reading.flow_lpm.toFixed(1)} L/dk — anormal yüksek (eşik: ${highFlowLpm} L/dk)` });
    }
    // Sürekli akış tespiti
    if (reading.flow_lpm > 0.1) {
      const cutoffCont = new Date(Date.now() - contFlowMin * 60 * 1000).toISOString();
      const contRows = await db.queryAll(
        `SELECT flow_lpm FROM readings WHERE user_id=$1 AND device_id=$2 AND ts>=$3 ORDER BY ts DESC`,
        [reading.user_id, reading.device_id, cutoffCont]
      );
      const minCount = Math.floor((contFlowMin * 60) / 2.5);
      if (contRows.length >= minCount && contRows.every(r => r.flow_lpm > 0.1)) {
        anomalies.push({ type: 'surekli-akis', detail: `${contFlowMin} dakikadır sürekli akış: ${reading.flow_lpm.toFixed(1)} L/dk — olası kaçak` });
      }
    }
    // Sızıntı tespiti (düşük sürekli akış)
    const leakFlowLpm = settings?.leak_flow_lpm ?? 0.3;
    const leakContMin = settings?.leak_cont_min  ?? 30;
    if (reading.flow_lpm > 0 && reading.flow_lpm <= leakFlowLpm) {
      const cutoffLeak = new Date(Date.now() - leakContMin * 60 * 1000).toISOString();
      const leakRows = await db.queryAll(
        `SELECT flow_lpm FROM readings WHERE user_id=$1 AND device_id=$2 AND ts>=$3 ORDER BY ts DESC`,
        [reading.user_id, reading.device_id, cutoffLeak]
      );
      const minLeakCount = Math.floor((leakContMin * 60) / 2.5);
      if (leakRows.length >= minLeakCount && leakRows.every(r => r.flow_lpm > 0 && r.flow_lpm <= leakFlowLpm)) {
        anomalies.push({ type: 'kacak', detail: `${leakContMin} dakikadır düşük sürekli akış: ort. ${reading.flow_lpm.toFixed(2)} L/dk — sızıntı şüphesi` });
      }
    }

    // ── Tatil modu ───────────────────────────────────────────────
    const tatilActive  = !!settings?.tatil_modu;
    const tatilUntil   = settings?.tatil_modu_until;
    const tatilExpired = tatilUntil && new Date(tatilUntil) < new Date();
    if (tatilActive && tatilExpired) {
      // Süre doldu, otomatik kapat
      await db.queryRun(
        `UPDATE user_settings SET tatil_modu=$1, tatil_modu_until=NULL WHERE user_id=$2`,
        [db.isPg ? false : 0, reading.user_id]
      ).catch(() => {});
    } else if (tatilActive && !tatilExpired && reading.flow_lpm > 0.1) {
      const yetkiliNote = settings.tatil_yetkili ? ` · Yetkili: ${settings.tatil_yetkili}` : '';
      anomalies.push({ type: 'tatil-akis', detail: `Tatil modunda akış: ${reading.flow_lpm.toFixed(1)} L/dk — yetkisiz giriş veya boru kaçağı şüphesi${yetkiliNote}` });
    }

    // Cooldown: surekli-akis için 30dk, diğerleri için 60dk (cihaz bazlı)
    const COOLDOWN = { 'surekli-akis': 30, 'yuksek-akis': 15 };
    const newAnomalies = [];
    for (const a of anomalies) {
      // Öğrenme: son 7 günde 3+ kez "false_positive" işaretlendiyse atla
      const learnCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fpCount = await db.queryOne(
        `SELECT COUNT(*) as cnt FROM anomalies WHERE user_id=$1 AND type=$2 AND device=$3 AND feedback='false_positive' AND ts>=$4`,
        [reading.user_id, a.type, reading.device_id, learnCutoff]
      );
      if (parseInt(fpCount?.cnt || 0) >= 3) continue; // öğrenilmiş, atla

      const coolMin = COOLDOWN[a.type] ?? 60;
      const cutoff  = new Date(Date.now() - coolMin * 60 * 1000).toISOString();
      const existing = await db.queryOne(
        `SELECT id FROM anomalies WHERE user_id=$1 AND type=$2 AND device=$3 AND ts>=$4`,
        [reading.user_id, a.type, reading.device_id, cutoff]
      );
      if (!existing) {
        const anomId = Date.now();
        const resolvedFalse = db.isPg ? false : 0;
        await db.queryRun(
          `INSERT INTO anomalies (id,user_id,type,device,detail,ts,resolved) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [anomId, reading.user_id, a.type, reading.device_id, a.detail, reading.ts, resolvedFalse]
        );
        const anomPayload = { id: anomId, ...a, device: reading.device_id, ts: reading.ts, resolved: false };
        broadcastToUser(reading.user_id, { type: 'anomaly', payload: anomPayload });
        newAnomalies.push(anomPayload);
      }
    }
    // Anlık bildirim gönder
    if (newAnomalies.length > 0) {
      sendAnomalyNotifications(reading.user_id, newAnomalies).catch(() => {});
    }

    // ── Otomatik çözümleme: koşul ortadan kalktıysa aktif anomaliyi kapat ──
    {
      const resolvedVal = db.isPg ? true : 1;
      // Hangi tipler artık aktif değil?
      const toAutoResolve = [];
      if (reading.flow_lpm <= 0.1)                                             toAutoResolve.push('surekli-akis');
      if (reading.flow_lpm <= 0 || reading.flow_lpm > leakFlowLpm)            toAutoResolve.push('kacak');
      if (reading.flow_lpm <= highFlowLpm)                                     toAutoResolve.push('yuksek-akis');
      if (!isNight)                                                             toAutoResolve.push('gece-akis');
      if (trTotalMin < alertTotalMin)                                          toAutoResolve.push('saat-akis');

      for (const type of toAutoResolve) {
        const open = await db.queryAll(
          `SELECT id FROM anomalies WHERE user_id=$1 AND type=$2 AND device=$3 AND NOT resolved`,
          [reading.user_id, type, reading.device_id]
        );
        for (const a of open) {
          await db.queryRun(`UPDATE anomalies SET resolved=$1 WHERE id=$2`, [resolvedVal, a.id]);
          broadcastToUser(reading.user_id, { type: 'anomaly', payload: { id: a.id, type, device: reading.device_id, resolved: true } });
          console.log(`[AUTO-RESOLVE] ${type} → ${a.id} çözüldü (${reading.device_id})`);
        }
      }
    }

    // Canlı durum panelini güncelle
    updateTelegramLivePanel(reading.user_id, data, req.device.name).catch(() => {});

    console.log(`[${reading.ts}] ${reading.device_id} | ${data.flow_lpm} L/dk | ${data.total_liters} L`);
    res.json({ ok: true, ts: reading.ts });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Veri Endpoint'leri ────────────────────────────────────────

app.get('/api/latest', requireAuth, async (req, res) => {
  try {
    const device = req.query.device;
    const row = device
      ? await db.queryOne(`SELECT * FROM readings WHERE user_id=$1 AND device_id=$2 ORDER BY id DESC LIMIT 1`, [req.user.id, device])
      : await db.queryOne(`SELECT * FROM readings WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [req.user.id]);
    res.json(row || { flow_lpm: 0, total_liters: 0, ts: null });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.get('/api/history', requireAuth, async (req, res) => {
  try {
    const n = Math.min(parseInt(req.query.n) || 100, 10000);
    const device = req.query.device;
    const rows = device
      ? await db.queryAll(`SELECT * FROM readings WHERE user_id=$1 AND device_id=$2 ORDER BY id DESC LIMIT $3`, [req.user.id, device, n])
      : await db.queryAll(`SELECT * FROM readings WHERE user_id=$1 ORDER BY id DESC LIMIT $2`, [req.user.id, n]);
    res.json(rows.reverse());
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});


app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const weekRow = await db.queryOne(`SELECT SUM((flow_lpm/60.0)*2.5) as total FROM readings WHERE user_id=$1 AND ts>=$2`, [uid, cutoff]);
    const weekL = parseFloat(weekRow?.total || 0);
    const [devRow, readRow] = await Promise.all([
      db.queryOne(`SELECT COUNT(*) as n FROM devices  WHERE user_id=$1`, [uid]),
      db.queryOne(`SELECT COUNT(*) as n FROM readings WHERE user_id=$1`, [uid]),
    ]);
    res.json({
      active_devices : parseInt(devRow?.n  || 0),
      week_water_l   : Math.round(weekL),
      total_readings : parseInt(readRow?.n || 0),
      uptime_since   : serverStart,
    });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Günlük Rapor (saatlik tüketim) ───────────────────────────
app.get('/api/reports/daily', requireAuth, async (req, res) => {
  try {
    const uid    = req.user.id;
    const date   = req.query.date || new Date().toISOString().slice(0, 10);
    const device = req.query.device;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Geçersiz tarih formatı (YYYY-MM-DD)' });
    const dayStart = date + 'T00:00:00.000+03:00';
    const dayEnd   = date + 'T23:59:59.999+03:00';
    const devFilter = device ? ' AND device_id=$4' : '';
    const params    = device ? [uid, dayStart, dayEnd, device] : [uid, dayStart, dayEnd];

    let rows;
    if (db.isPg) {
      rows = await db.queryAll(
        `SELECT to_char(ts::timestamptz AT TIME ZONE 'Europe/Istanbul', 'HH24') AS hour,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3${devFilter}
         GROUP BY hour ORDER BY hour`, params);
    } else {
      rows = await db.queryAll(
        `SELECT strftime('%H', datetime(ts, '+3 hours')) AS hour,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3${devFilter}
         GROUP BY hour ORDER BY hour`, params);
    }

    const total = rows.reduce((s, r) => s + parseFloat(r.liters || 0), 0);
    res.json({ date, total_liters: Math.round(total * 10) / 10, hours: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Aylık Rapor (günlük tüketim) ──────────────────────────────
app.get('/api/reports/monthly', requireAuth, async (req, res) => {
  try {
    const uid    = req.user.id;
    const month  = req.query.month || new Date().toISOString().slice(0, 7);
    const device = req.query.device;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Geçersiz ay formatı (YYYY-MM)' });
    const monthStart = month + '-01T00:00:00.000+03:00';
    const monthEnd   = month + '-31T23:59:59.999+03:00';
    const devFilter  = device ? ' AND device_id=$4' : '';
    const params     = device ? [uid, monthStart, monthEnd, device] : [uid, monthStart, monthEnd];

    let rows;
    if (db.isPg) {
      rows = await db.queryAll(
        `SELECT to_char(ts::timestamptz AT TIME ZONE 'Europe/Istanbul', 'DD') AS day,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3${devFilter}
         GROUP BY day ORDER BY day`, params);
    } else {
      rows = await db.queryAll(
        `SELECT strftime('%d', datetime(ts, '+3 hours')) AS day,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3${devFilter}
         GROUP BY day ORDER BY day`, params);
    }

    const total = rows.reduce((s, r) => s + parseFloat(r.liters || 0), 0);
    const avg   = rows.length ? total / rows.length : 0;
    res.json({ month, total_liters: Math.round(total * 10) / 10, avg_daily: Math.round(avg * 10) / 10, days: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Stripe ────────────────────────────────────────────────────
const STRIPE_SK      = process.env.STRIPE_SECRET_KEY;
const STRIPE_WH      = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SUCCESS = process.env.STRIPE_SUCCESS_URL || 'https://susayar.com/susayar-dashboard.html?upgraded=1';
const STRIPE_CANCEL  = process.env.STRIPE_CANCEL_URL  || 'https://susayar.com/susayar-dashboard.html';

const PLANS = {
  individual: { name: 'SuSayar Bireysel', amount: 9900, label: 'individual' },
};

app.post('/api/stripe/checkout', requireAuth, async (req, res) => {
  if (!STRIPE_SK) return res.status(503).json({ error: 'Stripe henüz yapılandırılmamış' });
  const stripe = require('stripe')(STRIPE_SK);
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Geçersiz plan' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: req.user.email,
      metadata: { user_id: req.user.id, plan },
      line_items: [{
        price_data: {
          currency: 'try',
          product_data: { name: PLANS[plan].name },
          unit_amount: PLANS[plan].amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: STRIPE_SUCCESS,
      cancel_url:  STRIPE_CANCEL,
    });
    res.json({ url: session.url });
  } catch (e) { console.error('[STRIPE]', e.message); res.status(500).json({ error: 'Ödeme sistemi hatası' }); }
});

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!STRIPE_SK || !STRIPE_WH) return res.sendStatus(400);
  const stripe = require('stripe')(STRIPE_SK);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WH);
  } catch (e) { console.error('[STRIPE WEBHOOK]', e.message); return res.sendStatus(400); }

  if (event.type === 'checkout.session.completed') {
    const { user_id, plan } = event.data.object.metadata || {};
    if (user_id && plan) {
      await db.queryRun(`UPDATE users SET plan=$1 WHERE id=$2`, [plan, user_id]);
      console.log(`[STRIPE] Plan güncellendi: ${user_id} → ${plan}`);
    }
  }
  res.sendStatus(200);
});

// ── Admin ─────────────────────────────────────────────────────
const ADMIN_SECRET      = process.env.ADMIN_SECRET;
const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET; // speakeasy base32 secret
const COOKIE_SECRET     = process.env.COOKIE_SECRET || JWT_SECRET;
const ADMIN_SESSION_TTL = 4 * 60 * 60 * 1000; // 4 saat

if (!ADMIN_SECRET) {
  console.error('[HATA] ADMIN_SECRET ortam değişkeni ayarlanmamış! Render > Environment > ADMIN_SECRET ekleyin.');
  process.exit(1);
}

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Çok fazla admin isteği.' },
  standardHeaders: true, legacyHeaders: false,
});

function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Yetkisiz' });
  next();
}

app.get('/api/admin/users', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const users = await db.queryAll(
      `SELECT id, name, email, plan, phone, phone_verified, created_at FROM users ORDER BY created_at DESC`
    );
    res.json(users);
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/admin/users/:id/reset-link', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const user = await db.queryOne(`SELECT id, name, email FROM users WHERE id=$1`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const token = randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.queryRun(`UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3`, [token, expires, user.id]);
    const appUrl = process.env.APP_URL || 'https://www.susayar.com';
    const resetUrl = `${appUrl}/susayar-auth.html?reset_token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'SuSayar — Şifre Sıfırlama',
      html: mailHtml({ title: 'Şifre Sıfırlama', body: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 12px">Merhaba <strong>${user.name}</strong>,</p>
        <p style="font-size:14px;color:#475569;margin:0 0 28px">Hesabınızın şifresini sıfırlamak için aşağıdaki butona tıklayın. Link <strong>24 saat</strong> geçerlidir.</p>
        <div style="text-align:center;margin:0 0 28px">
          <a href="${resetUrl}" style="display:inline-block;background:#3bb5d4;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Şifremi Sıfırla</a>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin:0">Bu isteği siz yapmadıysanız bu e-postayı güvenle görmezden gelebilirsiniz.</p>
      ` }),
    });
    res.json({ ok: true }); // resetUrl response'a eklenmez
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.get('/api/admin/devices', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const devs = await db.queryAll(
      `SELECT d.id, d.name, d.device_id, d.api_key, d.last_seen, d.created_at,
              u.name as user_name, u.email as user_email
       FROM devices d JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC`
    );
    res.json(devs);
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/admin/devices', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { user_id, name, device_id } = req.body;
    if (!user_id || !name || !device_id) return res.status(400).json({ error: 'user_id, name ve device_id zorunludur' });
    const exists = await db.queryOne(`SELECT id FROM devices WHERE device_id=$1`, [device_id.trim()]);
    if (exists) return res.status(409).json({ error: 'Bu device_id zaten kayıtlı' });
    const dev = {
      id: randomUUID(), user_id, name: name.trim(),
      device_id: device_id.trim(), api_key: randomUUID().replace(/-/g, ''),
      created_at: new Date().toISOString(),
    };
    await db.queryRun(
      `INSERT INTO devices (id,user_id,name,device_id,api_key,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [dev.id, dev.user_id, dev.name, dev.device_id, dev.api_key, dev.created_at]
    );
    console.log(`[ADMIN] Cihaz eklendi: ${dev.device_id} → ${user_id}`);
    res.json({ ok: true, device: dev });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.delete('/api/admin/devices/:id', adminLimiter, requireAdmin, async (req, res) => {
  try {
    await db.queryRun(`DELETE FROM devices WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/admin/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['starter', 'individual'].includes(plan)) return res.status(400).json({ error: 'Geçersiz plan' });
    await db.queryRun(`UPDATE users SET plan=$1 WHERE id=$2`, [plan, req.params.id]);
    console.log(`[ADMIN] Plan güncellendi: ${req.params.id} → ${plan}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Geçici: Bozuk readings temizle (sonra silinecek) ──────────
app.delete('/api/admin/readings/cleanup', adminLimiter, requireAdmin, async (req, res) => {
  try {
    // total_liters > 10000 veya flow_lpm > 100 olan bozuk kayıtları sil
    const r1 = await db.queryRun(`DELETE FROM readings WHERE total_liters > 10000`);
    const r2 = await db.queryRun(`DELETE FROM readings WHERE flow_lpm > 100`);
    console.log('[CLEANUP] Bozuk readings temizlendi');
    res.json({ ok: true, deleted_total_liters: r1.changes || r1.rowCount, deleted_flow: r2.changes || r2.rowCount });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Kurulum Talebi ────────────────────────────────────────────
app.post('/api/talep', authLimiter, async (req, res) => {
  try {
    const { name, phone, address, note } = req.body || {};
    if (!name || !phone || !address) return res.status(400).json({ error: 'Ad, telefon ve adres zorunlu' });
    const ts = new Date().toISOString();
    console.log(`[TALEP] ${ts} | ${name} | ${phone} | ${address} | ${note || ''}`);
    // E-posta bildirimi (SMTP varsa)
    sendMail({
      to: process.env.ADMIN_EMAIL || 'destek@susayar.com',
      subject: `Yeni Kurulum Talebi — ${name}`,
      html: mailHtml({ title: 'Yeni Kurulum Talebi', body: `
        <p style="font-size:16px;color:#1e293b;font-weight:700;margin:0 0 20px">Yeni bir kurulum talebi geldi.</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:100px">Ad Soyad</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;font-weight:600">${name}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px">Telefon</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;font-weight:600">${phone}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px">Adres</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;font-weight:600">${address}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px">Not</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px">${note || '—'}</td></tr>
          <tr><td style="padding:10px 0;color:#64748b;font-size:13px">Tarih</td><td style="padding:10px 0;color:#94a3b8;font-size:13px">${ts}</td></tr>
        </table>
      ` }),
    }).catch(e => console.error('[TALEP MAIL]', e.message));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── WebSocket ─────────────────────────────────────────────────
const server    = http.createServer(app);
const wss       = new WebSocketServer({ server, path: '/ws' });
const serverStart = new Date().toISOString();

wss.on('connection', async (ws, req) => {
  const url   = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (token) {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      ws.userId  = user.id;
      const [latest, history] = await Promise.all([
        db.queryOne(`SELECT * FROM readings WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [user.id]),
        db.queryAll(`SELECT * FROM readings WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [user.id]),
      ]);
      ws.send(JSON.stringify({ type: 'init', payload: {
        latest: latest || null,
        history: history.reverse(),
      }}));
    } catch { ws.close(1008, 'Geçersiz token'); return; }
  }
  console.log(`[WS] Bağlandı | user: ${ws.userId || 'anonim'} | Aktif: ${wss.clients.size}`);
  ws.on('message', raw => {
    try { const m = JSON.parse(raw); if (m.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() })); } catch {}
  });
  ws.on('close', () => console.log(`[WS] Ayrıldı | Aktif: ${wss.clients.size}`));
  ws.on('error', err => console.error('[WS] Hata:', err.message));
});

// ── Anomali Bildirim Fonksiyonları ────────────────────────────
const ANOMALY_SEVERITY = {
  'yuksek-akis':  'KRİTİK', 'surekli-akis': 'KRİTİK', 'kacak': 'KRİTİK',
  'gece-akis':    'UYARI',  'saat-akis':    'UYARI',
};

async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, error: 'token veya chatId eksik' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await r.json();
  if (!data.ok) console.error('[TELEGRAM] Hata:', JSON.stringify(data));
  return data;
}

async function sendAnomalyNotifications(userId, anomalies) {
  const user = await db.queryOne(`SELECT name, email FROM users WHERE id=$1`, [userId]);
  const s    = await db.queryOne(`SELECT notify_realtime_email, notify_telegram, telegram_chat_id FROM user_settings WHERE user_id=$1`, [userId]);
  if (!user || !s) return;

  for (const a of anomalies) {
    const severity = ANOMALY_SEVERITY[a.type] || 'BİLGİ';
    const ts = new Date(a.ts).toLocaleString('tr-TR');
    const deviceName = a.device || '—';

    if (s.notify_telegram && (s.telegram_chat_id || '').trim()) {
      const msg = `🚨 <b>SuSayar ${severity}</b>\n\n📍 Cihaz: ${deviceName}\n⚠️ ${a.detail}\n🕐 ${ts}`;
      await sendTelegram(s.telegram_chat_id.trim(), msg).catch(() => {});
    }

    const emailEnabled = s.notify_realtime_email === true || s.notify_realtime_email === 1 || s.notify_realtime_email === '1';
    console.log(`[NOTIFY] email_enabled=${emailEnabled} telegram_enabled=${!!s.notify_telegram} user=${user.email}`);
    if (emailEnabled) {
      const icon = { 'KRİTİK': '🔴', 'UYARI': '🟡', 'BİLGİ': '🔵' }[severity] || '🔔';
      sendMail({
        to: user.email,
        subject: `${icon} SuSayar ${severity}: ${a.detail.slice(0, 60)}`,
        html: mailHtml({ title: `${icon} ${severity} Uyarısı`, body: `
          <p>Merhaba <strong>${user.name}</strong>,</p>
          <p>Sisteminizde bir anomali tespit edildi:</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:80px">Cihaz</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;font-weight:600">${deviceName}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px">Açıklama</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px">${a.detail}</td></tr>
            <tr><td style="padding:10px 0;color:#64748b;font-size:13px">Zaman</td><td style="padding:10px 0;font-size:13px;color:#94a3b8">${ts}</td></tr>
          </table>
          <p style="font-size:13px;color:#64748b">Dashboard'dan anomaliyi görüntüleyip çözüldü olarak işaretleyebilirsiniz.</p>
        ` }),
      }).catch(() => {});
    }
  }
}

// ── Telegram Canlı Durum Paneli ──────────────────────────────
async function updateTelegramLivePanel(userId, data, deviceName) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const s = await db.queryOne(
    `SELECT notify_telegram, telegram_chat_id, telegram_live_msg_id FROM user_settings WHERE user_id=$1`, [userId]
  );
  if (!s?.notify_telegram || !s?.telegram_chat_id) return;

  const flow = (data.flow_lpm || 0).toFixed(2);
  const total = (data.total_liters || 0).toFixed(1);
  const status = parseFloat(flow) > 0 ? '🟢 Akış Var' : '⚪ Akış Yok';
  const ts = new Date().toLocaleString('tr-TR');
  const text = `📊 <b>SuSayar Canlı Durum</b>\n\n📡 Cihaz: ${deviceName || '—'}\n💧 Anlık Akış: <b>${flow} L/dk</b>\n📦 Toplam: ${total} L\n${status}\n\n🕐 Son güncelleme: ${ts}`;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = s.telegram_chat_id.trim();

  if (s.telegram_live_msg_id) {
    // Mevcut mesajı güncelle
    const r = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: parseInt(s.telegram_live_msg_id), text, parse_mode: 'HTML' }),
    });
    const d = await r.json();
    // Mesaj değişmediyse Telegram 400 döner — normal, yok say
    if (!d.ok && d.error_code !== 400) {
      // Mesaj silinmiş olabilir, yeniden gönder
      const r2 = await sendTelegram(chatId, text);
      if (r2?.ok && r2?.result?.message_id) {
        await db.queryRun(`UPDATE user_settings SET telegram_live_msg_id=$1 WHERE user_id=$2`,
          [String(r2.result.message_id), userId]);
      }
    }
  } else {
    // İlk kez gönder, mesaj ID'sini kaydet
    const result = await sendTelegram(chatId, text);
    if (result?.ok && result?.result?.message_id) {
      await db.queryRun(`UPDATE user_settings SET telegram_live_msg_id=$1 WHERE user_id=$2`,
        [String(result.result.message_id), userId]);
    }
  }
}

// Canlı paneli sıfırla (durdur)
app.post('/api/telegram/live/stop', requireAuth, async (req, res) => {
  try {
    await db.queryRun(`UPDATE user_settings SET telegram_live_msg_id=NULL WHERE user_id=$1`, [req.user.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Günlük / Haftalık Email Raporu ───────────────────────────
async function sendReports(type) {
  try {
    const field = type === 'daily' ? 'daily_report' : 'weekly_report';
    const users = await db.queryAll(
      `SELECT u.id, u.name, u.email FROM users u
       INNER JOIN user_settings s ON s.user_id = u.id
       WHERE s.${field} = 1 OR s.${field} = true`
    );
    for (const user of users) {
      const cutoff = new Date(Date.now() - (type === 'daily' ? 86400000 : 7 * 86400000)).toISOString();
      const anomCount = await db.queryOne(
        `SELECT COUNT(*) as n FROM anomalies WHERE user_id=$1 AND ts>=$2`, [user.id, cutoff]
      );
      const flowData = await db.queryOne(
        `SELECT SUM((flow_lpm/60.0)*2) as total FROM readings WHERE user_id=$1 AND ts>=$2`, [user.id, cutoff]
      );
      const totalL = parseFloat(flowData?.total || 0).toFixed(1);
      const anomN = parseInt(anomCount?.n || 0);
      const period = type === 'daily' ? 'günlük' : 'haftalık';
      await sendMail({
        to: user.email,
        subject: `SuSayar — ${type === 'daily' ? 'Günlük' : 'Haftalık'} Rapor`,
        html: mailHtml({ title: `${type === 'daily' ? 'Günlük' : 'Haftalık'} Özet`, body: `
          <p style="font-size:16px;color:#1e293b;margin:0 0 16px">Merhaba <strong>${user.name}</strong>,</p>
          <p style="font-size:14px;color:#475569;margin:0 0 24px">${type === 'daily' ? 'Bugünkü' : 'Bu haftaki'} su kullanım özetiniz:</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
            <tr><td style="padding:12px;background:#f8fafc;border-radius:8px;font-size:14px;color:#475569">Toplam Kullanım</td>
                <td style="padding:12px;font-size:20px;font-weight:700;color:#0f172a;text-align:right">${totalL} L</td></tr>
            <tr><td style="padding:12px;font-size:14px;color:#475569">Anomali Sayısı</td>
                <td style="padding:12px;font-size:20px;font-weight:700;color:${anomN > 0 ? '#ef4444' : '#22c55e'};text-align:right">${anomN}</td></tr>
          </table>
          <div style="text-align:center">
            <a href="https://www.susayar.com/susayar-dashboard.html" style="display:inline-block;background:#3bb5d4;color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700">Dashboard'ı Aç</a>
          </div>
        ` }),
      });
    }
    console.log(`[RAPOR] ${type} raporu gönderildi (${users.length} kullanıcı)`);
  } catch (e) { console.error('[RAPOR] Hata:', e.message); }
}

// Her gün sabah 08:00'de kontrol et
function scheduleReports() {
  const now = new Date();
  const next8am = new Date();
  next8am.setUTCHours(5, 0, 0, 0); // 08:00 TR (UTC+3)
  if (next8am <= now) next8am.setUTCDate(next8am.getUTCDate() + 1);
  setTimeout(() => {
    sendReports('daily');
    const dayOfWeek = new Date().getUTCDay(); // 1 = Pazartesi
    if (dayOfWeek === 1) sendReports('weekly');
    setInterval(() => {
      sendReports('daily');
      if (new Date().getUTCDay() === 1) sendReports('weekly');
    }, 24 * 60 * 60 * 1000);
  }, next8am - now);
}

// ── Cihaz Offline Kontrolü ────────────────────────────────────
async function checkOfflineDevices() {
  try {
    const offlineThresh = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 dk veri yok = offline
    // last_seen 5+ dk önce olan cihazlar
    const devices = await db.queryAll(
      `SELECT d.id, d.device_id, d.name, d.user_id, d.last_seen
       FROM devices d
       WHERE d.last_seen IS NOT NULL AND d.last_seen < $1`,
      [offlineThresh]
    );
    for (const dev of devices) {
      const usrSettings = await db.queryOne(`SELECT offline_repeat_min FROM user_settings WHERE user_id=$1`, [dev.user_id]);
      const offlineRepeatMin = usrSettings?.offline_repeat_min ?? 60;
      // En son cihaz-offline bildirimi (çözülmüş olsa bile) — offlineRepeatMin süre dolmadıysa atla
      const lastNotif = await db.queryOne(
        `SELECT ts FROM anomalies WHERE user_id=$1 AND type='cihaz-offline' AND device=$2 ORDER BY ts DESC LIMIT 1`,
        [dev.user_id, dev.device_id]
      );
      if (lastNotif) {
        const msSinceLast = Date.now() - new Date(lastNotif.ts).getTime();
        if (msSinceLast < offlineRepeatMin * 60 * 1000) continue;
      }
      // Hâlâ açık anomali varsa kapat
      const existing = await db.queryOne(
        `SELECT id FROM anomalies WHERE user_id=$1 AND type='cihaz-offline' AND device=$2 AND NOT resolved`,
        [dev.user_id, dev.device_id]
      );
      if (existing) {
        const resolvedTrue = db.isPg ? true : 1;
        await db.queryRun(`UPDATE anomalies SET resolved=$1 WHERE id=$2`, [resolvedTrue, existing.id]);
      }

      const offlineSince = new Date(dev.last_seen).toLocaleString('tr-TR');
      const detail = `${dev.name || dev.device_id} cihazından ${offlineSince} tarihinden beri veri gelmiyor`;
      const anomId = Date.now();
      const resolvedFalse = db.isPg ? false : 0;
      await db.queryRun(
        `INSERT INTO anomalies (id,user_id,type,device,detail,ts,resolved) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [anomId, dev.user_id, 'cihaz-offline', dev.device_id, detail, new Date().toISOString(), resolvedFalse]
      );
      broadcastToUser(dev.user_id, { type: 'anomaly', payload: { id: anomId, type: 'cihaz-offline', device: dev.device_id, detail, ts: new Date().toISOString(), resolved: false } });

      // Telegram + E-posta bildirimi (offline_enabled kontrolü)
      const s    = await db.queryOne(`SELECT notify_telegram, telegram_chat_id, offline_enabled FROM user_settings WHERE user_id=$1`, [dev.user_id]);
      const user = await db.queryOne(`SELECT name, email FROM users WHERE id=$1`, [dev.user_id]);
      const offlineEnabled = s?.offline_enabled !== 0 && s?.offline_enabled !== false;
      if (!offlineEnabled) {
        console.log(`[OFFLINE] ${dev.device_id} bildirimi kapalı, atlandı`);
        continue;
      }
      const offlineMsg = `🔴 <b>Cihaz Bağlantısı Kesildi</b>\n\n📡 ${dev.name || dev.device_id}\n⏱ Son veri: ${offlineSince}\n\nCihazı kontrol edin.`;
      if (s?.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
        await sendTelegram(s.telegram_chat_id.trim(), offlineMsg).catch(() => {});
      }
      if (user?.email) {
        sendMail({
          to: user.email,
          subject: `🔴 SuSayar — ${dev.name || dev.device_id} bağlantısı kesildi`,
          html: mailHtml({ title: '🔴 Cihaz Çevrimdışı', body: `
            <p>Merhaba <strong>${user.name}</strong>,</p>
            <p><strong>${dev.name || dev.device_id}</strong> cihazından bağlantı kesildi.</p>
            <p>Son veri: <strong>${offlineSince}</strong></p>
            <p>Cihazı kontrol edin.</p>
          ` }),
        }).catch(() => {});
      }
      console.log(`[OFFLINE] ${dev.device_id} (user: ${dev.user_id})`);
    }
  } catch (e) { console.error('[OFFLINE CHECK]', e.message); }
}

// ── AI Otomatik Analiz (her 10 dk) ───────────────────────────
const _aiAnalysisCooldown = {}; // userId → lastSentMs

async function runAIAutoAnalysis() {
  const ai = getAI();
  if (!ai) return;
  try {
    const users = await db.queryAll(
      `SELECT u.id, s.telegram_chat_id
       FROM users u JOIN user_settings s ON s.user_id = u.id
       WHERE (s.notify_telegram = TRUE OR s.notify_telegram = 1)
         AND s.telegram_chat_id IS NOT NULL AND s.telegram_chat_id != ''`
    );
    for (const user of users) {
      await _aiAnalyzeUser(ai, user.id, user.telegram_chat_id).catch(e =>
        console.error(`[AI-AUTO] user ${user.id}:`, e.message)
      );
    }
  } catch (e) { console.error('[AI-AUTO]', e.message); }
}

async function _aiAnalyzeUser(ai, userId, chatId) {
  const COOLDOWN_MS = 30 * 60 * 1000;
  if (_aiAnalysisCooldown[userId] && Date.now() - _aiAnalysisCooldown[userId] < COOLDOWN_MS) return;

  // Son 10 dk anlık ölçümler
  const cutoffNow  = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  const readings   = await db.queryAll(
    `SELECT flow_lpm, device_id, ts FROM readings WHERE user_id=$1 AND ts > $2 ORDER BY ts DESC LIMIT 30`,
    [userId, cutoffNow]
  );
  if (readings.length === 0) return;

  // Bugünkü toplam ve ortalama
  const cutoffDay  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const dayRows    = await db.queryAll(
    `SELECT flow_lpm, total_liters, ts FROM readings WHERE user_id=$1 AND ts > $2 ORDER BY ts`,
    [userId, cutoffDay]
  );
  const dayTotal   = dayRows.length > 1
    ? Math.max(0, dayRows[dayRows.length - 1].total_liters - dayRows[0].total_liters)
    : 0;
  const dayAvgLpm  = dayRows.length
    ? (dayRows.reduce((s, r) => s + (r.flow_lpm || 0), 0) / dayRows.length)
    : 0;

  // Son 7 günlük günlük toplam (haftanın profili)
  const cutoff7    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekRows   = await db.queryAll(
    `SELECT ts, total_liters FROM readings WHERE user_id=$1 AND ts > $2 ORDER BY ts`,
    [userId, cutoff7]
  );
  // Günlük toplam tüketim hesapla
  const dayMap = {};
  for (const r of weekRows) {
    const day = r.ts.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { min: r.total_liters, max: r.total_liters };
    dayMap[day].max = Math.max(dayMap[day].max, r.total_liters);
    dayMap[day].min = Math.min(dayMap[day].min, r.total_liters);
  }
  const weekProfile = Object.entries(dayMap)
    .map(([d, v]) => `${d}: ${Math.max(0, v.max - v.min).toFixed(0)}L`)
    .join(', ');

  // Saatlik profil — hangi saatte ne kadar akış var (son 7 gün ortalaması)
  const hourMap = {};
  for (const r of weekRows) {
    const h = new Date(r.ts).getHours();
    if (!hourMap[h]) hourMap[h] = [];
    hourMap[h].push(r.flow_lpm || 0);
  }
  const hourProfile = Object.entries(hourMap)
    .sort(([a], [b]) => a - b)
    .map(([h, v]) => `${h}:00=${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2)}`)
    .join(', ');

  // Aktif anomaliler
  const anomalies  = await db.queryAll(
    `SELECT type, detail, device FROM anomalies WHERE user_id=$1 AND resolved=FALSE ORDER BY ts DESC LIMIT 5`,
    [userId]
  );

  // Anomali geçmişi (son 7 gün, çözülmüş dahil)
  const anomHist   = await db.queryAll(
    `SELECT type, feedback, COUNT(*) as cnt FROM anomalies
     WHERE user_id=$1 AND ts > $2
     GROUP BY type, feedback`,
    [userId, cutoff7]
  );
  const anomSummary = anomHist.map(a =>
    `${a.type}(${a.cnt}x${a.feedback ? ',fb:' + a.feedback : ''})`
  ).join(', ');

  const settings = await db.queryOne(
    `SELECT high_flow_lpm, leak_flow_lpm, leak_cont_min, night_start_hour, night_end_hour FROM user_settings WHERE user_id=$1`,
    [userId]
  );

  const nowHour = new Date().getHours();
  const readingSummary = readings.slice(0, 6)
    .map(r => `${(r.flow_lpm || 0).toFixed(2)} L/dk`)
    .join(', ');

  const prompt = `Su izleme sistemi AI asistanısın. Tüm bağlamı değerlendirip karar ver.

ŞU AN (${nowHour}:xx):
- Son ölçümler: ${readingSummary}
- Aktif anomaliler: ${anomalies.length === 0 ? 'yok' : anomalies.map(a => a.type + ': ' + a.detail).join(' | ')}

BUGÜN:
- Toplam tüketim: ${dayTotal.toFixed(1)} L
- Ortalama akış: ${dayAvgLpm.toFixed(2)} L/dk

HAFTALIK GÜNLÜK TÜKETİM:
${weekProfile || 'veri yok'}

SAATLİK AKIŞ PROFİLİ (7 gün ortalaması):
${hourProfile || 'veri yok'}

ANOMALİ GEÇMİŞİ (7 gün): ${anomSummary || 'yok'}

EŞIKLER: yüksek=${settings?.high_flow_lpm || 8} L/dk, sızıntı=${settings?.leak_flow_lpm || 0.3} L/dk, gece=${settings?.night_start_hour || 0}-${settings?.night_end_hour || 5}

Saatlik profille kıyasla: şu anki akış bu saatte normal mi? Haftalık tüketim trendi var mı? Anomali geçmişiyle tutarlı mı?
Dikkat çekici durum varsa 2-3 cümle Türkçe yaz. Her şey normaldeyse tam olarak sadece NORMAL yaz.`;

  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0]?.text || '').trim();
  if (!text) return;

  if (text.startsWith('NORMAL')) {
    // AI sistem normal dedi → aktif akış anomalilerini otomatik çöz
    const resolvedVal = db.isPg ? true : 1;
    const flowTypes   = ['surekli-akis', 'yuksek-akis', 'kacak', 'gece-akis', 'saat-akis'];
    let resolvedCount = 0;
    for (const type of flowTypes) {
      const open = await db.queryAll(
        `SELECT id, device FROM anomalies WHERE user_id=$1 AND type=$2 AND NOT resolved`,
        [userId, type]
      );
      for (const a of open) {
        await db.queryRun(`UPDATE anomalies SET resolved=$1 WHERE id=$2`, [resolvedVal, a.id]);
        broadcastToUser(userId, { type: 'anomaly', payload: { id: a.id, type, device: a.device, resolved: true } });
        resolvedCount++;
      }
    }
    if (resolvedCount > 0 && chatId) {
      await sendTelegram(chatId.trim(),
        `✅ <b>SuSayar AI</b> • ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n\nSistem normal — ${resolvedCount} aktif anomali otomatik çözüldü.`
      ).catch(() => {});
    }
    console.log(`[AI-AUTO] Normal → ${resolvedCount} anomali çözüldü (user ${userId})`);
    return;
  }

  await sendTelegram(chatId.trim(),
    `🤖 <b>SuSayar AI • ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</b>\n\n${text}`
  ).catch(() => {});
  _aiAnalysisCooldown[userId] = Date.now();
  console.log(`[AI-AUTO] Bildirim gönderildi → user ${userId}`);
}

// ── AI Otonom Eşik Yöneticisi (günde bir) ────────────────────
async function runAIThresholdManager() {
  const ai = getAI();
  if (!ai) return;
  try {
    const users = await db.queryAll(
      `SELECT user_id FROM user_settings WHERE ai_auto_manage = TRUE OR ai_auto_manage = 1`
    );
    for (const row of users) {
      await _aiAutoUpdateThresholds(ai, row.user_id).catch(e =>
        console.error(`[AI-THRESH] user ${row.user_id}:`, e.message)
      );
    }
  } catch (e) { console.error('[AI-THRESH]', e.message); }
}

async function _aiAutoUpdateThresholds(ai, userId) {
  const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff7  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Akış dağılımı
  const flowRows = await db.queryAll(
    `SELECT flow_lpm FROM readings WHERE user_id=$1 AND ts > $2 AND flow_lpm > 0 ORDER BY flow_lpm`,
    [userId, cutoff14]
  );
  if (flowRows.length < 50) return;

  const flows = flowRows.map(r => r.flow_lpm);
  const avg   = flows.reduce((a, b) => a + b, 0) / flows.length;
  const max   = flows[flows.length - 1];
  const p95   = flows[Math.floor(flows.length * 0.95)];
  const p99   = flows[Math.floor(flows.length * 0.99)];

  // Günlük tüketim trendi (son 14 gün)
  const allRows = await db.queryAll(
    `SELECT ts, total_liters FROM readings WHERE user_id=$1 AND ts > $2 ORDER BY ts`,
    [userId, cutoff14]
  );
  const dayMap = {};
  for (const r of allRows) {
    const d = r.ts.slice(0, 10);
    if (!dayMap[d]) dayMap[d] = { min: r.total_liters, max: r.total_liters };
    dayMap[d].max = Math.max(dayMap[d].max, r.total_liters);
    dayMap[d].min = Math.min(dayMap[d].min, r.total_liters);
  }
  const dailyTotals = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ day: d, total: Math.max(0, v.max - v.min) }));
  const dailyAvg = dailyTotals.length
    ? dailyTotals.reduce((s, r) => s + r.total, 0) / dailyTotals.length
    : 0;
  const dailyMax = dailyTotals.length ? Math.max(...dailyTotals.map(r => r.total)) : 0;
  const trend = dailyTotals.length >= 7
    ? (() => {
        const first  = dailyTotals.slice(0, Math.floor(dailyTotals.length / 2)).reduce((s, r) => s + r.total, 0);
        const second = dailyTotals.slice(Math.floor(dailyTotals.length / 2)).reduce((s, r) => s + r.total, 0);
        const ratio  = first > 0 ? second / first : 1;
        return ratio > 1.15 ? 'artış' : ratio < 0.85 ? 'düşüş' : 'sabit';
      })()
    : 'yetersiz veri';

  // Saatlik profil — aktif saatler
  const hourMap = {};
  for (const r of allRows) {
    const h = new Date(r.ts).getHours();
    if (!hourMap[h]) hourMap[h] = 0;
    hourMap[h]++;
  }
  const activeHours = Object.entries(hourMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([h]) => parseInt(h))
    .sort((a, b) => a - b);
  const nightCandidateStart = activeHours.length
    ? (() => {
        // En düşük aktiviteli ardışık 5 saati bul
        let best = 0, bestScore = Infinity;
        for (let s = 0; s < 24; s++) {
          const score = [0,1,2,3,4].reduce((t, i) => t + (hourMap[(s + i) % 24] || 0), 0);
          if (score < bestScore) { bestScore = score; best = s; }
        }
        return best;
      })()
    : 0;
  const nightCandidateEnd = (nightCandidateStart + 5) % 24;

  // Anomali geçmişi ve geri bildirimler
  const anomStats = await db.queryAll(
    `SELECT type, feedback, COUNT(*) as cnt FROM anomalies
     WHERE user_id=$1 AND ts > $2
     GROUP BY type, feedback`,
    [userId, cutoff14]
  );
  const fpByType = {};
  const realByType = {};
  for (const a of anomStats) {
    if (a.feedback === 'false_positive') fpByType[a.type] = (fpByType[a.type] || 0) + parseInt(a.cnt);
    if (a.feedback === 'real')           realByType[a.type] = (realByType[a.type] || 0) + parseInt(a.cnt);
  }

  // Aylık tüketim (son 3 ay — prompt bağlamı için)
  const monthMap = {};
  const monthAllRows = await db.queryAll(
    `SELECT ts, total_liters FROM readings WHERE user_id=$1 AND ts > $2 ORDER BY ts`,
    [userId, cutoff90]
  );
  for (const r of monthAllRows) {
    const m = r.ts.slice(0, 7); // "2025-05"
    if (!monthMap[m]) monthMap[m] = { min: r.total_liters, max: r.total_liters };
    monthMap[m].max = Math.max(monthMap[m].max, r.total_liters);
    monthMap[m].min = Math.min(monthMap[m].min, r.total_liters);
  }
  const monthlyTotals = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => ({ month: m, total: Math.max(0, v.max - v.min) }));
  const monthlyStr = monthlyTotals.map(r => `${r.month}: ${r.total.toFixed(0)}L`).join(', ');
  const monthlyTrend = monthlyTotals.length >= 2
    ? (() => {
        const last  = monthlyTotals[monthlyTotals.length - 1].total;
        const prev  = monthlyTotals[monthlyTotals.length - 2].total;
        const diff  = prev > 0 ? ((last - prev) / prev * 100).toFixed(0) : 0;
        return diff > 0 ? `+${diff}% artış` : `${diff}% düşüş`;
      })()
    : 'yetersiz veri';

  const cur = await db.queryOne(`SELECT * FROM user_settings WHERE user_id=$1`, [userId]);
  if (!cur) return;

  const prompt = `Su yönetim sistemi AI yöneticisisin. Tüm verileri analiz edip ayarları optimize et.

AKIŞ İSTATİSTİKLERİ (14 gün, ${flowRows.length} ölçüm):
- Ortalama: ${avg.toFixed(2)} L/dk | Maks: ${max.toFixed(2)} L/dk
- 95. yüzdelik: ${p95.toFixed(2)} L/dk | 99. yüzdelik: ${p99.toFixed(2)} L/dk

GÜNLÜK TÜKETİM (14 gün):
- Ortalama: ${dailyAvg.toFixed(0)} L | Maks: ${dailyMax.toFixed(0)} L | Trend: ${trend}
- Son 7 gün: ${dailyTotals.slice(-7).map(r => r.day.slice(5) + ':' + r.total.toFixed(0) + 'L').join(', ')}

AYLIK TÜKETİM (son 3 ay):
${monthlyStr || 'veri yok'}
Aylık trend: ${monthlyTrend}

KULLANIM PATERNİ:
- En aktif saatler: ${activeHours.join(', ')}
- En düşük aktivite bloğu: ${nightCandidateStart}:00 – ${nightCandidateEnd}:00

ANOMALİ GERİ BİLDİRİMLERİ (14 gün):
- Yanlış pozitif: ${Object.entries(fpByType).map(([t, n]) => `${t}(${n}x)`).join(', ') || 'yok'}
- Gerçek sorun: ${Object.entries(realByType).map(([t, n]) => `${t}(${n}x)`).join(', ') || 'yok'}

MEVCUT AYARLAR:
- Yüksek akış eşiği: ${cur.high_flow_lpm} L/dk
- Sızıntı eşiği: ${cur.leak_flow_lpm} L/dk
- Sürekli akış süresi: ${cur.leak_cont_min} dk
- Gece aralığı: ${cur.night_start_hour}:00 – ${cur.night_end_hour}:00

KARAR KURALLARI:
- Yüksek akış eşiği: p99 × 1.3 iyi başlangıç. Çok yanlış pozitif varsa artır.
- Sızıntı eşiği: düşük akış ortalamasının 3 katı mantıklı. "kacak" tipi yanlış pozitifler varsa artır.
- Gece aralığı: kullanım paterni verisine göre gerçekten düşük aktiviteli saatler.
- Sürekli akış: aylık tüketim yüksekse (>1000L/ay) artır, düşükse azalt.
- Aylık artış trendi varsa eşikleri %10 gevşet; belirgin düşüş varsa sıkılaştır.

Yalnızca değişmesi gereken ayarları JSON döndür:
{"high_flow_lpm":X,"leak_flow_lpm":X,"leak_cont_min":X,"night_start_hour":X,"night_end_hour":X,"reason":"kısa Türkçe açıklama"}

Değişiklik gerekmiyorsa: {}
Min değerler: high≥2, leak≥0.05, cont≥10.`;

  const aiMsg = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = aiMsg.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const updates = JSON.parse(jsonMatch[0]);
  const reason  = updates.reason || 'Veri analizi';
  delete updates.reason;

  const ALLOWED = { high_flow_lpm: [2, 50], leak_flow_lpm: [0.05, 5], leak_cont_min: [10, 120], night_start_hour: [18, 23], night_end_hour: [0, 10] };
  const safe = Object.entries(updates).filter(([k, v]) => {
    if (!ALLOWED[k]) return false;
    const [min, max] = ALLOWED[k];
    return typeof v === 'number' && v >= min && v <= max;
  });
  if (safe.length === 0) return;

  const setClauses = safe.map(([k], i) => `${k}=$${i + 2}`).join(', ');
  const actionTs   = new Date().toISOString();
  const actionDesc = safe.map(([k, v]) => {
    const labels = { high_flow_lpm: 'Yüksek akış', leak_flow_lpm: 'Sızıntı eşiği', leak_cont_min: 'Sürekli akış', night_start_hour: 'Gece başlangıç', night_end_hour: 'Gece bitiş' };
    return `${labels[k] || k}→${v}`;
  }).join(', ');

  await db.queryRun(
    `UPDATE user_settings SET ${setClauses}, ai_last_action=$${safe.length + 2}, ai_last_action_ts=$${safe.length + 3} WHERE user_id=$1`,
    [userId, ...safe.map(([, v]) => v), actionDesc, actionTs]
  );
  await db.queryRun(
    `INSERT INTO ai_action_log (user_id, action, detail, ts) VALUES ($1, $2, $3, $4)`,
    [userId, actionDesc, reason, actionTs]
  ).catch(() => {});

  // Telegram bildirimi
  const s = await db.queryOne(`SELECT telegram_chat_id, notify_telegram FROM user_settings WHERE user_id=$1`, [userId]);
  if (s?.telegram_chat_id && (s.notify_telegram === true || s.notify_telegram === 1)) {
    const lines = safe.map(([k, v]) => {
      const labels = { high_flow_lpm: 'Yüksek akış eşiği', leak_flow_lpm: 'Sızıntı eşiği', leak_cont_min: 'Sürekli akış süresi', night_start_hour: 'Gece başlangıç saati', night_end_hour: 'Gece bitiş saati' };
      return `• ${labels[k] || k}: <b>${v}</b>`;
    }).join('\n');
    await sendTelegram(s.telegram_chat_id.trim(),
      `🤖 <b>AI Ayarları Güncelledi</b>\n\n${lines}\n\n💡 <i>${reason}</i>`
    ).catch(() => {});
  }

  console.log(`[AI-THRESH] user ${userId}: ${actionDesc} — ${reason}`);
}

// AI Yönetim sayfası için insights endpoint'i
app.get('/api/ai/insights', requireAuth, async (req, res) => {
  try {
    const userId   = req.user.id;
    const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Son 6 aylık tüketim
    const allRows = await db.queryAll(
      `SELECT ts, total_liters FROM readings WHERE user_id=$1 AND ts > $2 ORDER BY ts`,
      [userId, cutoff90]
    );
    const monthMap = {};
    for (const r of allRows) {
      const m = r.ts.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = { min: r.total_liters, max: r.total_liters };
      monthMap[m].max = Math.max(monthMap[m].max, r.total_liters);
      monthMap[m].min = Math.min(monthMap[m].min, r.total_liters);
    }
    const monthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, total: Math.max(0, v.max - v.min) }));

    // Son 30 günlük günlük tüketim
    const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dayRows  = await db.queryAll(
      `SELECT ts, total_liters FROM readings WHERE user_id=$1 AND ts > $2 ORDER BY ts`,
      [userId, cutoff30]
    );
    const dayMap = {};
    for (const r of dayRows) {
      const d = r.ts.slice(0, 10);
      if (!dayMap[d]) dayMap[d] = { min: r.total_liters, max: r.total_liters };
      dayMap[d].max = Math.max(dayMap[d].max, r.total_liters);
      dayMap[d].min = Math.min(dayMap[d].min, r.total_liters);
    }
    const daily = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, total: Math.max(0, v.max - v.min) }));

    // Aylık anomali sayısı
    const anomMonthly = await db.queryAll(
      `SELECT ts, resolved FROM anomalies WHERE user_id=$1 AND ts > $2`,
      [userId, cutoff90]
    );
    const anomByMonth = {};
    for (const a of anomMonthly) {
      const m = a.ts.slice(0, 7);
      if (!anomByMonth[m]) anomByMonth[m] = { total: 0, resolved: 0 };
      anomByMonth[m].total++;
      if (a.resolved === true || a.resolved === 1) anomByMonth[m].resolved++;
    }

    // AI log (son 20)
    const log = await db.queryAll(
      `SELECT action, detail, ts FROM ai_action_log WHERE user_id=$1 ORDER BY ts DESC LIMIT 20`,
      [userId]
    );

    // AI ayarları
    const settings = await db.queryOne(
      `SELECT ai_auto_manage, ai_last_action, ai_last_action_ts FROM user_settings WHERE user_id=$1`,
      [userId]
    );

    res.json({ ok: true, monthly, daily, anomByMonth, log, settings });
  } catch (e) {
    console.error('[AI-INSIGHTS]', e.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Manuel tetikleme endpoint'i
app.post('/api/ai/auto-manage', requireAuth, async (req, res) => {
  try {
    const ai = getAI();
    if (!ai) return res.status(503).json({ error: 'AI servisi yapılandırılmamış (ANTHROPIC_API_KEY eksik)' });
    await _aiAutoUpdateThresholds(ai, req.user.id);
    const s = await db.queryOne(`SELECT ai_last_action, ai_last_action_ts FROM user_settings WHERE user_id=$1`, [req.user.id]);
    res.json({ ok: true, last_action: s?.ai_last_action, last_action_ts: s?.ai_last_action_ts });
  } catch (e) {
    console.error('[AI-MANAGE]', e.message);
    res.status(500).json({ error: 'AI yönetim hatası' });
  }
});

// ── Başlat ────────────────────────────────────────────────────
async function start() {
  await db.initSchema();
  scheduleReports();
  // Cihaz offline kontrolü: başlangıçta + her 2 dakikada
  setTimeout(checkOfflineDevices, 10 * 1000);
  setInterval(checkOfflineDevices, 2 * 60 * 1000);
  // AI otomatik analiz: her 10 dakikada
  setInterval(runAIAutoAnalysis, 10 * 60 * 1000);
  // AI eşik yöneticisi: her 24 saatte + açılıştan 5 dk sonra ilk çalışma
  setTimeout(runAIThresholdManager, 5 * 60 * 1000);
  setInterval(runAIThresholdManager, 24 * 60 * 60 * 1000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║       SuSayar SaaS Backend Başladı           ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log(`  DB    → ${db.isPg ? 'PostgreSQL' : 'SQLite'}`);
    console.log(`  HTTP  → http://localhost:${PORT}`);
    console.log(`  WS    → ws://localhost:${PORT}/ws?token=JWT`);
    console.log('');
  });
}
start().catch(err => { console.error('Başlatma hatası:', err); process.exit(1); });

function shutdown(sig) {
  console.log(`\n[${sig}] Kapatılıyor...`);
  wss.clients.forEach(c => c.close());
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
