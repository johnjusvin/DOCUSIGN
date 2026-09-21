import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { sql, audit, setting } from '../db.js';
import { randomToken, randomId, randomUrlToken, sha256, secureCompare, nowIso } from '../crypto.js';
import { getStorage } from '../storage/index.js';
import { sessionMiddleware, requireAuth } from '../middleware.js';
import { createSession, destroySession, sessionByToken } from '../sessions.js';
import { buildAuthRouter } from '../routes/auth.js';
import { buildDocsRouter } from '../routes/docs.js';
import { buildRequestsRouter } from '../routes/requests.js';
import { buildPublicRequestsRouter } from '../routes/public.js';
import { buildStorageRouter } from '../routes/storage.js';
import { buildSettingsRouter } from '../routes/settings.js';
import { auditRouter } from '../routes/audit.js';
import { buildTemplatesRouter } from '../routes/templates.js';

const app = express();
app.use(express.json({ limit: '40mb' })); // localhost app; allows base64 PDF upload fallback
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(config.rootDir, 'web/dist')));

app.use('/api/auth', buildAuthRouter({ createSession, destroySession, sessionByToken }));
app.use('/api/docs', sessionMiddleware, requireAuth, buildDocsRouter());
app.use('/api/requests', sessionMiddleware, requireAuth, buildRequestsRouter());
app.use('/api/sign', buildPublicRequestsRouter());
app.use('/api/storage', sessionMiddleware, requireAuth, buildStorageRouter());
app.use('/api/settings', sessionMiddleware, requireAuth, buildSettingsRouter());
app.use('/api/audit', sessionMiddleware, requireAuth, auditRouter);
app.use('/api/templates', sessionMiddleware, requireAuth, buildTemplatesRouter());

app.get('*splat', (req, res) => {
  res.sendFile(path.join(config.rootDir, 'web/dist/index.html'));
});

export { app };

const err404 = (req, res) => res.status(404).json({ ok: false, error: 'Not found' });

export const notFound = err404;

export function errorHandler(err, req, res, _next) {
  const status = err && Number.isInteger(err.status) ? err.status : 500;
  const msg = status >= 500 ? 'Internal server error' : (err && err.message) || 'Bad request';
  if (status >= 500) console.error('[error]', req.method, req.url, err.stack || err);
  res.status(status).json({ ok: false, error: msg });
}

app.use(notFound);
app.use(errorHandler);