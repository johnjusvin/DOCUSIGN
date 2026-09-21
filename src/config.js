import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  const p = path.join(rootDir, '.env');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

function num(v, d) {
  if (v === undefined || v === '' || Number.isNaN(Number(v))) return d;
  return Number(v);
}

const port = num(process.env.PORT, 4000);
const appUrl = (process.env.REDITUS_APP_URL || `http://localhost:${port}`).replace(/\/+$/, '');

const dataDirBase = path.resolve(process.env.REDITUS_DATA_DIR || path.join(rootDir, 'data'));
const dataDir = path.join(dataDirBase, 'reditus-local');
for (const d of [
  'store/originals',
  'store/signed',
  'store/certificates',
  'store/templates',
  'uploads',
]) {
  fs.mkdirSync(path.join(dataDir, d), { recursive: true });
}

const secretFile = path.join(dataDir, 'session-secret');
let sessionSecret = process.env.SESSION_SECRET || '';
if (!sessionSecret && fs.existsSync(secretFile)) {
  sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
}
if (!sessionSecret) {
  sessionSecret = nodeCrypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, sessionSecret, { mode: 0o600 });
}

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
);

export const config = {
  rootDir,
  dataDir,
  port,
  host: process.env.HOST || '127.0.0.1',
  appUrl,
  sessionSecret,
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  defaultAdminWarning: !process.env.ADMIN_PASSWORD,
  maxUploadBytes: num(process.env.MAX_UPLOAD_BYTES, 30 * 1024 * 1024),
  maxSigImageBytes: num(process.env.MAX_SIGIMAGE_BYTES, 5 * 1024 * 1024),
  signingLinkExpiryHours: num(process.env.SIGNING_LINK_EXPIRY_HOURS, 0),
  storage: (process.env.STORAGE || '').toLowerCase(),
  drive: {
    configured: googleConfigured,
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '',
    offlineMode: process.env.GOOGLE_DRIVE_OFFLINE_MODE === 'true' || !googleConfigured,
  },
};