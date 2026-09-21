import nodeCrypto from 'node:crypto';

export function randomToken(bytes = 32) {
  return nodeCrypto.randomBytes(bytes).toString('hex');
}

export function randomId(prefix = 'id') {
  return `${prefix}_${nodeCrypto.randomBytes(12).toString('base64url')}`;
}

export function sha256(data) {
  return nodeCrypto.createHash('sha256').update(data).digest('hex');
}

export function hashString(value, secret) {
  return nodeCrypto.createHmac('sha256', String(secret)).update(String(value)).digest('hex');
}

export function secureCompare(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return nodeCrypto.timingSafeEqual(ba, bb);
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomUrlToken(bytes = 40) {
  return nodeCrypto.randomBytes(bytes).toString('base64url');
}export const sha256Hex = sha256;
