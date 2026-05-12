// ============================================================
// SuSayar SaaS Backend
// Multi-tenant: her kullanıcı kendi cihazlarını ve verisini görür
// ESP32 → X-API-Key ile veri gönderir (device başına ayrı anahtar)
// Dashboard → JWT token ile WebSocket'e bağlanır
// ============================================================

require('dotenv').config();
const express           = require('express');
const http              = require('http');
const { WebSocketServer } = require('ws');
const cors              = require('cors');
const path              = require('path');
const bcrypt            = require('bcryptjs');
const jwt               = require('jsonwebtoken');
const Database          = require('better-sqlite3');
const { randomUUID }    = require('crypto');

// ── Konfigürasyon ─────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT)                 || 3001;
const JWT_SECRET     = process.env.JWT_SECRET                     || 'susayar-gizli-anahtar-degistirin';
const CORS_ORIGINS   = process.env.CORS_ORIGINS                   || '*';
const DB_PATH        = process.env.DB_PATH                        || path.join(__dirname, 'susayar.db');
const NIGHT_START    = parseInt(process.env.NIGHT_START_HOUR)     || 0;
const NIGHT_END      = parseInt(process.env.NIGHT_END_HOUR)       || 5;
const DRIP_THRESH    = parseFloat(process.env.DRIP_THRESHOLD_LPM) || 0.5;
const DRIP_DUR_MIN   = parseInt(process.env.DRIP_DURATION_MIN)    || 10;
const HIGH_MULT      = parseFloat(process.env.HIGH_FLOW_MULTIPLIER)|| 2.0;
const LONG_FLOW_MIN  = parseInt(process.env.LONG_FLOW_MIN)        || 30;

