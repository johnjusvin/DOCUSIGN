// End-to-end test for REDITUS SIGN. Requires the server running on http://127.0.0.1:4000.
// Run:  node test/e2e.mjs
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BASE = process.env.REDITUS_TEST_URL || 'http://127.0.0.1:4000';
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let passed = 0;
function ok(name, cond, extra = '') {
  if (!cond) {
    console.error(`FAIL: ${name} ${extra}`);
    process.exitCode = 1;
    throw new Error(`E2E failed at: ${name}`);
  }
  passed++;
  console.log(`PASS: ${name}`);
}

let cookie = '';
async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (body !== undefined) {
    if (body instanceof FormData) payload = body;
    else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const m = /reditus_session=([^;]+)/.exec(setCookie);
    if (m) cookie = `reditus_session=${m[1]}`;
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data };
}

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`REDITUS E2E test document — page ${p + 1}`, { x: 50, y: 700, size: 18, font });
    page.drawText('Signer 1 signs page 1. Signer 2 fills text on page 2.', { x: 50, y: 670, size: 12, font });
    page.drawRectangle({ x: 50, y: 100, width: 512, height: 60, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1 });
  }
  return Buffer.from(await doc.save());
}

// 1. anonymous dashboard access blocked
{
  const r = await api('/api/docs');
  ok('anonymous /api/docs -> 401', r.status === 401, JSON.stringify(r.data));
}

// 2. login
{
  const r = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: '' } });
  ok('login ok', r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
  const s = await api('/api/auth/session');
  ok('session ok', s.data.ok === true && s.data.user === 'admin');
}

// 3. upload PDF
const pdfBytes = await makePdf();
let docId;
{
  const fd = new FormData();
  fd.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'e2e-agreement.pdf');
  const r = await api('/api/docs/upload', { method: 'POST', body: fd });
  ok('upload ok', r.status === 200 && r.data.ok, JSON.stringify(r.data).slice(0, 300));
  ok('upload parsed 2 pages', r.data.document.page_count === 2, `pages=${r.data.document.page_count}`);
  ok('upload sha256 recorded', /^[a-f0-9]{64}$/.test(r.data.document.sha256 || ''));
  ok('upload status Draft', r.data.document.status === 'Draft');
  docId = r.data.document.id;
}

