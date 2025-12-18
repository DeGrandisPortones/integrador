// src/pages/pdfs/pdfUtils.js
import { rgb } from 'pdf-lib';

export function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function toNum(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(',', '.');
  const m = s.match(/-?\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function todayDDMMYY() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${yy}`;
}

export function upperNoAccents(s) {
  return toStr(s)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Heurística: si viene chico (<500) asumimos cm y pasamos a mm (*10)
export function maybeToMm(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 500 ? n * 10 : n;
}

// Dibuja texto con “fit” simple (si se pasa de ancho, reduce tamaño / trunca)
export function drawFittedText(page, font, text, x, y, opts = {}) {
  const {
    size = 8,
    maxWidth = null,
    minSize = 6,
    color = rgb(0, 0, 0),
  } = opts;

  const t = toStr(text);
  if (!t) return;

  if (!maxWidth) {
    page.drawText(t, { x, y, size, font, color });
    return;
  }

  let s = size;
  while (s >= minSize) {
    const w = font.widthOfTextAtSize(t, s);
    if (w <= maxWidth) break;
    s -= 0.5;
  }

  let finalText = t;
  if (font.widthOfTextAtSize(finalText, s) > maxWidth) {
    while (
      finalText.length > 0 &&
      font.widthOfTextAtSize(finalText + '…', s) > maxWidth
    ) {
      finalText = finalText.slice(0, -1);
    }
    finalText = finalText ? finalText + '…' : '';
  }

  page.drawText(finalText, { x, y, size: s, font, color });
}
