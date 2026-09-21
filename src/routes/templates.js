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
  return (String(name || 'template.pdf').split(/[\\/]/).pop() || 'template.pdf')
    .replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'template.pdf';
}

function isPdf(buffer) {
  return buffer && buffer.length > 4 &&
    buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

export function buildTemplatesRouter() {
  const r = Router();

  r.get('/', sessionMiddleware, async (req, res) => {
    const all = sql.all('SELECT * FROM templates ORDER BY created_at DESC');
    res.json({
      ok: true,
      templates: all.map((t) => ({
        ...t,
        has_source: !!t.original_ref,
        field_count: (() => { try { return (JSON.parse(t.fields_config || '[]')).length; } catch { return 0; } })(),
      })),
    });
  });

  r.post('/', sessionMiddleware, async (req, res) => {
    const { name, description, originalRef, fieldsConfig, roles } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'Name required' });
    const id = randomId('temp');
    sql.run(
      'INSERT INTO templates (id, name, description, original_ref, fields_config, roles, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
      id, String(name).trim().slice(0, 120), description || null, originalRef || '',
      fieldsConfig || null, roles || null, req.user || null, nowIso()
    );
    audit({ event: 'template.created', user: req.user || null, ip: req.ip, meta: { id } });
    res.json({ ok: true, id });
  });

  r.get('/:id', sessionMiddleware, async (req, res) => {
    const temp = sql.one('SELECT * FROM templates WHERE id = ?', req.params.id);
    if (!temp) return res.status(404).json({ ok: false, error: 'Template not found' });
    res.json({ ok: true, template: temp });
  });

  r.put('/:id', sessionMiddleware, async (req, res) => {
    const temp = sql.one('SELECT * FROM templates WHERE id = ?', req.params.id);
    if (!temp) return res.status(404).json({ ok: false, error: 'Template not found' });
    const { name, description, fieldsConfig, roles } = req.body || {};
    if (fieldsConfig !== undefined) {
      let parsed;
      try {
        parsed = JSON.parse(fieldsConfig);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        if (parsed.length > 500) throw new Error('too many fields');
      } catch {
        return res.status(400).json({ ok: false, error: 'fieldsConfig must be a JSON array (max 500)' });
      }
    }
    sql.run(
      'UPDATE templates SET name = ?, description = ?, fields_config = ?, roles = ? WHERE id = ?',
      name !== undefined ? String(name).trim().slice(0, 120) || temp.name : temp.name,
      description !== undefined ? description : temp.description,
      fieldsConfig !== undefined ? fieldsConfig : temp.fields_config,
      roles !== undefined ? roles : temp.roles,
      temp.id
    );
    audit({ event: 'template.updated', user: req.user || null, ip: req.ip, meta: { id: temp.id } });
    res.json({ ok: true, template: sql.one('SELECT * FROM templates WHERE id = ?', temp.id) });
  });

  // Attach (or replace) the template's source PDF.
  // Accepts multipart (field "file") OR JSON { name, dataUrl } fallback.
  r.post('/:id/source', sessionMiddleware, upload.single('file'), async (req, res) => {
    try {
      const temp = sql.one('SELECT * FROM templates WHERE id = ?', req.params.id);
      if (!temp) return res.status(404).json({ ok: false, error: 'Template not found' });
      let buffer;
      let originalName;
      if (req.file && req.file.buffer) {
        buffer = req.file.buffer;
        originalName = req.file.originalname;
      } else if (req.body && typeof req.body.dataUrl === 'string') {
        const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(req.body.dataUrl);
        if (!m) return res.status(400).json({ ok: false, error: 'Invalid PDF data' });
        buffer = Buffer.from(m[1], 'base64');
        originalName = req.body.name || 'template.pdf';
      } else {
        return res.status(400).json({ ok: false, error: 'A valid PDF file is required' });
      }
      if (buffer.length > config.maxUploadBytes) {
        return res.status(413).json({ ok: false, error: 'PDF exceeds the maximum upload size' });
      }
      if (!isPdf(buffer)) return res.status(400).json({ ok: false, error: 'A valid PDF file is required' });
      let info;
      try {
        info = await getPageSizes(buffer);
      } catch {
        return res.status(400).json({ ok: false, error: 'Could not parse PDF' });
      }
      const storage = getStorage();
      if (temp.original_ref) { try { await storage.remove(temp.original_ref); } catch {} }
      const ref = await storage.save({ cat: 't', name: cleanName(originalName), data: buffer });
      sql.run(
        'UPDATE templates SET original_ref = ?, sha256 = ?, page_sizes = ?, page_count = ? WHERE id = ?',
        ref, sha256(buffer), JSON.stringify(info.pageSizes), info.pageCount, temp.id
      );
      audit({ event: 'template.updated', user: req.user || null, ip: req.ip, meta: { id: temp.id, source: true } });
      res.json({ ok: true, template: sql.one('SELECT * FROM templates WHERE id = ?', temp.id) });
    } catch (e) {
      if (e && e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'PDF exceeds the maximum upload size' });
      res.status(500).json({ ok: false, error: e.message || 'Upload failed' });
    }
  });

  // Serve the template source PDF (for preview in the builder)
  r.get('/:id/file', sessionMiddleware, async (req, res) => {
    const temp = sql.one('SELECT * FROM templates WHERE id = ?', req.params.id);
    if (!temp) return res.status(404).json({ ok: false, error: 'Template not found' });
    if (!temp.original_ref) return res.status(404).json({ ok: false, error: 'Template has no source PDF yet' });
    try {
      const data = await getStorage().read(temp.original_ref);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', data.length);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(data);
    } catch {
      res.status(502).json({ ok: false, error: 'Could not read file from storage' });
    }
  });

  // Instantiate: copy the template source into a real Draft document and
  // return it together with the template's field layout for the Send wizard.
  r.post('/:id/instantiate', sessionMiddleware, async (req, res) => {
    const temp = sql.one('SELECT * FROM templates WHERE id = ?', req.params.id);
    if (!temp) return res.status(404).json({ ok: false, error: 'Template not found' });
    if (!temp.original_ref) return res.status(400).json({ ok: false, error: 'Template has no source PDF — attach one first' });
    try {
      const storage = getStorage();
      const bytes = await storage.read(temp.original_ref);
      const now = nowIso();
      const docId = randomId('doc');
      const name = `${temp.name} — ${new Date().toLocaleDateString()}.pdf`;
      const ref = await storage.save({ cat: 'o', name, data: bytes });
      let fields = [];
      try { fields = JSON.parse(temp.fields_config || '[]'); if (!Array.isArray(fields)) fields = []; }
      catch { fields = []; }
      let roles = [];
      try { roles = JSON.parse(temp.roles || '[]'); if (!Array.isArray(roles)) roles = []; }
      catch { roles = []; }
      sql.run(
        `INSERT INTO documents (id, name, status, original_ref, sha256, page_sizes, page_count, size, archived, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        docId, name, 'Draft', ref, temp.sha256, temp.page_sizes, temp.page_count || 0, bytes.length,
        0, req.user || null, now, now
      );
      audit({ event: 'document.created', docId, user: req.user || null, ip: req.ip, meta: { fromTemplate: temp.id } });
      const doc = sql.one('SELECT * FROM documents WHERE id = ?', docId);
      res.json({ ok: true, document: doc, fields, roles });
    } catch (e) {
      res.status(502).json({ ok: false, error: e.message || 'Could not instantiate template' });
    }
  });

  r.delete('/:id', sessionMiddleware, async (req, res) => {
    const temp = sql.one('SELECT * FROM templates WHERE id = ?', req.params.id);
    if (!temp) return res.status(404).json({ ok: false, error: 'Template not found' });
    if (req.query.confirm !== 'true' && (!req.body || req.body.confirm !== true)) {
      return res.status(400).json({ ok: false, error: 'Deletion requires explicit confirmation' });
    }
    if (temp.original_ref) { try { await getStorage().remove(temp.original_ref); } catch {} }
    sql.run('DELETE FROM templates WHERE id = ?', temp.id);
    audit({ event: 'template.deleted', user: req.user || null, ip: req.ip, meta: { id: temp.id } });
    res.json({ ok: true });
  });

  return r;
}
