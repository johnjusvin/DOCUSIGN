import { Router } from 'express';
import { sql, setting } from '../db.js';
import { sessionMiddleware } from '../middleware.js';

export function buildSettingsRouter() {
  const r = Router();

  r.get('/', sessionMiddleware, async (req, res) => {
    const keys = ['app_url', 'adminUser', 'adminPassword', 'maxUploadBytes', 'maxSigImageBytes', 'signingLinkExpiryHours', 'storage'];
    const result = {};
    for (const key of keys) {
      result[key] = setting(key);
    }
    res.json({ ok: true, settings: result });
  });

  r.post('/', sessionMiddleware, async (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, error: 'Key required' });
    setting(key, value);
    res.json({ ok: true });
  });

  return r;
}