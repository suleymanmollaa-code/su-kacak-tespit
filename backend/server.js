// ============================================================
// SuSayar SaaS Backend
// Yerel: SQLite | Production: PostgreSQL (DATABASE_URL)
// ============================================================

require('dotenv').config();
const express           = require('express');
const http              = require('http');
const { WebSocketServer } = require('ws');
const cors              = require('cors');
const path              = require('path');
const bcrypt            = require('bcryptjs');
const jwt               = require('jsonwebtoken');
const { randomUUID }    = require('crypto');
const db                = require('./db');

// ── Konfigürasyon ─────────────────────────────────────────────
const PORT         = parseInt(process.env.PORT)                  || 3001;
const JWT_SECRET   = process.env.JWT_SECRET                      || 'susayar-gizli-anahtar-degistirin';
const CORS_ORIGINS = process.env.CORS_ORIGINS                    || '*';

// ── Express ───────────────────────────────────────────────────
const app = express();
app.use(cors({
  origin : CORS_ORIGINS === '*' ? '*' : CORS_ORIGINS.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());
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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur' });
    if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });
    const exists = await db.queryOne(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (exists) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });
    const hash = await bcrypt.hash(password, 10);
    const user = { id: randomUUID(), name: name.trim(), email: email.toLowerCase().trim(), password: hash, created_at: new Date().toISOString() };
    await db.queryRun(`INSERT INTO users (id,name,email,password,created_at) VALUES ($1,$2,$3,$4,$5)`,
      [user.id, user.name, user.email, user.password, user.created_at]);
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[AUTH] Kayıt: ${user.email}`);
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/auth/login', async (req, res) => {
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

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await db.queryOne(`SELECT id, name, email, plan FROM users WHERE id=$1`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ ok: true, user });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

// ── Cihaz Yönetimi ────────────────────────────────────────────

app.get('/api/devices', requireAuth, async (req, res) => {
  try {
    const devs = await db.queryAll(
      `SELECT id,name,device_id,api_key,last_seen,rssi_dbm,created_at FROM devices WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(devs);
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/devices', requireAuth, async (req, res) => {
  try {
    const { name, device_id } = req.body;
    if (!name || !device_id) return res.status(400).json({ error: 'name ve device_id zorunludur' });
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

// ── Sensör ────────────────────────────────────────────────────

app.post('/api/sensor', requireDeviceKey, async (req, res) => {
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

// ── Stripe ────────────────────────────────────────────────────
const STRIPE_SK      = process.env.STRIPE_SECRET_KEY;
const STRIPE_WH      = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SUCCESS = process.env.STRIPE_SUCCESS_URL || 'https://susayar.com/susayar-dashboard.html?upgraded=1';
const STRIPE_CANCEL  = process.env.STRIPE_CANCEL_URL  || 'https://susayar.com/susayar-dashboard.html';

const PLANS = {
  individual: { name: 'SuSayar Bireysel', amount: 9900,  label: 'individual' },
  business:   { name: 'SuSayar Isletme',  amount: 24900, label: 'business'   },
  corporate:  { name: 'SuSayar Kurumsal', amount: 59900, label: 'corporate'  },
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
  } catch (e) { console.error('[STRIPE]', e.message); res.status(500).json({ error: e.message }); }
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
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'susayar-admin-2024';

function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Yetkisiz' });
  next();
}

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.queryAll(
      `SELECT id, name, email, plan, created_at FROM users ORDER BY created_at DESC`
    );
    res.json(users);
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.get('/api/admin/devices', requireAdmin, async (req, res) => {
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

app.post('/api/admin/devices', requireAdmin, async (req, res) => {
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

app.delete('/api/admin/devices/:id', requireAdmin, async (req, res) => {
  try {
    await db.queryRun(`DELETE FROM devices WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/admin/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['starter', 'individual', 'business', 'corporate'].includes(plan)) return res.status(400).json({ error: 'Geçersiz plan' });
    await db.queryRun(`UPDATE users SET plan=$1 WHERE id=$2`, [plan, req.params.id]);
    console.log(`[ADMIN] Plan güncellendi: ${req.params.id} → ${plan}`);
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

// ── Başlat ────────────────────────────────────────────────────
async function start() {
  await db.initSchema();
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
