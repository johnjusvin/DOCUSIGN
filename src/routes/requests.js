import { Router } from 'express';
import { sql, audit } from '../db.js';
import { sessionMiddleware } from '../middleware.js';
import {
  createRequest, requestDetail, cancelRequest,
  signersForRequest, fieldsForRequest,
} from '../services/requests.js';
import { config } from '../config.js';

export function buildRequestsRouter() {
  const r = Router();

  r.get('/', (req, res) => {
    const { status, docId } = req.query || {};
    const conds = [];
    const params = [];
    if (status) { conds.push('r.status = ?'); params.push(String(status).slice(0, 20)); }
    if (docId) { conds.push('r.doc_id = ?'); params.push(String(docId).slice(0, 80)); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = sql.all(
      `SELECT r.*, d.name AS doc_name FROM requests r JOIN documents d ON d.id = r.doc_id
       ${where} ORDER BY r.created_at DESC LIMIT 200`, ...params
    );
    const out = rows.map((row) => {
      const signers = signersForRequest(row.id);
      return {
        ...row,
        doc_name: row.doc_name,
        signer_count: signers.length,
        signed_count: signers.filter((s) => s.status === 'signed').length,
        signers: signers.map((s) => ({
          id: s.id, name: s.name, email: s.email, order_index: s.order_index,
          status: s.status, signed_at: s.signed_at,
          link: `${config.appUrl}/sign/${s.token}`,
        })),
      };
    });
    res.json({ ok: true, requests: out });
  });

  r.get('/:id', (req, res) => {
    try {
      const detail = requestDetail(req.params.id);
      const signers = detail.signers.map((s) => ({
        ...s, token: undefined,
        link: `${config.appUrl}/sign/${s.token}`,
      }));
      res.json({ ok: true, ...detail, signers });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  r.post('/', async (req, res) => {
    const { docId, signers, fields, mode, message, emailSubject, emailBody, expiresAt } = req.body || {};
    try {
      const created = await createRequest({
        docId, signers, fields, mode, message, emailSubject, emailBody, expiresAt,
        createdBy: req.user || null, ip: req.ip, userAgent: req.get('user-agent'),
      });
      const links = created.signers.map((s) => ({ ...s, link: `${config.appUrl}/sign/${s.token}` }));
      res.json({ ok: true, request: { ...created, signers: links } });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  r.post('/:id/cancel', (req, res) => {
    try {
      const out = cancelRequest({ requestId: req.params.id, user: req.user || null, ip: req.ip });
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  return r;
}

// Re-exported so app.js-style mounts keep working if needed
export { fieldsForRequest };
