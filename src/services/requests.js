import { config } from '../config.js';
import { getStorage } from '../storage/index.js';
import { sql, audit, setting } from '../db.js';
import { randomId, randomUrlToken, sha256, nowIso } from '../crypto.js';
import { stampSignedPdf, isFieldType, clamp } from './pdf.js';
import { buildCertificate } from './cert.js';

export function requestById(id) {
  return sql.one('SELECT * FROM requests WHERE id = ?', id);
}

export function requestByLinkToken(token) {
  return sql.one('SELECT * FROM requests WHERE link_token = ?', token);
}

export function signerByToken(token) {
  return sql.one('SELECT * FROM signers WHERE token = ?', token);
}

export function fieldsForRequest(requestId) {
  return sql.all('SELECT * FROM fields WHERE request_id = ? ORDER BY page, y, x', requestId);
}

export function signersForRequest(requestId) {
  return sql.all('SELECT * FROM signers WHERE request_id = ? ORDER BY order_index', requestId);
}

export function docById(id) {
  return sql.one('SELECT * FROM documents WHERE id = ?', id);
}

function err(message, status) {
  return Object.assign(new Error(message), { status });
}

export function parseFieldOptions(options) {
  if (options == null || options === '') return [];
  const arr = Array.isArray(options) ? options : String(options).split(/\r?\n/);
  return arr.map((o) => String(o).trim()).filter(Boolean);
}

function normalizeOptions(options) {
  const arr = parseFieldOptions(options);
  return arr.length ? arr.join('\n').slice(0, 2000) : null;
}

function sanitizeField(f, i) {
  const page = Number(f.page);
  const x = Number(f.x);
  const y = Number(f.y);
  const width = Number(f.width);
  const height = Number(f.height);
  if (!Number.isInteger(page) || page < 0) throw err(`Field ${i}: invalid page`, 400);
  for (const [k, v] of [['x', x], ['y', y], ['width', width], ['height', height]]) {
    if (!Number.isFinite(v)) throw err(`Field ${i}: invalid ${k}`, 400);
  }
  if (width <= 0 || height <= 0) throw err(`Field ${i}: invalid size`, 400);
  if (!isFieldType(f.type)) throw err(`Field ${i}: unknown type`, 400);
  const signerIndex = f.signer_index === undefined || f.signer_index === null ? 0 : Number(f.signer_index);
  if (!Number.isInteger(signerIndex) || signerIndex < 0) throw err(`Field ${i}: invalid signer_index`, 400);
  return {
    page, x, y, width, height,
    type: f.type,
    signer_index: signerIndex,
    font_size: Math.round(clamp(f.font_size == null ? 12 : Number(f.font_size), 6, 72)),
    label: String(f.label || '').slice(0, 200),
    required: f.required === false || f.required === 0 ? 0 : 1,
    options: normalizeOptions(f.options),
    value: f.value ? String(f.value).slice(0, 4000) : null,
  };
}

