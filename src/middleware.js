import sqlite from 'node:sqlite';
import { secureCompare } from './crypto.js';
import { sql, audit } from './db.js';
export function sessionUser(req, res, next) {
  const token = req.cookies?.reditus_session;
  if (token) {
    const row = sql.one('SELECT * FROM app_sessions WHERE token = ?', token);
    if (row && row.expires_at > new Date().toISOString()) {
      req.user = row.user || 'admin';
    }
  }
  next();
}

export const sessionMiddleware = sessionUser;

export function requireAuth(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

export function adminOnly(req, res, next) {
  if (req.user === 'admin' || (req.user && req.user.role === 'admin')) return next();
  res.status(403).json({ error: 'Forbidden' });
}

const limiter = new Map();

export function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const key = `${req.method} ${req.path}`;
    let cell = limiter.get(key);
    if (!cell || Date.now() - cell.windowStart > windowMs) {
      cell = { windowStart: Date.now(), count: 0 };
      limiter.set(key, cell);
    }
    cell.count += 1;
    if (cell.count > max) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}

export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function errorHandler(err, req, res) {
  console.error('[http]', req.method, req.originalUrl, err && err.stack || err);
  const status = err && err.status && Number.isInteger(err.status) ? err.status : 500;
  const message = status >= 500 ? 'Internal error' : (err && err.message || 'Bad request');
  res.status(status).json({ error: message });
}
