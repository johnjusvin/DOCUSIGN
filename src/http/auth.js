import { Router } from 'express';
import cookieParser from 'cookie-parser';
import { config } from '../config.js';
import { sql, audit } from '../db.js';

const COOKIE = 'reditus_admin';
const MAX = 7 * 24 * 60 * 60 * 1000;

export const auth = Router();
auth.use(cookieParser());

auth.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) {
    sql.run('DELETE FROM app_sessions WHERE auth_token = ?', token);
  }
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

export function applyAuth(app) {
  app.use('/api/auth', auth);
}
