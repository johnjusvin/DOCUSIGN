import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const FIELD_TYPES = [
  'signature', 'initials', 'name', 'email', 'date',
  'text', 'checkbox', 'radio', 'choice',
];

export function isFieldType(t) {
  return FIELD_TYPES.includes(t);
}

export function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function wrap(font, text, size, maxWidth) {
  const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cur && font.widthOfTextAtSize(cand, size) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function parseImageDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('Invalid signature image data');
  return { mime: m[1], base64: m[2] };
}

export async function getPageSizes(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const pageSizes = doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return {
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    };
  });
  return { pageCount, pageSizes };
}
async function embedSigImage(doc, dataUrl) {
  const { mime, base64 } = parseImageDataUrl(dataUrl);
  const buf = Buffer.from(base64, 'base64');
  const img = mime === 'image/png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
  return { img, w: img.width, h: img.height };
}

function toPdfY(page, field) {
  return page.getHeight() - field.y - field.height;
}

export async function stampField(doc, page, field, font) {
  const { x, y, width, height } = field;
  const value = field.value || {};
  const rect = { x, y, width, height };
  try {
    if (field.type === 'signature' || field.type === 'initials') {
      if (value.imageDataUrl) {
        const { img, w, h } = await embedSigImage(doc, value.imageDataUrl);
        const scale = Math.min(width / w, height / h, 1);
        const dw = w * scale;
        const dh = h * scale;
        const dx = x + (width - dw) / 2;
        const dyTop = y + (height - dh) / 2;
        page.drawImage(img, { x: dx, y: toPdfY(page, { y: dyTop, height: dh }), width: dw, height: dh });
      }
      return;
    }
    if (field.type === 'checkbox') {
      if (value.checked) {
        const size = Math.min(width, height);
        const cx = x + size / 2;
        const cyTop = y + size / 2;
        const cy = toPdfY(page, { y: cyTop, height: 0 });
        page.drawLine({ start: { x: x, y: cy }, end: { x: x + size, y: cy }, thickness: 1.4 });
        page.drawLine({ start: { x: x, y: cy }, end: { x: x + size, y: cy }, thickness: 1.4 });
      }
      return;
    }
    if (field.type === 'radio') {
      if (value.selected) {
        const size = Math.min(width, height);
        const cx = x + width / 2;
        const cy = toPdfY(page, { y: y + height / 2, height: 0 });
        page.drawCircle({ x: cx, y: cy, size: size * 0.3 });
      }
      return;
    }
    const text =
      value.text != null ? String(value.text)
      : value.chosen != null ? String(value.chosen)
      : '';
    const size = clamp(field.font_size == null ? null : Number(field.font_size), 6, 48) || Math.min(height * 0.55, 14);
    const maxWidth = width - 4;
    const lines = wrap(font, text, size, maxWidth).slice(0, Math.max(1, Math.floor(height / (size * 1.35))));
    const lineH = size * 1.35;
    const blockH = lines.length * lineH;
    const topY = y + (height - blockH) / 2;
    lines.forEach((ln, i) => {
      page.drawText(ln, { x: x + 2, y: toPdfY(page, { y: topY + i * lineH, height: size * 0.3 }), size, font });
    });
  } catch (e) {
    console.warn('[pdf] stamp field', field.type, e.message);
  }
}

export async function stampSignedPdf(buffer, groups) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  await doc.embedFont(StandardFonts.HelveticaBold);
  for (const group of groups || []) {
    if (!group || !Array.isArray(group.fields)) continue;
    for (const field of group.fields) {
      const page = doc.getPage(field.page || 0);
      await stampField(doc, page, field, font);
    }
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