export async function createRequest({ docId, signers, fields, mode, message, emailSubject, emailBody, expiresAt, createdBy, ip, userAgent }) {
  const doc = docById(docId);
  if (!doc) throw err('Document not found', 404);
  if (doc.archived) throw err('Document is archived', 400);
  const list = Array.isArray(signers) ? signers : [];
  if (list.length < 1) throw err('At least one signer is required', 400);
  if (list.length > 20) throw err('Too many signers (max 20)', 400);
  for (const [i, s] of list.entries()) {
    if (!s || !String(s.name || '').trim()) throw err(`Signer ${i + 1}: name required`, 400);
    if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || ''))) throw err(`Signer ${i + 1}: valid email required`, 400);
  }
  const cleanMode = mode === 'parallel' ? 'parallel' : 'sequential';
  const cleanFields = (Array.isArray(fields) ? fields : []).slice(0, 500).map(sanitizeField);
  for (const [i, f] of cleanFields.entries()) {
    if (f.signer_index >= list.length) throw err(`Field ${i}: signer_index out of range`, 400);
  }

  const requestId = randomId('req');
  const linkToken = randomUrlToken(40);
  const now = nowIso();
  let finalExpiresAt = expiresAt || null;
  if (!finalExpiresAt && config.signingLinkExpiryHours > 0) {
    finalExpiresAt = new Date(Date.now() + config.signingLinkExpiryHours * 3600 * 1000).toISOString();
  }

  const createdSigners = [];
  sql.tx(() => {
    sql.run(
      'INSERT INTO requests (id, doc_id, message, email_subject, email_body, mode, status, link_token, expires_at, created_by, created_at, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      requestId, docId, message || null, emailSubject || null, emailBody || null,
      cleanMode, 'Sent', linkToken, finalExpiresAt, createdBy || null, now, now
    );
    list.forEach((s, i) => {
      const id = randomId('sgr');
      const token = randomUrlToken(40);
      sql.run(
        'INSERT INTO signers (id, request_id, name, email, order_index, status, token, created_at, sent_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id, requestId, String(s.name).trim(), String(s.email).trim(), i + 1, 'pending', token, now, now
      );
      createdSigners.push({ id, name: String(s.name).trim(), email: String(s.email).trim(), order_index: i + 1, token });
    });
    cleanFields.forEach((f) => {
      const signerRow = createdSigners[f.signer_index];
      sql.run(
        'INSERT INTO fields (id, request_id, page, x, y, width, height, type, signer_id, signer_index, label, required, options, value, filled, font_size) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        randomId('fld'), requestId, f.page, f.x, f.y, f.width, f.height, f.type,
        signerRow ? signerRow.id : null, f.signer_index, f.label, f.required, f.options, f.value, 0, f.font_size
      );
    });
    sql.run('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?', 'Sent', now, docId);
  });

  audit({ event: 'request.created', docId, requestId, user: createdBy || null, ip, userAgent, meta: { mode: cleanMode, signerCount: list.length, fieldCount: cleanFields.length } });
  audit({ event: 'request.sent', docId, requestId, user: createdBy || null, ip, userAgent });
  return { id: requestId, linkToken, signers: createdSigners, mode: cleanMode, expiresAt: finalExpiresAt };
}

export function requestDetail(requestId) {
  const request = requestById(requestId);
  if (!request) throw err('Request not found', 404);
  const doc = docById(request.doc_id);
  return {
    request,
    document: doc,
    signers: signersForRequest(requestId),
    fields: fieldsForRequest(requestId),
  };
}

export function touchSignerViewed(signer, { ip, userAgent }) {
  const now = nowIso();
  if (!signer.viewed_at) {
    sql.run('UPDATE signers SET viewed_at = ? WHERE id = ?', now, signer.id);
  }
  if (signer.status === 'pending') {
    sql.run("UPDATE signers SET status = 'started', started_at = COALESCE(started_at, ?) WHERE id = ?", now, signer.id);
  }
  const request = requestById(signer.request_id);
  if (request && (request.status === 'Sent')) {
    sql.run('UPDATE requests SET status = ? WHERE id = ?', 'In Progress', request.id);
    sql.run('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?', 'In Progress', now, request.doc_id);
  }
  audit({ event: 'document.viewed', docId: request.doc_id, requestId: request.id, signerId: signer.id, ip, userAgent });
  return signerByToken(signer.token);
}

function checkExpiry(request) {
  if (request.expires_at && request.expires_at <= nowIso()) {
    if (request.status !== 'Expired' && request.status !== 'Completed') {
      sql.run('UPDATE requests SET status = ? WHERE id = ?', 'Expired', request.id);
      sql.run('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?', 'Expired', nowIso(), request.doc_id);
      audit({ event: 'request.expired', docId: request.doc_id, requestId: request.id });
    }
    throw err('This signing link has expired', 410);
  }
  if (request.status === 'Completed') throw err('This request is already completed', 409);
  if (request.status === 'Declined') throw err('This request was declined', 409);
  if (request.status === 'Cancelled') throw err('This request was cancelled', 409);
  if (request.status === 'Expired') throw err('This signing link has expired', 410);
}

