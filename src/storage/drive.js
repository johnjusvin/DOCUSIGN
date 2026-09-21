import { google } from 'googleapis';
import { config } from '../config.js';
import { setting } from '../db.js';
import { randomToken } from '../crypto.js';
import { splitRef, catFolder, CATS } from './cats.js';

const TOKEN_KEY = 'drive_tokens';
const FOLDER_KEY = 'drive_folders';
const ROOT_KEY = 'drive_root_id';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class GoogleDriveStorage {
  constructor() {
    this.name = 'drive';
  }

  oauthClient(verifier) {
    const redirectUri =
      config.drive.redirectUri || `${config.appUrl}/api/drive/oauth/callback`;
    const oauth = new google.auth.OAuth2(
      config.drive.clientId,
      config.drive.clientSecret,
      redirectUri
    );
    if (verifier) oauth.codeVerifier = verifier;
    return oauth;
  }

  isConfigured() {
    return config.drive.configured;
  }

  isAuthorized() {
    return this.isConfigured() && Boolean(setting(TOKEN_KEY));
  }

  async isReady() {
    return this.isAuthorized();
  }

  async authUrl() {
    if (!this.isConfigured()) {
      throw new Error('Google Drive is not configured (set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).');
    }
    const { verifier, challenge } = await this.oauthClient().generateCodeVerifierAsync();
    const oauth = this.oauthClient(verifier);
    const url = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE],
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: randomToken(8),
    });
    return { url, verifier };
  }

  async handleCallback(code, verifier) {
    if (!code || !verifier) throw new Error('Missing OAuth code or verifier');
    const oauth = this.oauthClient(verifier);
    const { tokens } = await oauth.getToken({ code, code_verifier: verifier });
    oauth.setCredentials(tokens);
    setting(TOKEN_KEY, JSON.stringify(tokens));
    await this.ensureTree();
    return tokens;
  }

  isTokenExpired() {
    const raw = setting(TOKEN_KEY);
    if (!raw) return true;
    try {
      const t = JSON.parse(raw);
      const expiry = Number(t.expiry_date || 0);
      return expiry ? Date.now() >= expiry - 30_000 : true;
    } catch {
      return true;
    }
  }

  async refresh() {
    const raw = setting(TOKEN_KEY);
    if (!raw) throw new Error('Google Drive not authorized');
    const tokens = JSON.parse(raw);
    const oauth = this.oauthClient();
    oauth.setCredentials(tokens);
    if (oauth.isTokenExpiring()) {
      try {
        const { credentials } = await oauth.refreshAccessToken();
        oauth.setCredentials(credentials);
        setting(TOKEN_KEY, JSON.stringify(credentials));
        return JSON.stringify(credentials);
      } catch (err) {
        console.error('[drive] token refresh failed', err.message);
        throw new Error('Google Drive authorization expired; re-authenticate in Settings.');
      }
    }
    return raw;
  }

  async drive() {
    const raw = await this.refresh();
    const oauth = this.oauthClient();
    oauth.setCredentials(JSON.parse(raw));
    return google.drive({ version: 'v3', auth: oauth });
  }
  async ensureTree() {
    const drive = await this.drive();
    let stored = setting(FOLDER_KEY);
    let folders = stored ? JSON.parse(stored) : {};
    let rootId = setting(ROOT_KEY) || config.drive.rootFolderId;
    if (!rootId || rootId === 'root') {
      rootId = await this.findOrCreateFolder(drive, 'root', 'REDITUS SIGN');
      setting(ROOT_KEY, rootId);
    } else {
      await drive.files.get({ fileId: rootId, fields: 'id' }).catch(() => {
        throw new Error(`Configured Drive root folder not found: ${rootId}`);
      });
    }
    const want = {};
    for (const cat of CATS) want[cat] = await this.findOrCreateFolder(drive, rootId, catFolder(cat));
    const merged = { ...folders, ...want };
    setting(FOLDER_KEY, JSON.stringify(merged));
    return { rootId, folders: merged };
  }

  async findOrCreateFolder(drive, parentId, name) {
    const list = await drive.files.list({
      q: `'${parentId}' in parents and name = '${String(name).replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });
    if (list.data.files.length) return list.data.files[0].id;
    const res = await drive.files.create({
      requestBody: { name: String(name), mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    return res.data.id;
  }

  async folderId(cat) {
    const stored = setting(FOLDER_KEY);
    const folders = stored ? JSON.parse(stored) : {};
    let id = folders[cat];
    if (!id) {
      const t = await this.ensureTree();
      id = t.folders[cat];
    }
    return id;
  }

  async save({ cat, name, data }) {
    const drive = await this.drive();
    const folderId = await this.folderId(cat);
    const res = await drive.files.create({
      requestBody: {
        name: String(name).replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'document.pdf',
        parents: [folderId],
      },
      media: { mimeType: 'application/pdf', body: data },
      fields: 'id, name',
    });
    return `${cat}/${res.data.id}`;
  }

  async read(ref) {
    const drive = await this.drive();
    const { key } = splitRef(ref);
    const res = await drive.files.get({ fileId: key, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
  }

  async stat(ref) {
    const drive = await this.drive();
    const { key } = splitRef(ref);
    const res = await drive.files.get({ fileId: key, fields: 'id, size, name' });
    return { size: Number(res.data.size) || 0, name: res.data.name || '' };
  }

  async remove(ref) {
    const drive = await this.drive();
    const { key } = splitRef(ref);
    await drive.files.delete({ fileId: key }).catch(() => {});
  }

  async describe() {
    const t = await this.ensureTree();
    return {
      type: 'drive',
      label: 'Google Drive',
      rootId: t.rootId,
      folders: t.folders,
      scope: DRIVE_SCOPE.replace('https://www.googleapis.com/auth/', 'auth/'),
    };
  }
}
