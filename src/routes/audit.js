import { Router } from 'express';
import { listAuditEvents } from '../db.js';
import { sessionMiddleware } from '../middleware.js';

export const auditRouter = Router();

auditRouter.get('/', sessionMiddleware, async (req, res) => {
  const { limit = 100, offset = 0, docId, requestId, signerId } = req.query;
  const events = await listAuditEvents({ limit: Number(limit), offset: Number(offset), docId, requestId, signerId });
  res.json({ ok: true, events });
});