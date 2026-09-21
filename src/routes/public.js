import { Router } from 'express';
import { getStorage } from '../storage/index.js';
import { rateLimit } from '../middleware.js';
import {
  signerByToken, requestById, docById,
  fieldsForRequest, signersForRequest,
  touchSignerViewed, signRequest, declineSigner,
} from '../services/requests.js';

function err(res, e) {
  res.status(e.status || 500).json({ ok: false, error: e.message || 'Request failed' });
}

function publicSignerView(signer) {
  return { id: signer.id, name: signer.name, email: signer.email, order_index: signer.order_index, status: signer.status };
}

// Public signer flow. No session auth — the high-entropy per-signer token IS the credential.
export function buildPublicRequestsRouter() {
  const r = Router();

  // Signer opens the link: identity check + envelope snapshot (tokens of others never exposed)
  r.get('/:token', async (req, res) => {
    try {
      const signer = signerByToken(req.params.token);
      if (!signer) return res.status(404).json({ ok: false, error: 'Signing link not found' });
      const request = requestById(signer.request_id);
      if (!request) return res.status(404).json({ ok: false, error: 'Request not found' });
      const doc = docById(request.doc_id);
      if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
      const fresh = touchSignerViewed(signer, { ip: req.ip, userAgent: req.get('user-agent') });
      const fields = fieldsForRequest(request.id).map((f) => ({
        id: f.id, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
        type: f.type, label: f.label, required: !!f.required, font_size: f.font_size || 12,
        options: f.options ? f.options.split(/\r?\n/).map((o) => o.trim()).filter(Boolean) : [],
        mine: f.signer_id === signer.id,
        filled: !!f.filled,
        // Never leak other signers' values; only expose own filled state subtly via `filled`
        value: f.signer_id === signer.id && f.filled ? f.value : null,
      }));
      const fellows = signersForRequest(request.id).map((s) => ({
        name: s.name, order_index: s.order_index,
        status: s.status === 'signed' ? 'signed' : (s.id === signer.id ? s.status : 'pending'),
      }));
      res.json({
        ok: true,
        signer: publicSignerView(fresh || signer),
        request: {
          id: request.id, mode: request.mode, status: request.status,
          message: request.message, email_subject: request.email_subject, email_body: request.email_body,
          expires_at: request.expires_at,
        },
        document: {
          id: doc.id, name: doc.name, page_count: doc.page_count,
          page_sizes: doc.page_sizes ? JSON.parse(doc.page_sizes) : [],
          size: doc.size,
        },
        fields,
        signers: fellows,
        documentUrl: `/api/sign/${signer.token}/document`,
      });
    } catch (e) { err(res, e); }
  });

  // Serve the original PDF bytes to the token holder (used by the pdf.js viewer)
  r.get('/:token/document', async (req, res) => {
    try {
      const signer = signerByToken(req.params.token);
      if (!signer) return res.status(404).json({ ok: false, error: 'Signing link not found' });
      const request = requestById(signer.request_id);
      if (!request || ['Cancelled', 'Expired'].includes(request.status)) {
        return res.status(410).json({ ok: false, error: 'This signing link is no longer available' });
      }
      const doc = docById(request.doc_id);
      if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
      const storage = getStorage();
      const data = await storage.read(doc.original_ref);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', data.length);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(data);
    } catch (e) { err(res, e); }
  });

  r.post('/:token/sign', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
    try {
      const out = await signRequest({
        signerToken: req.params.token,
        values: (req.body && req.body.values) || (req.body && req.body.fields) || {},
        ip: req.ip, userAgent: req.get('user-agent'),
      });
      res.json({ ok: true, ...out });
    } catch (e) { err(res, e); }
  });

  r.post('/:token/decline', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
    try {
      const out = declineSigner({
        signerToken: req.params.token,
        reason: req.body && req.body.reason,
        ip: req.ip, userAgent: req.get('user-agent'),
      });
      res.json({ ok: true, ...out });
    } catch (e) { err(res, e); }
  });

  return r;
}
