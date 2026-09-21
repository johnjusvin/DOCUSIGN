// Storage reference grammar:
//   ref = "<cat>/<key>"
//     cat: o=Originals  s=Signed  c=Certificates  t=Templates
//     key: LocalStorage -> sanitized file name
//          DriveStorage -> Google Drive file id
//   Full refs are stored in DB columns (original_ref, signed_ref, ...).

export const CATS = ['o', 's', 'c', 't'];

export const CAT_FOLDER = { o: 'Originals', s: 'Signed', c: 'Certificates', t: 'Templates' };

export function splitRef(ref) {
  const m = /^([osct])\/(.+)$/.exec(String(ref || ''));
  if (!m) throw new Error('Invalid storage reference');
  return { cat: m[1], key: m[2] };
}

export function catFolder(cat) {
  if (!CAT_FOLDER[cat]) throw new Error('Invalid storage category');
  return CAT_FOLDER[cat];
}