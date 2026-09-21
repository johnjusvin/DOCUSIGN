import { getStorage } from '../storage/index.js';
import { sql, audit } from '../db.js';
import { sha256, nowIso, secureCompare } from '../crypto.js';
import { getPageSizes, stampSignedPdf } from '../services/pdf.js';
import { buildCertificate } from '../services/cert.js';

export function hashPdfBuffer(buf) {
  return sha256(buf);
}

export function hashRefData(signedRef, originalHash, requestMeta) {
  return sha256(JSON.stringify({ signedRef, originalHash, requestMeta }));
}
