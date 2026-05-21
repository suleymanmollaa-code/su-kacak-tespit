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

// ── Express ───────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // Render reverse proxy arkasında çalışır
app.use(helmet({ contentSecurityPolicy: false })); // güvenlik headerları
app.use(cors({
  origin: CORS_ORIGINS.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '10kb' })); // body boyutu sınırı
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'susayar-landing.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'susayar-admin.html')));

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
    if (!sent) console.log(`[AUTH] OTP (${user.email}): ${otp}`);
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[AUTH] Kayıt: ${user.email}`);
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, phone_verified: 0 }, needsVerification: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// OTP doğrula
app.post('/api/auth/verify-otp', requireAuth, async (req, res) => {
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
    if (!sent) console.log(`[AUTH] OTP yeniden (${user.email}): ${otp}`);
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
app.post('/api/auth/reset-password', async (req, res) => {
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

// DELETE /api/readings kaldırıldı — veriler korunur

// ── Kullanıcı Ayarları ────────────────────────────────────────
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    let s = await db.queryOne(`SELECT * FROM user_settings WHERE user_id=$1`, [req.user.id]);
    if (!s) s = { user_id: req.user.id, alert_after_hour: 22, continuous_flow_min: 30, daily_report: false, weekly_report: false };
    res.json({ ok: true, settings: { alert_after_hour: s.alert_after_hour, continuous_flow_min: s.continuous_flow_min, daily_report: !!s.daily_report, weekly_report: !!s.weekly_report } });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const { alert_after_hour, continuous_flow_min, daily_report, weekly_report } = req.body;
    const hour = parseInt(alert_after_hour ?? 22);
    const mins = parseInt(continuous_flow_min ?? 30);
    if (hour < 0 || hour > 23) return res.status(400).json({ error: 'Saat 0-23 arasında olmalı' });
    if (mins < 5 || mins > 1440) return res.status(400).json({ error: 'Süre 5-1440 dk arasında olmalı' });
    await db.queryRun(
      `INSERT INTO user_settings (user_id,alert_after_hour,continuous_flow_min,daily_report,weekly_report)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET alert_after_hour=$2, continuous_flow_min=$3, daily_report=$4, weekly_report=$5`,
      [req.user.id, hour, mins, daily_report ? 1 : 0, weekly_report ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

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

    // ── Anomali tespiti ─────────────────────────────────────
    const trHour = ((new Date().getUTCHours() + 3) % 24 + 24) % 24;
    const anomalies = [];

    // Kullanıcı ayarlarını al
    const settings = await db.queryOne(`SELECT * FROM user_settings WHERE user_id=$1`, [reading.user_id]);
    const alertHour      = settings?.alert_after_hour     ?? 22;
    const contFlowMin    = settings?.continuous_flow_min  ?? 30;

    // Gece akışı (00:00–05:00 arası flow > 0.1 L/dk)
    if (trHour >= 0 && trHour < 5 && reading.flow_lpm > 0.1) {
      anomalies.push({ type: 'gece-akis', detail: `${trHour}:00 saatinde ${reading.flow_lpm.toFixed(1)} L/dk akış tespit edildi` });
    }
    // Kullanıcının belirlediği saatten sonra akış
    if (trHour >= alertHour && reading.flow_lpm > 0.1) {
      anomalies.push({ type: 'saat-akis', detail: `${trHour}:00 saatinde (${alertHour}:00 sonrası) ${reading.flow_lpm.toFixed(1)} L/dk akış tespit edildi` });
    }
    // Çok yüksek akış (>8 L/dk)
    if (reading.flow_lpm > 8) {
      anomalies.push({ type: 'yuksek-akis', detail: `Anlık akış ${reading.flow_lpm.toFixed(1)} L/dk — anormal yüksek` });
    }
    // Sürekli akış tespiti
    if (reading.flow_lpm > 0.1) {
      const cutoffCont = new Date(Date.now() - contFlowMin * 60 * 1000).toISOString();
      const contRows = await db.queryAll(
        `SELECT flow_lpm FROM readings WHERE user_id=$1 AND device_id=$2 AND ts>=$3 ORDER BY ts DESC`,
        [reading.user_id, reading.device_id, cutoffCont]
      );
      const minCount = Math.floor((contFlowMin * 60) / (2.5)); // ~her 2.5sn bir okuma
      if (contRows.length >= minCount && contRows.every(r => r.flow_lpm > 0.1)) {
        anomalies.push({ type: 'surekli-akis', detail: `${contFlowMin} dakikadır sürekli akış: ${reading.flow_lpm.toFixed(1)} L/dk — olası kaçak` });
      }
    }

    for (const a of anomalies) {
      // Aynı tipte son 30 dk içinde anomali varsa tekrar ekleme
      const cutoff30 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const existing = await db.queryOne(
        `SELECT id FROM anomalies WHERE user_id=$1 AND type=$2 AND ts>=$3`,
        [reading.user_id, a.type, cutoff30]
      );
      if (!existing) {
        const anomId = Date.now();
        await db.queryRun(
          `INSERT INTO anomalies (id,user_id,type,device,detail,ts,resolved) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [anomId, reading.user_id, a.type, reading.device_id, a.detail, reading.ts, 0]
        );
        broadcastToUser(reading.user_id, { type: 'anomaly', payload: { id: anomId, ...a, device: reading.device_id, ts: reading.ts, resolved: false } });
      }
    }

    console.log(`[${reading.ts}] ${reading.device_id} | ${data.flow_lpm} L/dk | ${data.total_liters} L`);
    res.json({ ok: true, ts: reading.ts });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Veri Endpoint'leri ────────────────────────────────────────

