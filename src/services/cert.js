import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function safe(value, max = 90) {
  return String(value == null ? '' : value).slice(0, max);
}

export async function buildCertificate({ title, docName, docRef, requestId, signers, auditEvents, hashes, created, host }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const W = page.getWidth();
  const H = page.getHeight();

  page.drawRectangle({ x: 0, y: H - 130, width: W, height: 130, color: rgb(0.04, 0.09, 0.16) });
  page.drawText('REDITUS SIGN', { x: 40, y: H - 62, size: 13, font: bold, color: rgb(0, 0.83, 0.67) });
  page.drawText('COMPLETION CERTIFICATE', { x: 40, y: H - 92, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(title || docName || 'Document', 60), { x: 40, y: H - 114, size: 11, font, color: rgb(0.88, 0.93, 1) });

  let y = H - 168;
  const row = (label, value) => {
    if (y < 60) return;
    page.drawText(safe(label, 24), { x: 45, y, size: 9, font: bold, color: rgb(0.3, 0.33, 0.4) });
    for (const line of wrapText(safe(value, 220), 52)) {
      if (y < 60) return;
      page.drawText(line, { x: 175, y, size: 9, font });
      y -= 13;
    }
    y -= 5;
    page.drawRectangle({ x: 45, y: y + 2, width: W - 90, height: 0.6, color: rgb(0.82, 0.86, 0.9) });
    y -= 8;
  };

  row('Document name', docName || '');
  row('Document ref', docRef || '');
  row('Request ID', requestId || '');
  row('Completed at', created || '');
  row('Host', host || '');

  y -= 4;
  if (y > 80) {
    page.drawText('SIGNERS', { x: 45, y, size: 11, font: bold });
    y -= 18;
  }
  for (const s of signers || []) {
    const when = s.signed_at || s.signedAt || s.declined_at || s.status || '';
    row(`${s.name || 'Signer'}${s.email ? ` <${s.email}>` : ''}`, when);
  }

  if (y > 110) {
    y -= 4;
    page.drawText('AUDIT TRAIL', { x: 45, y, size: 11, font: bold });
    y -= 18;
  }
  for (const e of auditEvents || []) {
    if (y < 60) break;
    const line = `${(e.created_at || '').slice(0, 19).replace('T', ' ')}  ${e.event || ''}${e.signer_id ? '  signer:' + String(e.signer_id).slice(0, 12) : ''}${e.ip ? '  ' + e.ip : ''}`;
    page.drawText(safe(line, 95), { x: 45, y, size: 7.5, font });
    y -= 11;
  }

  if (hashes && hashes.original) page.drawText(`SHA-256 (original): ${hashes.original}`, { x: 45, y: 44, size: 7, font });
  if (hashes && hashes.signed) page.drawText(`SHA-256 (signed):  ${hashes.signed}`, { x: 45, y: 32, size: 7, font });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function wrapText(text, per) {
  if (!text) return [''];
  const out = [];
  for (let i = 0; i < text.length; i += per) out.push(text.slice(i, i + per));
  return out;
}