// 4. sequential request: signer1 sig(p0) + checkbox(p0); signer2 text(p1)
let s1, s2, reqId;
{
  const r = await api('/api/requests', {
    method: 'POST',
    body: {
      docId,
      mode: 'sequential',
      message: 'E2E sequential test',
      emailSubject: 'Please sign (E2E)',
      signers: [
        { name: 'Alice First', email: 'alice@example.com' },
        { name: 'Bob Second', email: 'bob@example.com' },
      ],
      fields: [
        { page: 0, x: 80, y: 120, width: 150, height: 50, type: 'signature', signer_index: 0, required: true, label: 'Alice signature' },
        { page: 0, x: 300, y: 120, width: 24, height: 24, type: 'checkbox', signer_index: 0, required: true, label: 'Agree' },
        { page: 1, x: 80, y: 200, width: 220, height: 36, type: 'text', signer_index: 1, required: true, label: 'Company' },
      ],
    },
  });
  ok('create sequential request', r.status === 200 && r.data.ok, JSON.stringify(r.data).slice(0, 300));
  reqId = r.data.request.id;
  [s1, s2] = r.data.request.signers;
  ok('two distinct signer links', s1.link !== s2.link && /\/sign\//.test(s1.link));
}

// 5. sequential order enforced: signer 2 first -> 403
{
  const t2 = s2.token;
  const r = await api(`/api/sign/${t2}/sign`, { method: 'POST', body: { values: {} } });
  ok('signer2 blocked before turn (403)', r.status === 403, `status=${r.status} ${JSON.stringify(r.data)}`);
}

// 6. signer 1 snapshot + document bytes
{
  const t1 = s1.token;
  const snap = await api(`/api/sign/${t1}`);
  ok('signer1 snapshot', snap.status === 200 && snap.data.ok && snap.data.fields.length === 3, `status=${snap.status}`);
  ok('snapshot hides other tokens', !JSON.stringify(snap.data).includes(s2.token));
  const mine = snap.data.fields.filter((f) => f.mine);
  ok('signer1 sees 2 own fields', mine.length === 2, JSON.stringify(mine.length));
  const pdf = await api(`/api/sign/${t1}/document`);
  const magic = Buffer.from(pdf.data).slice(0, 4).toString();
  ok('signer document serves PDF', pdf.status === 200 && magic === '%PDF', `magic=${magic}`);
}

// 7. signer 1 signs (missing checkbox -> 400 first)
{
  const t1 = s1.token;
  const sigField = (await api(`/api/sign/${t1}`)).data.fields.find((f) => f.mine && f.type === 'signature');
  const bad = await api(`/api/sign/${t1}/sign`, { method: 'POST', body: { values: { [sigField.id]: SIG } } });
  ok('required checkbox enforced (400)', bad.status === 400, `status=${bad.status}`);
  const boxField = (await api(`/api/sign/${t1}`)).data.fields.find((f) => f.mine && f.type === 'checkbox');
  const good = await api(`/api/sign/${t1}/sign`, {
    method: 'POST', body: { values: { [sigField.id]: SIG, [boxField.id]: true } },
  });
  ok('signer1 signs', good.status === 200 && good.data.ok && good.data.completed === false, JSON.stringify(good.data));
  ok('partial signed pdf ref', typeof good.data.signedRef === 'string' && good.data.signedRef.startsWith('s/'));
  const dup = await api(`/api/sign/${t1}/sign`, { method: 'POST', body: { values: {} } });
  ok('double-sign blocked (409)', dup.status === 409, `status=${dup.status}`);
}

// 8. signer 2 signs -> completes, certificate generated
{
  const t2 = s2.token;
  const snap = await api(`/api/sign/${t2}`);
  const textField = snap.data.fields.find((f) => f.mine && f.type === 'text');
  const r = await api(`/api/sign/${t2}/sign`, { method: 'POST', body: { values: { [textField.id]: 'Acme Corp' } } });
  ok('signer2 completes request', r.status === 200 && r.data.completed === true && r.data.requestStatus === 'Completed', JSON.stringify(r.data));
  ok('certificate ref', typeof r.data.certRef === 'string' && r.data.certRef.startsWith('c/'));
}

// 9. download signed PDF + certificate, verify %PDF
{
  const s = await api(`/api/docs/${docId}/signed`);
  ok('signed PDF downloads', s.status === 200 && Buffer.from(s.data).slice(0, 4).toString() === '%PDF');
  ok('signed bigger than original', s.data.byteLength > pdfBytes.length, `${s.data.byteLength} vs ${pdfBytes.length}`);
  const c = await api(`/api/docs/${docId}/certificate`);
  ok('certificate downloads', c.status === 200 && Buffer.from(c.data).slice(0, 4).toString() === '%PDF');
}

// 10. audit trail contains the key events
{
  const r = await api(`/api/audit?requestId=${reqId}&limit=100`);
  const events = (r.data.events || []).map((e) => e.event);
  for (const want of ['request.created', 'request.sent', 'document.viewed', 'document.signed', 'signing.completed', 'final.generated']) {
    ok(`audit has ${want}`, events.includes(want), events.join(','));
  }
}

// 11. parallel: reverse order works
{
  const fd = new FormData();
  fd.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'e2e-parallel.pdf');
  const up = await api('/api/docs/upload', { method: 'POST', body: fd });
  const pid = up.data.document.id;
  const cr = await api('/api/requests', {
    method: 'POST',
    body: {
      docId: pid, mode: 'parallel',
      signers: [{ name: 'Pam', email: 'pam@example.com' }, { name: 'Quinn', email: 'quinn@example.com' }],
      fields: [
        { page: 0, x: 80, y: 120, width: 150, height: 50, type: 'signature', signer_index: 0, required: true },
        { page: 0, x: 300, y: 120, width: 150, height: 50, type: 'signature', signer_index: 1, required: true },
      ],
    },
  });
  const [p1, p2] = cr.data.request.signers;
  const f2 = (await api(`/api/sign/${p2.token}`)).data.fields.find((f) => f.mine);
  const r2 = await api(`/api/sign/${p2.token}/sign`, { method: 'POST', body: { values: { [f2.id]: SIG } } });
  ok('parallel reverse order ok', r2.status === 200 && r2.data.completed === false, JSON.stringify(r2.data));
  const f1 = (await api(`/api/sign/${p1.token}`)).data.fields.find((f) => f.mine);
  const r1 = await api(`/api/sign/${p1.token}/sign`, { method: 'POST', body: { values: { [f1.id]: SIG } } });
  ok('parallel completes', r1.status === 200 && r1.data.completed === true && !!r1.data.certRef);
}

// 12. decline flow
{
  const fd = new FormData();
  fd.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'e2e-decline.pdf');
  const up = await api('/api/docs/upload', { method: 'POST', body: fd });
  const did = up.data.document.id;
  const cr = await api('/api/requests', {
    method: 'POST',
    body: {
      docId: did, mode: 'sequential',
      signers: [{ name: 'Nina', email: 'nina@example.com' }],
      fields: [{ page: 0, x: 80, y: 120, width: 150, height: 50, type: 'signature', signer_index: 0, required: true }],
    },
  });
  const n = cr.data.request.signers[0];
  const d = await api(`/api/sign/${n.token}/decline`, { method: 'POST', body: { reason: 'E2E decline test' } });
  ok('decline ok', d.status === 200 && d.data.requestStatus === 'Declined', JSON.stringify(d.data));
  const after = await api(`/api/sign/${n.token}/sign`, { method: 'POST', body: { values: {} } });
  ok('sign after decline blocked', after.status === 409, `status=${after.status}`);
}

// 13. delete requires confirmation, then works
{
  const noConfirm = await api(`/api/docs/${docId}`, { method: 'DELETE' });
  ok('delete without confirm rejected', noConfirm.status === 400, `status=${noConfirm.status}`);
  const yes = await api(`/api/docs/${docId}?confirm=true`, { method: 'DELETE' });
  ok('delete with confirm ok', yes.status === 200 && yes.data.ok);
  const gone = await api(`/api/docs/${docId}`);
  ok('deleted doc gone', gone.status === 404, `status=${gone.status}`);
}

// 14. invalid token -> 404
{
  const r = await api('/api/sign/this-token-does-not-exist-xyz');
  ok('bad token 404', r.status === 404, `status=${r.status}`);
}

console.log(`\nE2E DONE: ${passed} checks passed`);