// ── SQLite Veritabanı ─────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS devices (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    device_id  TEXT NOT NULL UNIQUE,
    api_key    TEXT NOT NULL UNIQUE,
    last_seen  TEXT,
    rssi_dbm   INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL,
    device_id    TEXT NOT NULL,
    flow_lpm     REAL NOT NULL,
    total_liters REAL NOT NULL,
    pulses       INTEGER,
    uptime_sec   INTEGER,
    rssi_dbm     INTEGER,
    ts           TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_readings_ts     ON readings(ts);
  CREATE INDEX IF NOT EXISTS idx_readings_user   ON readings(user_id);
  CREATE INDEX IF NOT EXISTS idx_readings_device ON readings(device_id, user_id);

  CREATE TABLE IF NOT EXISTS anomalies (
    id       INTEGER PRIMARY KEY,
    user_id  TEXT NOT NULL,
    type     TEXT NOT NULL,
    device   TEXT NOT NULL,
    detail   TEXT NOT NULL,
    ts       TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_anomalies_user ON anomalies(user_id);
`);

// Hazır ifadeler
const stmtInsertReading = db.prepare(`
  INSERT INTO readings (user_id, device_id, flow_lpm, total_liters, pulses, uptime_sec, rssi_dbm, ts)
  VALUES (@user_id, @device_id, @flow_lpm, @total_liters, @pulses, @uptime_sec, @rssi_dbm, @ts)
`);
const stmtInsertAnomaly = db.prepare(`
  INSERT OR IGNORE INTO anomalies (id, user_id, type, device, detail, ts, resolved)
  VALUES (@id, @user_id, @type, @device, @detail, @ts, 0)
`);
const stmtResolveAnomaly = db.prepare(`
  UPDATE anomalies SET resolved = 1 WHERE id = ? AND user_id = ?
`);
const stmtInsertUser = db.prepare(`
  INSERT INTO users (id, name, email, password, created_at) VALUES (@id, @name, @email, @password, @created_at)
`);
const stmtInsertDevice = db.prepare(`
  INSERT INTO devices (id, user_id, name, device_id, api_key, created_at)
  VALUES (@id, @user_id, @name, @device_id, @api_key, @created_at)
`);
const stmtUpdateDeviceSeen = db.prepare(`
  UPDATE devices SET last_seen = ?, rssi_dbm = ? WHERE device_id = ? AND user_id = ?
`);

console.log(`[DB] SQLite: ${DB_PATH}`);

// ── Anomali takip durumu (kullanıcı başına) ───────────────────
const userState = new Map();

function getState(userId) {
  if (!userState.has(userId)) {
    userState.set(userId, {
      nightFlowActive : false,
      dripStart       : null,
      flowStartTs     : null,
      lastFlowLpm     : 0,
    });
  }
  return userState.get(userId);
}

// ── Express ───────────────────────────────────────────────────
const app = express();
app.use(cors({
  origin : CORS_ORIGINS === '*' ? '*' : CORS_ORIGINS.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Middleware'ler ────────────────────────────────────────────
function requireAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Yetkilendirme gerekli' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' }); }
}

function requireDeviceKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'X-API-Key header gerekli' });
  const device = db.prepare(`SELECT * FROM devices WHERE api_key = ?`).get(key);
  if (!device) return res.status(401).json({ error: 'Geçersiz API anahtarı' });
  req.device = device;
  next();
}

// ── Yardımcılar ───────────────────────────────────────────────
function findUserByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim());
}

function dailyAvgLpm(userId, deviceId) {
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const rows = db.prepare(`
    SELECT flow_lpm FROM readings
    WHERE user_id = ? AND device_id = ? AND ts >= ? AND flow_lpm > 0
  `).all(userId, deviceId, cutoff);
  if (rows.length < 2) return null;
  return rows.reduce((s, r) => s + r.flow_lpm, 0) / rows.length;
}

function broadcastToUser(userId, msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === 1 && c.userId === userId) c.send(str);
  });
}

// ── Anomali Motoru ────────────────────────────────────────────
function detectAnomalies(reading) {
  const { user_id, device_id, flow_lpm, ts } = reading;
  const s    = getState(user_id);
  const hour = new Date(ts).getHours();
  const isNight = hour >= NIGHT_START && hour < NIGHT_END;

  function addAnom(type, detail) {
    const a = { id: Date.now(), user_id, type, device: device_id, detail, ts: new Date().toISOString() };
    stmtInsertAnomaly.run(a);
    broadcastToUser(user_id, { type: 'anomaly', payload: { ...a, resolved: false } });
    console.log(`[ANOMALI] ${type} | ${device_id} | ${detail}`);
  }

  if (isNight && flow_lpm > 0.1) {
    if (!s.nightFlowActive) {
      s.nightFlowActive = true;
      addAnom('night_flow', `Gece ${String(hour).padStart(2,'0')}:xx — ${flow_lpm.toFixed(2)} L/dk`);
    }
  } else if (!isNight) {
    s.nightFlowActive = false;
  }

  if (flow_lpm > 0 && flow_lpm < DRIP_THRESH) {
    if (!s.dripStart) s.dripStart = new Date(ts);
    const mins = (Date.now() - s.dripStart.getTime()) / 60000;
    if (mins >= DRIP_DUR_MIN && s.lastFlowLpm === 0)
      addAnom('drip', `${mins.toFixed(0)} dk damlama — ${flow_lpm.toFixed(2)} L/dk`);
  } else { s.dripStart = null; }

  if (flow_lpm > 0.1) {
    if (!s.flowStartTs) s.flowStartTs = new Date(ts);
    const mins = (Date.now() - s.flowStartTs.getTime()) / 60000;
    if (mins >= LONG_FLOW_MIN && s.lastFlowLpm > 0.1 && Math.floor(mins) % 10 === 0)
      addAnom('long_flow', `${mins.toFixed(0)} dk kesintisiz — ${flow_lpm.toFixed(2)} L/dk`);
  } else { s.flowStartTs = null; }

  const avg = dailyAvgLpm(user_id, device_id);
  if (avg && flow_lpm > avg * HIGH_MULT && flow_lpm > 5)
    addAnom('high_flow', `Günlük ort. ${HIGH_MULT}x üstü — ${flow_lpm.toFixed(2)} L/dk (ort: ${avg.toFixed(2)})`);

  s.lastFlowLpm = flow_lpm;
}

// ── Auth Endpoint'leri ────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });
  if (findUserByEmail(email))
    return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: randomUUID(), name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hash, created_at: new Date().toISOString(),
  };
  stmtInsertUser.run(user);
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  console.log(`[AUTH] Kayıt: ${user.email}`);
  res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur' });
  const user = findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  console.log(`[AUTH] Giriş: ${user.email}`);
  res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));

// ── Cihaz Yönetimi ────────────────────────────────────────────

// GET /api/devices — kullanıcının cihazları
app.get('/api/devices', requireAuth, (req, res) => {
  const devs = db.prepare(`
    SELECT id, name, device_id, api_key, last_seen, rssi_dbm, created_at
    FROM devices WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json(devs);
});