export async function signRequest({ signerToken, values, ip, userAgent }) {
  const signer = signerByToken(signerToken);
  if (!signer) throw err('Signer link not found', 404);
  if (signer.status === 'signed') throw err('Already signed', 409);
  if (signer.status === 'declined') throw err('You have declined this request', 409);
  const request = requestById(signer.request_id);
  if (!request) throw err('Request not found', 404);
  checkExpiry(request);
  const doc = docById(request.doc_id);
  if (!doc) throw err('Document not found', 404);

  if (request.mode === 'sequential') {
    const blockers = sql.all(
      "SELECT id FROM signers WHERE request_id = ? AND order_index < ? AND status != 'signed'",
      request.id, signer.order_index
    );
    if (blockers.length) throw err('It is not your turn yet — earlier signers must sign first', 403);
  }

  const allFields = fieldsForRequest(request.id);
  const mine = allFields.filter((f) => f.signer_id === signer.id);
  const byId = new Map(mine.map((f) => [f.id, f]));
  const submitted = values && typeof values === 'object' ? values : {};
  const missing = [];
  const now = nowIso();
  let completedCount = 0;

  sql.tx(() => {
    for (const f of mine) {
      const raw = submitted[f.id];
      if (f.type === 'checkbox') {
        const checked = raw === true || raw === 'true' || raw === 1 || raw === '1';
        if (f.required && !checked) { missing.push(f.id); continue; }
        sql.run('UPDATE fields SET value = ?, filled = ? WHERE id = ?', JSON.stringify({ checked }), checked ? 1 : 0, f.id);
        if (checked) completedCount++;
        continue;
      }
      if (f.type === 'signature' || f.type === 'initials') {
        const text = raw === undefined || raw === null ? '' : String(raw);
        if (!text) { if (f.required) missing.push(f.id); continue; }
        if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(text)) throw err('Invalid signature image', 400);
        if (text.length > config.maxSigImageBytes * 4) throw err('Signature image too large', 413);
        sql.run('UPDATE fields SET value = ?, filled = ? WHERE id = ?', JSON.stringify({ imageDataUrl: text }), 1, f.id);
        completedCount++;
        continue;
      }
      const text = raw === undefined || raw === null ? '' : String(raw).trim();
      if (text) {
        if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          throw err('Please enter a valid email address', 400);
        }
        if (f.type === 'date' && Number.isNaN(Date.parse(text))) {
          throw err('Please enter a valid date', 400);
        }
        if ((f.type === 'radio' || f.type === 'choice') && f.options) {
          const opts = parseFieldOptions(f.options);
          if (opts.length && !opts.includes(text)) {
            throw err('Please choose one of the provided options', 400);
          }
        }
      }
      if (f.required && !text) { missing.push(f.id); continue; }
      if (text) {
        const key = f.type === 'radio' || f.type === 'choice' ? 'chosen' : 'text';
        sql.run('UPDATE fields SET value = ?, filled = ? WHERE id = ?', JSON.stringify({ [key]: text.slice(0, 4000) }), 1, f.id);
        completedCount++;
      }
    }
    if (missing.length) throw err(`Please complete all required fields (${missing.length} remaining)`, 400);
    sql.run("UPDATE signers SET status = 'signed', signed_at = ? WHERE id = ?", now, signer.id);
  });

  audit({ event: 'signer.started', docId: doc.id, requestId: request.id, signerId: signer.id, ip, userAgent });
  audit({ event: 'field.completed', docId: doc.id, requestId: request.id, signerId: signer.id, ip, userAgent, meta: { count: completedCount } });
  audit({ event: 'signature.applied', docId: doc.id, requestId: request.id, signerId: signer.id, ip, userAgent });
  audit({ event: 'document.signed', docId: doc.id, requestId: request.id, signerId: signer.id, ip, userAgent });

  const remaining = sql.all(
    "SELECT id FROM signers WHERE request_id = ? AND status != 'signed' AND status != 'declined'",
    request.id
  );

  const storage = getStorage();
  const original = await storage.read(doc.original_ref);
  const groups = signersForRequest(request.id)
    .filter((s) => s.status === 'signed')
    .map((s) => ({
      signer: { name: s.name, email: s.email },
      fields: fieldsForRequest(request.id)
        .filter((f) => f.signer_id === s.id && f.filled)
        .map((f) => ({ ...f, page: Number(f.page) || 0, value: f.value ? JSON.parse(f.value) : {} })),
    }));
  const signedPdf = await stampSignedPdf(original, groups);
  const signedHash = sha256(signedPdf);
  const signedRef = await storage.save({ cat: 's', name: `${doc.name.replace(/\.pdf$/i, '')}_signed.pdf`, data: signedPdf });

  if (!remaining.length) {
    const certPdf = await buildCertificate({
      title: doc.name,
      docName: doc.name,
      docRef: doc.original_ref,
      requestId: request.id,
      signers: signersForRequest(request.id),
      auditEvents: sql.all('SELECT event, user, signer_id, ip, created_at FROM audit_events WHERE request_id = ? ORDER BY id', request.id),
      hashes: { original: doc.sha256 || null, signed: signedHash },
      created: now,
      host: setting('app_url') || config.appUrl,
    });
    const certRef = await storage.save({ cat: 'c', name: `${doc.name.replace(/\.pdf$/i, '')}.certificate.pdf`, data: certPdf });
    sql.run('UPDATE requests SET status = ?, completed_at = ? WHERE id = ?', 'Completed', now, request.id);
    sql.run('UPDATE documents SET status = ?, signed_ref = ?, certificate_ref = ?, updated_at = ? WHERE id = ?', 'Completed', signedRef, certRef, now, doc.id);
    audit({ event: 'signing.completed', docId: doc.id, requestId: request.id, ip, userAgent });
    audit({ event: 'final.generated', docId: doc.id, requestId: request.id, ip, userAgent, meta: { signedRef, certRef, signedHash } });
    return { signedRef, certRef, requestStatus: 'Completed', docStatus: 'Completed', completed: true };
  }

  sql.run('UPDATE requests SET status = ? WHERE id = ?', 'In Progress', request.id);
  sql.run('UPDATE documents SET status = ?, signed_ref = ?, updated_at = ? WHERE id = ?', 'In Progress', signedRef, now, doc.id);
  return { signedRef, certRef: null, requestStatus: 'In Progress', docStatus: 'In Progress', completed: false };
}

