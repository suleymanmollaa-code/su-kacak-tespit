// db.js — Veritabanı Adaptörü
// Yerel: better-sqlite3 (senkron)
// Production (DATABASE_URL varsa): PostgreSQL (pg)

const isPg = !!process.env.DATABASE_URL;

let _db;   // SQLite instance
let _pool; // PG pool

if (isPg) {
  const { Pool } = require('pg');
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  console.log('[DB] PostgreSQL modu');
} else {
  let Database;
  try { Database = require('better-sqlite3'); } catch {
    console.error('[DB] better-sqlite3 yüklenemedi. DATABASE_URL ortam değişkenini ayarlayın.');
    process.exit(1);
  }
  const path = require('path');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'susayar.db');
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  console.log(`[DB] SQLite modu: ${DB_PATH}`);
}

// ── Şema ─────────────────────────────────────────────────────
const SCHEMA_PG = `
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS devices (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    name       TEXT NOT NULL,
    device_id  TEXT NOT NULL UNIQUE,
    api_key    TEXT NOT NULL UNIQUE,
    last_seen  TEXT,
    rssi_dbm   INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS readings (
    id           SERIAL PRIMARY KEY,
    user_id      TEXT NOT NULL,
    device_id    TEXT NOT NULL,
    flow_lpm     REAL NOT NULL,
    total_liters REAL NOT NULL,
    pulses       INTEGER,
    uptime_sec   INTEGER,
    rssi_dbm     INTEGER,
    ts           TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_readings_user   ON readings(user_id);
  CREATE INDEX IF NOT EXISTS idx_readings_ts     ON readings(ts);
  CREATE INDEX IF NOT EXISTS idx_readings_device ON readings(device_id, user_id);
  CREATE TABLE IF NOT EXISTS anomalies (
    id       BIGINT PRIMARY KEY,
    user_id  TEXT NOT NULL,
    type     TEXT NOT NULL,
    device   TEXT NOT NULL,
    detail   TEXT NOT NULL,
    ts       TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE
  );
  CREATE INDEX IF NOT EXISTS idx_anomalies_user ON anomalies(user_id);
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id              TEXT PRIMARY KEY REFERENCES users(id),
    alert_after_hour        INTEGER NOT NULL DEFAULT 22,
    alert_after_minute      INTEGER NOT NULL DEFAULT 0,
    continuous_flow_min     INTEGER NOT NULL DEFAULT 30,
    daily_report            BOOLEAN NOT NULL DEFAULT FALSE,
    weekly_report           BOOLEAN NOT NULL DEFAULT FALSE,
    notify_realtime_email   BOOLEAN NOT NULL DEFAULT FALSE,
    notify_telegram         BOOLEAN NOT NULL DEFAULT FALSE,
    telegram_chat_id        TEXT
  );
  CREATE TABLE IF NOT EXISTS device_alert_settings (
    user_id              TEXT NOT NULL,
    device_id            TEXT NOT NULL,
    alert_after_hour     INTEGER NOT NULL DEFAULT 22,
    alert_after_minute   INTEGER NOT NULL DEFAULT 0,
    continuous_flow_min  INTEGER NOT NULL DEFAULT 30,
    PRIMARY KEY (user_id, device_id)
  );
`;