// POST /api/devices — yeni cihaz ekle
app.post('/api/devices', requireAuth, (req, res) => {
  const { name, device_id } = req.body;
  if (!name || !device_id)
    return res.status(400).json({ error: 'name ve device_id zorunludur' });
  if (db.prepare(`SELECT id FROM devices WHERE device_id = ?`).get(device_id.trim()))
    return res.status(409).json({ error: 'Bu device_id zaten kayıtlı' });

  const dev = {
    id        : randomUUID(),
    user_id   : req.user.id,
    name      : name.trim(),
    device_id : device_id.trim(),
    api_key   : randomUUID().replace(/-/g, ''), // 32 kar hex
    created_at: new Date().toISOString(),
  };
  stmtInsertDevice.run(dev);
  console.log(`[DEVICE] Yeni: ${dev.device_id} → ${req.user.email}`);
  res.json({ ok: true, device: dev });
});

// DELETE /api/devices/:id — cihaz sil
app.delete('/api/devices/:id', requireAuth, (req, res) => {
  const r = db.prepare(`DELETE FROM devices WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Bulunamadı' });
  res.json({ ok: true });
});

// ── Sensör Endpoint (ESP32 → buraya veri gönderir) ────────────
app.post('/api/sensor', requireDeviceKey, (req, res) => {
  const data = req.body;
  if (typeof data.flow_lpm !== 'number' || typeof data.total_liters !== 'number')
    return res.status(400).json({ error: 'flow_lpm ve total_liters gerekli' });

  const reading = {
    user_id      : req.device.user_id,
    device_id    : req.device.device_id,
    flow_lpm     : data.flow_lpm,
    total_liters : data.total_liters,
    pulses       : data.pulses    ?? null,
    uptime_sec   : data.uptime_sec?? null,
    rssi_dbm     : data.rssi_dbm  ?? null,
    ts           : new Date().toISOString(),
  };

  stmtInsertReading.run(reading);
  stmtUpdateDeviceSeen.run(reading.ts, reading.rssi_dbm, reading.device_id, reading.user_id);
  detectAnomalies(reading);
  broadcastToUser(reading.user_id, { type: 'sensor_update', payload: reading });

  console.log(`[${reading.ts}] ${reading.device_id} | ${data.flow_lpm} L/dk | ${data.total_liters} L`);
  res.json({ ok: true, ts: reading.ts });
});

// ── Veri Endpoint'leri (auth + kullanıcıya özel) ──────────────

app.get('/api/latest', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM readings WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(req.user.id);
  res.json(row || { flow_lpm: 0, total_liters: 0, ts: null });
});

app.get('/api/history', requireAuth, (req, res) => {
  const n      = Math.min(parseInt(req.query.n) || 100, 10000);
  const device = req.query.device;
  const rows   = device
    ? db.prepare(`SELECT * FROM readings WHERE user_id=? AND device_id=? ORDER BY id DESC LIMIT ?`).all(req.user.id, device, n)
    : db.prepare(`SELECT * FROM readings WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(req.user.id, n);
  res.json(rows.reverse());
});

app.get('/api/anomalies', requireAuth, (req, res) => {
  const showResolved = req.query.resolved === 'true';
  const rows = showResolved
    ? db.prepare(`SELECT * FROM anomalies WHERE user_id=? ORDER BY id DESC LIMIT 200`).all(req.user.id)
    : db.prepare(`SELECT * FROM anomalies WHERE user_id=? AND resolved=0 ORDER BY id DESC LIMIT 200`).all(req.user.id);
  res.json(rows.map(a => ({ ...a, resolved: a.resolved === 1 })));
});

app.post('/api/anomalies/:id/resolve', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const r  = stmtResolveAnomaly.run(id, req.user.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Bulunamadı' });
  broadcastToUser(req.user.id, { type: 'anomaly_resolved', payload: { id } });
  res.json({ ok: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const uid        = req.user.id;
  const weekCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekL      = db.prepare(`SELECT SUM((flow_lpm/60.0)*2.5) as n FROM readings WHERE user_id=? AND ts>=?`).get(uid, weekCutoff).n || 0;
  res.json({
    active_devices : db.prepare(`SELECT COUNT(*) as n FROM devices   WHERE user_id=?`).get(uid).n,
    week_water_l   : Math.round(weekL),
    leaks_detected : db.prepare(`SELECT COUNT(*) as n FROM anomalies WHERE user_id=?`).get(uid).n,
    saved_l        : Math.round(weekL * 0.185),
    total_readings : db.prepare(`SELECT COUNT(*) as n FROM readings  WHERE user_id=?`).get(uid).n,
    uptime_since   : serverStart,
  });
});

app.get('/api/health', (req, res) => res.json({
  status: 'ok', uptime_s: Math.floor(process.uptime()),
  clients: wss.clients.size, ts: new Date().toISOString(),
}));

// ── HTTP + WebSocket ──────────────────────────────────────────
const server    = http.createServer(app);
const wss       = new WebSocketServer({ server, path: '/ws' });
const serverStart = new Date().toISOString();

wss.on('connection', (ws, req) => {
  const url   = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (token) {
    try {
      const user  = jwt.verify(token, JWT_SECRET);
      ws.userId   = user.id;

      // Kullanıcıya özel init verisi
      const latest  = db.prepare(`SELECT * FROM readings WHERE user_id=? ORDER BY id DESC LIMIT 1`).get(user.id);
      const history = db.prepare(`SELECT * FROM readings WHERE user_id=? ORDER BY id DESC LIMIT 50`).all(user.id).reverse();
      const anoms   = db.prepare(`SELECT * FROM anomalies WHERE user_id=? AND resolved=0 ORDER BY id DESC LIMIT 20`).all(user.id);
      ws.send(JSON.stringify({ type: 'init', payload: {
        latest   : latest || null,
        history,
        anomalies: anoms.map(a => ({ ...a, resolved: false })),
      }}));
    } catch {
      ws.close(1008, 'Geçersiz token');
      return;
    }
  }

  console.log(`[WS] Bağlandı | user: ${ws.userId || 'anonim'} | Aktif: ${wss.clients.size}`);
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
    } catch {}
  });
  ws.on('close', () => console.log(`[WS] Ayrıldı | Aktif: ${wss.clients.size}`));
  ws.on('error', err => console.error('[WS] Hata:', err.message));
});

// ── Başlat ────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║       SuSayar SaaS Backend Başladı           ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  HTTP  →  http://localhost:${PORT}`);
  console.log(`  WS    →  ws://localhost:${PORT}/ws?token=JWT`);
  console.log('');
  console.log('  Auth:    POST /api/auth/register | /login | GET /me');
  console.log('  Cihaz:   GET/POST /api/devices | DELETE /api/devices/:id');
  console.log('  Sensör:  POST /api/sensor  ← X-API-Key header gerekli');
  console.log('  Veri:    GET /api/latest | /history | /anomalies | /stats');
  console.log('');
});

// ── Graceful Shutdown ─────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[${signal}] Kapatılıyor...`);
  wss.clients.forEach(c => c.close());
  server.close(() => { db.close(); console.log('Kapatıldı.'); process.exit(0); });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
