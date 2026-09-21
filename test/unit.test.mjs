// Offline unit tests. Run: npm test  (no server required)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomToken, randomId, randomUrlToken, sha256, secureCompare, nowIso } from '../src/crypto.js';
import { splitRef, catFolder, CATS } from '../src/storage/cats.js';
import { isFieldType, clamp, wrap } from '../src/services/pdf.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getPageSizes } from '../src/services/pdf.js';

describe('crypto', () => {
  it('randomToken has 32-byte hex entropy by default', () => {
    const t = randomToken();
    assert.match(t, /^[a-f0-9]{64}$/);
    assert.notEqual(randomToken(), randomToken());
  });
  it('signer tokens are unguessable urls', () => {
    const t = randomUrlToken(40);
    assert.equal(t.length, 54); // 40 bytes base64url ~54 chars
    assert.match(t, /^[A-Za-z0-9_-]+$/);
  });
  it('randomId carries prefix', () => {
    assert.match(randomId('req'), /^req_/);
  });
  it('sha256 known vector', () => {
    assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('secureCompare is constant-time-ish and correct', () => {
    assert.equal(secureCompare('admin', 'admin'), true);
    assert.equal(secureCompare('admin', 'Admin'), false);
    assert.equal(secureCompare('a', 'ab'), false);
  });
  it('nowIso parses as date', () => {
    assert.ok(!Number.isNaN(Date.parse(nowIso())));
  });
});

describe('storage refs', () => {
  it('CATS covers all four categories', () => {
    assert.deepEqual([...CATS].sort(), ['c', 'o', 's', 't']);
  });
  it('splitRef parses cat/key', () => {
    assert.deepEqual(splitRef('o/abc123'), { cat: 'o', key: 'abc123' });
    assert.deepEqual(splitRef('s/drive-file-id_xyz'), { cat: 's', key: 'drive-file-id_xyz' });
  });
  it('splitRef rejects garbage (no path traversal)', () => {
    assert.throws(() => splitRef('../etc/passwd'), /Invalid storage reference/);
    assert.throws(() => splitRef('x/abc'), /Invalid storage reference/);
    assert.throws(() => splitRef(''), /Invalid storage reference/);
  });
  it('catFolder maps to Drive folder names', () => {
    assert.equal(catFolder('o'), 'Originals');
    assert.equal(catFolder('s'), 'Signed');
    assert.equal(catFolder('c'), 'Certificates');
    assert.equal(catFolder('t'), 'Templates');
    assert.throws(() => catFolder('z'), /Invalid storage category/);
  });
});

describe('pdf helpers', () => {
  it('accepts the 9 known field types only', () => {
    for (const t of ['signature', 'initials', 'name', 'email', 'date', 'text', 'checkbox', 'radio', 'choice']) {
      assert.equal(isFieldType(t), true);
    }
    assert.equal(isFieldType('ssn'), false);
    assert.equal(isFieldType(''), false);
  });
  it('clamp guards non-numbers', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(99, 0, 10), 10);
    assert.equal(clamp('nan', 2, 10), 2);
  });
  it('wrap never exceeds max width', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrap(font, 'the quick brown fox jumps over the lazy dog', 12, 100);
    assert.ok(lines.length > 1);
    for (const ln of lines) assert.ok(font.widthOfTextAtSize(ln, 12) <= 100.01);
  });
  it('getPageSizes reads real geometry', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([595, 842]);
    const buf = Buffer.from(await doc.save());
    const { pageCount, pageSizes } = await getPageSizes(buf);
    assert.equal(pageCount, 2);
    assert.equal(pageSizes[0].width, 612);
    assert.equal(pageSizes[1].height, 842);
  });
});