const SCHEMA_SQLITE = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    device_id TEXT NOT NULL UNIQUE, api_key TEXT NOT NULL UNIQUE,
    last_seen TEXT, rssi_dbm INTEGER, created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
    device_id TEXT NOT NULL, flow_lpm REAL NOT NULL, total_liters REAL NOT NULL,
    pulses INTEGER, uptime_sec INTEGER, rssi_dbm INTEGER, ts TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_readings_user   ON readings(user_id);
  CREATE INDEX IF NOT EXISTS idx_readings_ts     ON readings(ts);
  CREATE INDEX IF NOT EXISTS idx_readings_device ON readings(device_id, user_id);
  CREATE TABLE IF NOT EXISTS anomalies (
    id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
    device TEXT NOT NULL, detail TEXT NOT NULL, ts TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_anomalies_user ON anomalies(user_id);
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY, alert_after_hour INTEGER NOT NULL DEFAULT 22,
    alert_after_minute INTEGER NOT NULL DEFAULT 0,
    continuous_flow_min INTEGER NOT NULL DEFAULT 30,
    daily_report INTEGER NOT NULL DEFAULT 0, weekly_report INTEGER NOT NULL DEFAULT 0,
    notify_realtime_email INTEGER NOT NULL DEFAULT 0,
    notify_telegram INTEGER NOT NULL DEFAULT 0, telegram_chat_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS device_alert_settings (
    user_id TEXT NOT NULL, device_id TEXT NOT NULL,
    alert_after_hour INTEGER NOT NULL DEFAULT 22,
    alert_after_minute INTEGER NOT NULL DEFAULT 0,
    continuous_flow_min INTEGER NOT NULL DEFAULT 30,
    PRIMARY KEY (user_id, device_id)
  );
`;

// ── Birleşik sorgu fonksiyonu ─────────────────────────────────
// Döndürür: { rows: [...] }
async function query(sql, params = []) {
  if (isPg) {
    return _pool.query(sql, params);
  } else {
    // SQLite için $1 → ? dönüşümü
    const sqSql = sql.replace(/\$(\d+)/g, '?');
    let rows;
    const lower = sqSql.trim().toLowerCase();
    if (lower.startsWith('select') || lower.startsWith('with')) {
      rows = _db.prepare(sqSql).all(...params);
    } else {
      const info = _db.prepare(sqSql).run(...params);
      rows = [{ rowCount: info.changes }];
    }
    return { rows };
  }
}

// Tek satır döndür
async function queryOne(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows[0] || null;
}

// Tüm satırları döndür
async function queryAll(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows;
}

// Etkilenen satır sayısı
async function queryRun(sql, params = []) {
  const { rows, rowCount } = await query(sql, params);
  return rowCount ?? (rows[0]?.rowCount ?? 0);
}

// Şemayı kur
async function initSchema() {
  if (isPg) {
    await _pool.query(SCHEMA_PG);
    await _pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter'`).catch(() => {});
    await _pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`).catch(() => {});
    await _pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TEXT`).catch(() => {});
    await _pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`).catch(() => {});
    await _pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified INTEGER NOT NULL DEFAULT 0`).catch(() => {});
    await _pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp TEXT`).catch(() => {});
    await _pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_expires TEXT`).catch(() => {});
    await _pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS alert_after_minute INTEGER NOT NULL DEFAULT 0`).catch(() => {});
    await _pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_realtime_email BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
    await _pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_telegram BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
    await _pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT`).catch(() => {});
    await _pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS telegram_live_msg_id TEXT`).catch(() => {});
  } else {
    _db.exec(SCHEMA_SQLITE);
    try { _db.exec(`ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'starter'`); } catch {}
    try { _db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT`); } catch {}
    try { _db.exec(`ALTER TABLE users ADD COLUMN reset_token_expires TEXT`); } catch {}
    try { _db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`); } catch {}
    try { _db.exec(`ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { _db.exec(`ALTER TABLE users ADD COLUMN email_otp TEXT`); } catch {}
    try { _db.exec(`ALTER TABLE users ADD COLUMN email_otp_expires TEXT`); } catch {}
    try { _db.exec(`ALTER TABLE user_settings ADD COLUMN alert_after_minute INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { _db.exec(`ALTER TABLE user_settings ADD COLUMN notify_realtime_email INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { _db.exec(`ALTER TABLE user_settings ADD COLUMN notify_telegram INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { _db.exec(`ALTER TABLE user_settings ADD COLUMN telegram_chat_id TEXT`); } catch {}
    try { _db.exec(`ALTER TABLE user_settings ADD COLUMN telegram_live_msg_id TEXT`); } catch {}
  }
}

// resolved alanını normalize et (SQLite 0/1 → boolean)
function normalizeAnomaly(a) {
  return a ? { ...a, resolved: a.resolved === true || a.resolved === 1 } : null;
}

function close() {
  if (_pool) _pool.end();
  if (_db)   _db.close();
}

module.exports = { query, queryOne, queryAll, queryRun, initSchema, normalizeAnomaly, close, isPg };
