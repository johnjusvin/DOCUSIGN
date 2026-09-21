import { Router } from 'express';
import { getStorage, currentStorageKind } from '../storage/index.js';
import { GoogleDriveStorage } from '../storage/drive.js';
import { sessionMiddleware } from '../middleware.js';
import { audit } from '../db.js';

const drive = new GoogleDriveStorage();
const VERIFIER_COOKIE = 'reditus_drive_v';

export function buildStorageRouter() {
  const r = Router();

  r.get('/describe', sessionMiddleware, async (req, res) => {
    try {
      const storage = getStorage();
      const desc = await storage.describe();
      res.json({ ok: true, storage: { ...desc, active: currentStorageKind() } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Storage unavailable' });
    }
  });

  r.get('/drive/status', sessionMiddleware, async (req, res) => {
    res.json({
      ok: true,
      drive: {
        configured: drive.isConfigured(),
        authorized: drive.isAuthorized(),
        active: currentStorageKind() === 'drive',
      },
    });
  });

  // Step 1: redirect the admin to Google's consent screen.
  r.get('/drive/oauth/start', sessionMiddleware, async (req, res) => {
    try {
      const { url, verifier } = await drive.authUrl();
      res.cookie(VERIFIER_COOKIE, verifier, {
        httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/',
      });
      res.json({ ok: true, url });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Step 2: Google redirects back here with ?code=... (must match GOOGLE_REDIRECT_URI).
  r.get('/drive/oauth/callback', async (req, res) => {
    try {
      const { code } = req.query || {};
      const verifier = req.cookies && req.cookies[VERIFIER_COOKIE];
      if (!code) throw new Error('Missing OAuth code');
      await drive.handleCallback(String(code), verifier);
      audit({ event: 'drive.authorized', user: req.user || null, ip: req.ip, userAgent: req.get('user-agent') });
      res.clearCookie(VERIFIER_COOKIE, { path: '/' });
      res.redirect('/settings?drive=connected');
    } catch (e) {
      res.status(400).send(`Google Drive authorization failed: ${e.message}`);
    }
  });

  r.post('/drive/disconnect', sessionMiddleware, async (req, res) => {
    const { setting } = await import('../db.js');
    setting('drive_tokens', '');
    setting('drive_folders', '');
    audit({ event: 'drive.disconnected', user: req.user || null, ip: req.ip });
    res.json({ ok: true });
  });

  return r;
}
