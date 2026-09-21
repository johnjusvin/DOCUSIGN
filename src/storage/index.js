import { config } from '../config.js';
import { LocalStorage } from './local.js';
import { GoogleDriveStorage } from './drive.js';

const local = new LocalStorage();
let drive = null;

function driveInstance() {
  if (!drive) drive = new GoogleDriveStorage();
  return drive;
}

function choose() {
  const s = config.storage;
  const hasDrive = driveInstance().isConfigured();
  if (s === 'local') return local;
  if (s === 'drive') return hasDrive ? driveInstance() : local;
  return hasDrive ? driveInstance() : local;
}

export function getStorage() {
  return choose();
}

export function currentStorageKind() {
  return choose().name;
}
