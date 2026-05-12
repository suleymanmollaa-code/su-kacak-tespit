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
const NIGHT_START  = parseInt(process.env.NIGHT_START_HOUR)      || 0;
const NIGHT_END    = parseInt(process.env.NIGHT_END_HOUR)        || 5;
const DRIP_THRESH  = parseFloat(process.env.DRIP_THRESHOLD_LPM)  || 0.5;
const DRIP_DUR_MIN = parseInt(process.env.DRIP_DURATION_MIN)     || 10;
const HIGH_MULT    = parseFloat(process.env.HIGH_FLOW_MULTIPLIER) || 2.0;
const LONG_FLOW_MIN= parseInt(process.env.LONG_FLOW_MIN)         || 30;

// ── Express ───────────────────────────────────────────────────
const app = express();
app.use(cors({
  origin : CORS_ORIGINS === '*' ? '*' : CORS_ORIGINS.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => res.redirect('/susayar-landing.html'));

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

// ── Anomali takip durumu (kullanıcı başına, RAM) ──────────────
const userState = new Map();
function getState(userId) {
  if (!userState.has(userId)) userState.set(userId, {
    nightFlowActive: false, dripStart: null, flowStartTs: null, lastFlowLpm: 0,
  });
  return userState.get(userId);
}

function broadcastToUser(userId, msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1 && c.userId === userId) c.send(str); });
}

async function detectAnomalies(reading) {
  const { user_id, device_id, flow_lpm, ts } = reading;
  const s = getState(user_id);
  const hour = new Date(ts).getHours();
  const isNight = hour >= NIGHT_START && hour < NIGHT_END;

  async function addAnom(type, detail) {
    const a = { id: Date.now(), user_id, type, device: device_id, detail, ts: new Date().toISOString() };
    await db.queryRun(
      `INSERT INTO anomalies (id, user_id, type, device, detail, ts, resolved)
       VALUES ($1,$2,$3,$4,$5,$6,${db.isPg ? 'FALSE' : '0'}) ON CONFLICT DO NOTHING`,
      [a.id, a.user_id, a.type, a.device, a.detail, a.ts]
    );
    broadcastToUser(user_id, { type: 'anomaly', payload: { ...a, resolved: false } });
    console.log(`[ANOMALI] ${type} | ${device_id}`);
  }

  if (isNight && flow_lpm > 0.1) {
    if (!s.nightFlowActive) { s.nightFlowActive = true; await addAnom('night_flow', `Gece ${String(hour).padStart(2,'0')}:xx — ${flow_lpm.toFixed(2)} L/dk`); }
  } else if (!isNight) { s.nightFlowActive = false; }

  if (flow_lpm > 0 && flow_lpm < DRIP_THRESH) {
    if (!s.dripStart) s.dripStart = new Date(ts);
    const mins = (Date.now() - s.dripStart.getTime()) / 60000;
    if (mins >= DRIP_DUR_MIN && s.lastFlowLpm === 0) await addAnom('drip', `${mins.toFixed(0)} dk damlama — ${flow_lpm.toFixed(2)} L/dk`);
  } else { s.dripStart = null; }

  if (flow_lpm > 0.1) {
    if (!s.flowStartTs) s.flowStartTs = new Date(ts);
    const mins = (Date.now() - s.flowStartTs.getTime()) / 60000;
    if (mins >= LONG_FLOW_MIN && s.lastFlowLpm > 0.1 && Math.floor(mins) % 10 === 0)
      await addAnom('long_flow', `${mins.toFixed(0)} dk kesintisiz — ${flow_lpm.toFixed(2)} L/dk`);
  } else { s.flowStartTs = null; }

  const avgRow = await db.queryOne(
    `SELECT AVG(flow_lpm) as avg FROM readings WHERE user_id=$1 AND device_id=$2 AND ts>=$3 AND flow_lpm>0`,
    [user_id, device_id, new Date(Date.now() - 86400000).toISOString()]
  );
  const avg = avgRow?.avg;
  if (avg && flow_lpm > avg * HIGH_MULT && flow_lpm > 5)
    await addAnom('high_flow', `Günlük ort. ${HIGH_MULT}x üstü — ${flow_lpm.toFixed(2)} L/dk (ort: ${parseFloat(avg).toFixed(2)})`);

  s.lastFlowLpm = flow_lpm;
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

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));

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
    await detectAnomalies(reading);
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

app.get('/api/anomalies', requireAuth, async (req, res) => {
  try {
    const showResolved = req.query.resolved === 'true';
    const rows = showResolved
      ? await db.queryAll(`SELECT * FROM anomalies WHERE user_id=$1 ORDER BY id DESC LIMIT 200`, [req.user.id])
      : await db.queryAll(`SELECT * FROM anomalies WHERE user_id=$1 AND resolved=${db.isPg?'FALSE':'0'} ORDER BY id DESC LIMIT 200`, [req.user.id]);
    res.json(rows.map(db.normalizeAnomaly));
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.post('/api/anomalies/:id/resolve', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const n = await db.queryRun(
      `UPDATE anomalies SET resolved=${db.isPg?'TRUE':'1'} WHERE id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    if (!n) return res.status(404).json({ error: 'Bulunamadı' });
    broadcastToUser(req.user.id, { type: 'anomaly_resolved', payload: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }); }
});

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const weekRow = await db.queryOne(`SELECT SUM((flow_lpm/60.0)*2.5) as total FROM readings WHERE user_id=$1 AND ts>=$2`, [uid, cutoff]);
    const weekL = parseFloat(weekRow?.total || 0);
    const [devRow, leakRow, readRow] = await Promise.all([
      db.queryOne(`SELECT COUNT(*) as n FROM devices   WHERE user_id=$1`, [uid]),
      db.queryOne(`SELECT COUNT(*) as n FROM anomalies WHERE user_id=$1`, [uid]),
      db.queryOne(`SELECT COUNT(*) as n FROM readings  WHERE user_id=$1`, [uid]),
    ]);
    res.json({
      active_devices : parseInt(devRow?.n  || 0),
      week_water_l   : Math.round(weekL),
      leaks_detected : parseInt(leakRow?.n || 0),
      saved_l        : Math.round(weekL * 0.185),
      total_readings : parseInt(readRow?.n || 0),
      uptime_since   : serverStart,
    });
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
      const [latest, history, anoms] = await Promise.all([
        db.queryOne(`SELECT * FROM readings WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [user.id]),
        db.queryAll(`SELECT * FROM readings WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [user.id]),
        db.queryAll(`SELECT * FROM anomalies WHERE user_id=$1 AND resolved=${db.isPg?'FALSE':'0'} ORDER BY id DESC LIMIT 20`, [user.id]),
      ]);
      ws.send(JSON.stringify({ type: 'init', payload: {
        latest: latest || null,
        history: history.reverse(),
        anomalies: anoms.map(db.normalizeAnomaly),
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