export function declineSigner({ signerToken, reason, ip, userAgent }) {
  const signer = signerByToken(signerToken);
  if (!signer) throw err('Signer link not found', 404);
  if (signer.status === 'signed') throw err('Already signed', 409);
  const request = requestById(signer.request_id);
  if (!request) throw err('Request not found', 404);
  checkExpiry(request);
  const now = nowIso();
  sql.run("UPDATE signers SET status = 'declined', declined_at = ? WHERE id = ?", now, signer.id);
  sql.run('UPDATE requests SET status = ? WHERE id = ?', 'Declined', request.id);
  sql.run('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?', 'Declined', now, request.doc_id);
  audit({ event: 'signer.declined', docId: request.doc_id, requestId: request.id, signerId: signer.id, ip, userAgent, meta: { reason: String(reason || '').slice(0, 500) } });
  return { requestStatus: 'Declined' };
}

export function cancelRequest({ requestId, user, ip }) {
  const request = requestById(requestId);
  if (!request) throw err('Request not found', 404);
  if (request.status === 'Completed') throw err('Cannot cancel a completed request', 400);
  const now = nowIso();
  sql.run('UPDATE requests SET status = ? WHERE id = ?', 'Cancelled', requestId);
  sql.run('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?', 'Cancelled', now, request.doc_id);
  audit({ event: 'request.cancelled', docId: request.doc_id, requestId, user: user || null, ip });
  return { ok: true };
}
