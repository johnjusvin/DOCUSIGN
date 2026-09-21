import { Router } from 'express';
import multer from 'multer';
import { sql, audit } from '../db.js';
import { sessionMiddleware } from '../middleware.js';
import { randomId, sha256, nowIso } from '../crypto.js';
import { config } from '../config.js';
import { getStorage } from '../storage/index.js';
import { getPageSizes } from '../services/pdf.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

function cleanName(name) {
  return (String(name || 'document.pdf').split(/[\\/]/).pop() || 'document.pdf')
    .replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'document.pdf';
}

function isPdf(buffer) {
  return buffer && buffer.length > 4 &&
    buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
}

export function buildDocsRouter() {
  const r = Router();

  r.get('/', sessionMiddleware, async (req, res) => {
    const { status, search, archived } = req.query || {};
    const conds = [];
    const params = [];
    if (status) { conds.push('status = ?'); params.push(String(status).slice(0, 20)); }
    if (search) { conds.push('name LIKE ?'); params.push(`%${String(search).slice(0, 80).replace(/[%_]/g, '')}%`); }
    if (archived === '1') conds.push('archived = 1');
    else if (archived === '0') conds.push('archived = 0');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const all = sql.all(`SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT 200`, ...params);
    res.json({ ok: true, documents: all });
  });

  // Upload a PDF original. This is how documents are created.
  // Accepts multipart (field "file") OR JSON { name, dataUrl } fallback
  // for networks that block multipart posts.
  r.post('/upload', sessionMiddleware, upload.single('file'), async (req, res) => {
    try {
      let buffer;
      let originalName;
      if (req.file && req.file.buffer) {
        if (req.file.mimetype !== 'application/pdf' && !isPdf(req.file.buffer)) {
          return res.status(400).json({ ok: false, error: 'Only PDF files are allowed' });
        }
        buffer = req.file.buffer;
        originalName = req.file.originalname;
      } else if (req.body && typeof req.body.dataUrl === 'string') {
        const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(req.body.dataUrl);
        if (!m) return res.status(400).json({ ok: false, error: 'Invalid PDF data (send data:application/pdf;base64,...)' });
        buffer = Buffer.from(m[1], 'base64');
        originalName = req.body.name || 'document.pdf';
      } else {
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }
      if (buffer.length > config.maxUploadBytes) {
        return res.status(413).json({ ok: false, error: 'PDF exceeds the maximum upload size' });
      }
      if (!isPdf(buffer)) return res.status(400).json({ ok: false, error: 'File is not a valid PDF' });
      const name = cleanName(req.body && req.body.name && !req.file ? req.body.name : originalName);
      let pageCount = 0;
      let pageSizes = [];
      try {
        const info = await getPageSizes(buffer);
        pageCount = info.pageCount;
        pageSizes = info.pageSizes;
      } catch (e) {
        return res.status(400).json({ ok: false, error: 'Could not parse PDF (corrupt or encrypted?)' });
      }
      const hash = sha256(buffer);
      const storage = getStorage();
      const ref = await storage.save({ cat: 'o', name, data: buffer });
      const id = randomId('doc');
      const now = nowIso();
      sql.run(
        `INSERT INTO documents (id, name, status, original_ref, sha256, page_sizes, page_count, size, archived, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, name, 'Draft', ref, hash, JSON.stringify(pageSizes), pageCount, buffer.length,
        0, req.user || null, now, now
      );
      audit({ event: 'document.uploaded', docId: id, user: req.user || null, ip: req.ip, userAgent: req.get('user-agent'), meta: { name, pageCount, hash } });
      const doc = sql.one('SELECT * FROM documents WHERE id = ?', id);
      res.json({ ok: true, document: { ...doc, pageSizes } });
    } catch (e) {
      if (e && e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'PDF exceeds the maximum upload size' });
      res.status(500).json({ ok: false, error: e.message || 'Upload failed' });
    }
  });

  r.get('/:id', sessionMiddleware, async (req, res) => {
    const doc = sql.one('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
    res.json({ ok: true, document: doc });
  });

  async function serveRef(req, res, pickRef) {
    const doc = sql.one('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
    const ref = pickRef(doc);
    if (!ref) return res.status(404).json({ ok: false, error: 'File not available yet' });
    try {
      const data = await getStorage().read(ref);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', data.length);
      res.setHeader('Content-Disposition', `attachment; filename="${cleanName(doc.name).replace(/"/g, '')}"`);
      res.send(data);
    } catch (e) {
      res.status(502).json({ ok: false, error: 'Could not read file from storage' });
    }
  }

  r.get('/:id/file', sessionMiddleware, (req, res) => serveRef(req, res, (d) => d.original_ref));
  r.get('/:id/signed', sessionMiddleware, (req, res) => serveRef(req, res, (d) => d.signed_ref));
  r.get('/:id/certificate', sessionMiddleware, (req, res) => serveRef(req, res, (d) => d.certificate_ref));

  r.put('/:id', sessionMiddleware, async (req, res) => {
    const doc = sql.one('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
    const { name, archived } = req.body || {};
    const next = {
      name: name !== undefined ? cleanName(name) : doc.name,
      archived: archived === undefined ? doc.archived : (archived ? 1 : 0),
    };
    if (!next.name) return res.status(400).json({ ok: false, error: 'Name required' });
    sql.run('UPDATE documents SET name = ?, archived = ?, updated_at = ? WHERE id = ?', next.name, next.archived, nowIso(), doc.id);
    audit({ event: 'document.updated', docId: doc.id, user: req.user || null, ip: req.ip, meta: next });
    res.json({ ok: true, document: sql.one('SELECT * FROM documents WHERE id = ?', doc.id) });
  });

  r.delete('/:id', sessionMiddleware, async (req, res) => {
    const doc = sql.one('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
    if (req.query.confirm !== 'true' && (!req.body || req.body.confirm !== true)) {
      return res.status(400).json({ ok: false, error: 'Deletion requires explicit confirmation' });
    }
    const storage = getStorage();
    for (const ref of [doc.original_ref, doc.signed_ref, doc.certificate_ref]) {
      if (ref) { try { await storage.remove(ref); } catch {} }
    }
    sql.run('DELETE FROM documents WHERE id = ?', doc.id);
    audit({ event: 'document.deleted', docId: doc.id, user: req.user || null, ip: req.ip });
    res.json({ ok: true });
  });

  return r;
}
