import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { randomToken } from '../crypto.js';
import { splitRef, catFolder, CATS } from './cats.js';

const LOCAL_DIR = { o: 'originals', s: 'signed', c: 'certificates', t: 'templates' };

function sanitize(name, max = 200) {
  return (
    String(name || 'file')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^\.+/, '') || 'file'
  ).slice(0, max);
}

export class LocalStorage {
  constructor() {
    this.name = 'local';
    this.root = path.join(config.dataDir, 'store');
    for (const cat of CATS) {
      fs.mkdirSync(path.join(this.root, LOCAL_DIR[cat]), { recursive: true });
    }
  }

  async isReady() {
    return true;
  }

  filePath(ref) {
    const { cat, key } = splitRef(ref);
    return path.join(this.root, LOCAL_DIR[cat], sanitize(key));
  }

  async save({ cat, name, data }) {
    const key = `${Date.now().toString(36)}-${randomToken(6)}-${sanitize(name, 90)}`;
    const ref = `${cat}/${key}`;
    fs.writeFileSync(this.filePath(ref), data);
    return ref;
  }

  async read(ref) {
    return fs.readFileSync(this.filePath(ref));
  }

  async stat(ref) {
    const st = fs.statSync(this.filePath(ref));
    return { size: st.size, name: path.basename(this.filePath(ref)) };
  }

  async remove(ref) {
    try {
      fs.unlinkSync(this.filePath(ref));
    } catch {
      /* already gone */
    }
  }

  async describe() {
    return { type: 'local', label: 'Local disk (development fallback)', root: this.root };
  }
}