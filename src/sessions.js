import { sql } from './db.js';
import { randomUrlToken, nowIso } from './crypto.js';

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export function createSession({ ip, userAgent } = {}) {
  const token = randomUrlToken(40);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();
  sql.run(
    'INSERT INTO app_sessions (token, user, created_at, expires_at) VALUES (?,?,?,?)',
    token, 'admin', now.toISOString(), expiresAt
  );
  return token;
}

export function destroySession(token) {
  if (!token) return;
  try {
    sql.run('DELETE FROM app_sessions WHERE token = ?', token);
  } catch {}
}

export function sessionByToken(token) {
  if (!token) return null;
  try {
    const row = sql.one('SELECT * FROM app_sessions WHERE token = ?', token);
    if (!row) return null;
    if (row.expires_at && row.expires_at <= new Date().toISOString()) {
      destroySession(token);
      return null;
    }
    return { user: row.user || 'admin', expiresAt: row.expires_at };
  } catch {
    return null;
  }
}