app.get('/api/latest', requireAuth, async (req, res) => {
  try {
    const row = await db.queryOne(`SELECT * FROM readings WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [req.user.id]);
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
    const uid  = req.user.id;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Geçersiz tarih formatı (YYYY-MM-DD)' });
    // TR saat dilimine göre gün başı/sonu (UTC+3)
    const dayStart = date + 'T00:00:00.000+03:00';
    const dayEnd   = date + 'T23:59:59.999+03:00';

    let rows;
    if (db.isPg) {
      rows = await db.queryAll(
        `SELECT to_char(ts::timestamptz AT TIME ZONE 'Europe/Istanbul', 'HH24') AS hour,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3
         GROUP BY hour ORDER BY hour`, [uid, dayStart, dayEnd]);
    } else {
      rows = await db.queryAll(
        `SELECT strftime('%H', datetime(ts, '+3 hours')) AS hour,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3
         GROUP BY hour ORDER BY hour`, [uid, dayStart, dayEnd]);
    }

    const total = rows.reduce((s, r) => s + parseFloat(r.liters || 0), 0);
    res.json({ date, total_liters: Math.round(total * 10) / 10, hours: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Aylık Rapor (günlük tüketim) ──────────────────────────────
app.get('/api/reports/monthly', requireAuth, async (req, res) => {
  try {
    const uid   = req.user.id;
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Geçersiz ay formatı (YYYY-MM)' });
    const monthStart = month + '-01T00:00:00.000+03:00';
    const monthEnd   = month + '-31T23:59:59.999+03:00';

    let rows;
    if (db.isPg) {
      rows = await db.queryAll(
        `SELECT to_char(ts::timestamptz AT TIME ZONE 'Europe/Istanbul', 'DD') AS day,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3
         GROUP BY day ORDER BY day`, [uid, monthStart, monthEnd]);
    } else {
      rows = await db.queryAll(
        `SELECT strftime('%d', datetime(ts, '+3 hours')) AS day,
                SUM((flow_lpm / 60.0) * 2.5) AS liters,
                AVG(flow_lpm) AS avg_lpm, MAX(flow_lpm) AS max_lpm, COUNT(*) AS n
         FROM readings WHERE user_id=$1 AND ts>=$2 AND ts<=$3
         GROUP BY day ORDER BY day`, [uid, monthStart, monthEnd]);
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
const ADMIN_SECRET = process.env.ADMIN_SECRET;
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
app.post('/api/talep', async (req, res) => {
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

app.get('/api/health', (req, res) => res.json({
  status: 'ok', uptime_s: Math.floor(process.uptime()),
  clients: wss.clients.size, db: db.isPg ? 'postgresql' : 'sqlite',
  ts: new Date().toISOString(),
}));

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

// ── Başlat ────────────────────────────────────────────────────
async function start() {
  await db.initSchema();
  scheduleReports();
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
