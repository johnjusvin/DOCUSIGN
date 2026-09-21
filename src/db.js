import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from './config.js';
import { nowIso, randomId } from './crypto.js';

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  original_ref TEXT NOT NULL,
  signed_ref TEXT,
  certificate_ref TEXT,
  drive_meta TEXT,
  sha256 TEXT,
  page_sizes TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  message TEXT,
  email_subject TEXT,
  email_body TEXT,
  mode TEXT NOT NULL DEFAULT 'sequential',
  status TEXT NOT NULL DEFAULT 'Sent',
  link_token TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_token ON requests(link_token);
CREATE INDEX IF NOT EXISTS idx_requests_doc ON requests(doc_id);
CREATE TABLE IF NOT EXISTS signers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  viewed_at TEXT,
  started_at TEXT,
  signed_at TEXT,
  declined_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_signers_token ON signers(token);
CREATE INDEX IF NOT EXISTS idx_signers_request ON signers(request_id);
CREATE TABLE IF NOT EXISTS fields (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES requests(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES templates(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  type TEXT NOT NULL,
  signer_id TEXT,
  signer_index INTEGER,
  label TEXT DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1,
  options TEXT,
  value TEXT,
  filled INTEGER NOT NULL DEFAULT 0,
  font_size INTEGER NOT NULL DEFAULT 12
);
CREATE INDEX IF NOT EXISTS idx_fields_request ON fields(request_id);
CREATE INDEX IF NOT EXISTS idx_fields_template ON fields(template_id);
CREATE INDEX IF NOT EXISTS idx_fields_signer ON fields(signer_id);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  doc_id TEXT,
  request_id TEXT,
  signer_id TEXT,
  user TEXT,
  ip TEXT,
  user_agent TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_events(doc_id);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_events(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  original_ref TEXT NOT NULL,
  drive_meta TEXT,
  fields_config TEXT,
  roles TEXT,
  sha256 TEXT,
  page_sizes TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS app_sessions (
  token TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

export function initDb() {
  if (db) return db;
  const dbPath = path.join(config.dataDir, 'reditus.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  try {
    const cols = db.prepare('PRAGMA table_info(fields)').all();
    if (!cols.some((c) => c.name === 'font_size')) {
      db.exec('ALTER TABLE fields ADD COLUMN font_size INTEGER NOT NULL DEFAULT 12');
    }
  } catch {}
  return db;
}

export function getDb() {
  return db || initDb();
}

export const sql = {
  run(q, ...p) { const r = getDb().prepare(q).run(...p); return r; },
  one(q, ...p) { return getDb().prepare(q).get(...p); },
  all(q, ...p) { return getDb().prepare(q).all(...p); },
  tx(fn) {
    const d = getDb();
    d.exec('BEGIN');
    try { const out = fn(d); d.exec('COMMIT'); return out; }
    catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }
  },
};

export function setting(key, value) {
  if (value === undefined) {
    const row = sql.one('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : null;
  }
  sql.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    String(value)
  );
  return value;
}

export function audit({ event, docId, requestId, signerId, user, ip, userAgent, meta }) {
  sql.run(
    'INSERT INTO audit_events (event, doc_id, request_id, signer_id, user, ip, user_agent, meta, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    event, docId || null, requestId || null, signerId || null,
    user || null, ip || null, userAgent || null,
    meta ? JSON.stringify(meta) : null, nowIso()
  );
}

export function listAuditEvents({ limit = 200, offset = 0, docId, requestId, signerId } = {}) {
  const conds = [];
  const params = [];
  if (docId) { conds.push('doc_id = ?'); params.push(docId); }
  if (requestId) { conds.push('request_id = ?'); params.push(requestId); }
  if (signerId) { conds.push('signer_id = ?'); params.push(signerId); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = sql.all(
    `SELECT * FROM audit_events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    ...params, Math.max(1, Number(limit) || 200), Math.max(0, Number(offset) || 0)
  );
  return rows.map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
}

export function closeDb() {
  if (db) { try { db.close(); } catch {} db = null; }
}