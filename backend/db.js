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
  } else {
    _db.exec(SCHEMA_SQLITE);
    try { _db.exec(`ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'starter'`); } catch {}
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
