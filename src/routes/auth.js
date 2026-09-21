import { Router } from 'express';
import cookieParser from 'cookie-parser';
import { config } from '../config.js';
import { sql } from '../db.js';
import { randomUrlToken, nowIso, secureCompare } from '../crypto.js';

const COOKIE = 'reditus_session';
const MAX = 7 * 24 * 60 * 60 * 1000;

function buildAuthRouter({ createSession, destroySession, sessionByToken }) {
  const r = Router();

  r.get('/session', (req, res) => {
    const token = req.cookies && req.cookies[COOKIE];
    const s = token ? sessionByToken(token) : null;
    res.json({ ok: Boolean(s), user: s ? s.user : null });
  });

  r.post('/login', (req, res) => {
    const user = String(req.body && req.body.username || '').trim();
    const pass = String(req.body && req.body.password || '');
    if (!secureCompare(user, config.adminUser) || !secureCompare(pass, config.adminPassword)) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    const token = createSession({ ip: req.ip, userAgent: req.get('user-agent') });
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', maxAge: MAX, path: '/' });
    res.json({ ok: true, user });
  });

  r.post('/logout', (req, res) => {
    const token = req.cookies && req.cookies[COOKIE];
    if (token) { destroySession(token); }
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return r;
}

export { buildAuthRouter };