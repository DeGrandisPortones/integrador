// src/pages/pdfs/PdfCortePlegado.jsx
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

// =====================
// Helpers
// =====================
function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(',', '.');
  const m = s.match(/-?\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

// Heurística mm: si < 500 asumimos cm y *10
function toMm(v) {
  const n = toNum(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * 10;
}

function todayDDMMYY() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${yy}`;
}

function normalizeYYYYMMDD(v) {
  const s = toStr(v);
  if (!s) return '';

  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return '';
}

function getInicioProdImput(row) {
  return normalizeYYYYMMDD(
    row?.inicio_prod_imput ??
      row?.Inicio_prod_imput ??
      row?.INICIO_PROD_IMPUT ??
      row?.inicioProdImput ??
      row?.Inicio_Prod_Imput ??
      row?.inicio_prod ??
      row?.INICIO_PROD
  );
}

function yyyymmddToDDMMYY(yyyymmdd) {
  const s = normalizeYYYYMMDD(yyyymmdd);
  if (!s) return '';
  const [Y, M, D] = s.split('-');
  return `${D}-${M}-${Y.slice(-2)}`;
}

function normTipoPierna(v) {
  const s = toStr(v).toUpperCase();
  if (s.includes('ANCHA')) return 'ANCHA';
  if (s.includes('ANGOST')) return 'ANGOSTA';
  if (s.includes('COM')) return 'COMUN';
  return s || '';
}

function piernaAnchoByTipo(tipo) {
  const t = normTipoPierna(tipo);
  if (t === 'COMUN') return '72';
  if (t === 'ANGOSTA') return '69';
  if (t === 'ANCHA') return '77';
  return '';
}

function tapaAnchoByTipo(tipo) {
  const t = normTipoPierna(tipo);
  if (t === 'COMUN') return '11';
  if (t === 'ANGOSTA') return '8';
  if (t === 'ANCHA') return '16';
  return '';
}

// Dibuja texto con fit simple
function drawFittedText(page, font, text, x, y, opts = {}) {
  const { size = 9, maxWidth = null, minSize = 7, color = rgb(0, 0, 0) } = opts;

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
    while (finalText.length > 0 && font.widthOfTextAtSize(finalText + '…', s) > maxWidth) {
      finalText = finalText.slice(0, -1);
    }
    finalText = finalText ? finalText + '…' : '';
  }

  page.drawText(finalText, { x, y, size: s, font, color });
}

// =====================
// POS (A4)
// =====================
const POS = {
  header: {
    partidaX: 138.96,
    partidaY: 728.44,
    fechaX: 513.12,
    fechaY: 729.4,
    size: 12,
  },
  table: {
    firstY: 660.61,
    stepY: -14.52,
    minY: 65,
    x: {
      nv: 34.56,
      pieza: 77.4,
      desc: 129.03,
      largo: 190.68,
      piernaAncho: 231.36,
      tapaAncho: 270.24,
      obs: 305.0,
    },
    maxWidth: {
      nv: 40,
      pieza: 55,
      desc: 70,
      largo: 40,
      piernaAncho: 35,
      tapaAncho: 35,
      obs: 240,
    },
  },
};

function buildPageSize(firstY, stepY, minY) {
  const step = Math.abs(stepY);
  if (!step) return 1;
  const count = Math.floor((firstY - minY) / step) + 1;
  return Math.max(1, count);
}

// =====================
// Fetch: privado si hay token, público si NO hay token
// =====================
function getValoresEndpoint(accessToken) {
  return accessToken ? '/api/pre-produccion-valores' : '/api/public/pre-produccion-valores';
}

// ✅ FIX: este fetch por partida NO debe filtrar por fecha (en tu versión usaba f/base sin existir)
async function fetchValoresByPartida(partida, accessToken) {
  const p = toStr(partida);
  if (!p) return [];

  const baseUrl = `${API_BASE_URL}${getValoresEndpoint(accessToken)}`;
  const url = `${baseUrl}?partida=${encodeURIComponent(p)}`;
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const res = await fetch(url, headers ? { headers } : undefined);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} en ${url}${txt ? `: ${txt}` : ''}`);
  }

  const data = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

async function fetchValoresByFechaProduccion(fechaProduccion, accessToken) {
  const f = normalizeYYYYMMDD(fechaProduccion);
  if (!f) return [];

  const base = `${API_BASE_URL}${getValoresEndpoint(accessToken)}`;
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const urlNew = `${base}?inicio_prod_imput=${encodeURIComponent(f)}`;
  let res = await fetch(urlNew, headers ? { headers } : undefined);
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    const urlOld = `${base}?fecha_envio_produccion=${encodeURIComponent(f)}`;
    res = await fetch(urlOld, headers ? { headers } : undefined);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} en ${base}${txt ? `: ${txt}` : ''}`);
  }

  const data = await res.json();
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const filtered = rows.filter((r) => getInicioProdImput(r) === f);

  const anyHasInicio = rows.some((r) => !!getInicioProdImput(r));
  if (!anyHasInicio) return rows;

  return filtered;
}

// =====================
// ✅ NUEVO: helpers para rango
// =====================
function buildDateRangeInclusive(fromYYYYMMDD, toYYYYMMDD) {
  const from = normalizeYYYYMMDD(fromYYYYMMDD);
  const to = normalizeYYYYMMDD(toYYYYMMDD);
  if (!from || !to) return [];

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start.getTime() > end.getTime()) return [];

  const out = [];
  const cur = new Date(start);
  let guard = 0;

  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
    if (guard > 370) break; // safety
  }

  return out;
}

function uniqByNV(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const k = toStr(r?.NV ?? r?.nv);
    if (!k) continue;
    if (!m.has(k)) m.set(k, r);
  }
  return Array.from(m.values());
}

// =====================
// PDF builder (EXPORTADO)
// =====================
export async function generatePdfCortePlegado(partida, rows, accessToken) {
  const p = toStr(partida);
  if (!p) throw new Error('Partida vacía');

  const safeRows = Array.isArray(rows) ? rows : await fetchValoresByPartida(p, accessToken);
  if (!safeRows.length) throw new Error(`No hay filas en pre-produccion-valores para PARTIDA=${p}`);

  const base = import.meta.env.BASE_URL || '/';
  const templateUrl = `${base}pdf_modelo_corte_plegado.pdf`;

  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) {
    throw new Error(
      `No se pudo cargar la plantilla ${templateUrl} (status ${templateRes.status}). Revisá /public/pdf_modelo_corte_plegado.pdf`
    );
  }

  const templateBytes = await templateRes.arrayBuffer();
  const templateDoc = await PDFDocument.load(templateBytes);

  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const items = [...safeRows].sort((a, b) => toNum(a.NV) - toNum(b.NV));
  const pageSize = buildPageSize(POS.table.firstY, POS.table.stepY, POS.table.minY);

  for (let i = 0; i < items.length; i += pageSize) {
    const chunk = items.slice(i, i + pageSize);

    const [page] = await outDoc.copyPages(templateDoc, [0]);
    outDoc.addPage(page);

    // Header
    drawFittedText(page, font, p, POS.header.partidaX, POS.header.partidaY, {
      size: POS.header.size,
      maxWidth: 160,
    });

    drawFittedText(page, font, todayDDMMYY(), POS.header.fechaX, POS.header.fechaY, {
      size: POS.header.size,
      maxWidth: 110,
    });

    // Rows
    chunk.forEach((r, idx) => {
      const y = POS.table.firstY + idx * POS.table.stepY;
      if (y < POS.table.minY) return;

      const tipo = r.PIERNAS_Tipo ?? r.PIERNAS_tipo ?? r.PIERNA_Tipo;
      const largoMm = Math.round(toMm(r.PIERNAS_Altura ?? r.Piernas_Altura ?? r.Pierna_Altura ?? r.piernas_altura));
      const piernaAncho = piernaAnchoByTipo(tipo);
      const tapaAncho = tapaAnchoByTipo(tipo);

      drawFittedText(page, font, r.NV, POS.table.x.nv, y, { maxWidth: POS.table.maxWidth.nv });
      drawFittedText(page, font, 'PIERNA', POS.table.x.pieza, y, { maxWidth: POS.table.maxWidth.pieza });
      drawFittedText(page, font, tipo, POS.table.x.desc, y, { maxWidth: POS.table.maxWidth.desc });

      drawFittedText(page, font, largoMm ? String(largoMm) : '', POS.table.x.largo, y, {
        maxWidth: POS.table.maxWidth.largo,
      });

      drawFittedText(page, font, piernaAncho, POS.table.x.piernaAncho, y, {
        maxWidth: POS.table.maxWidth.piernaAncho,
      });

      drawFittedText(page, font, tapaAncho, POS.table.x.tapaAncho, y, {
        maxWidth: POS.table.maxWidth.tapaAncho,
      });
    });
  }

  const bytes = await outDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function generatePdfCortePlegadoByFechaProduccion(fechaProduccion, accessToken) {
  const f = normalizeYYYYMMDD(fechaProduccion);
  if (!f) throw new Error('Falta parámetro "fecha" (YYYY-MM-DD)');

  const rows = await fetchValoresByFechaProduccion(f, accessToken);
  if (!rows.length) throw new Error(`No hay filas en pre-produccion-valores para inicio_prod_imput=${f}`);

  const headerKey = yyyymmddToDDMMYY(f) || f;
  return generatePdfCortePlegado(headerKey, rows, accessToken);
}

// ✅ NUEVO: rango (un solo listado continuo)
export async function generatePdfCortePlegadoByRangoProduccion(desde, hasta, accessToken) {
  const d = normalizeYYYYMMDD(desde);
  const h = normalizeYYYYMMDD(hasta);
  if (!d || !h) throw new Error('Faltan fechas (YYYY-MM-DD) para el rango.');

  const days = buildDateRangeInclusive(d, h);
  if (!days.length) throw new Error('Rango inválido (desde > hasta o formato incorrecto).');

  let all = [];
  for (const day of days) {
    const rows = await fetchValoresByFechaProduccion(day, accessToken);
    if (rows?.length) all = all.concat(rows);
  }

  all = uniqByNV(all);
  if (!all.length) throw new Error(`No hay filas para inicio_prod_imput entre ${d} y ${h}`);

  const headerKey = `${yyyymmddToDDMMYY(d)} a ${yyyymmddToDDMMYY(h)}`;
  return generatePdfCortePlegado(headerKey, all, accessToken);
}

export default {
  generatePdfCortePlegado,
  generatePdfCortePlegadoByFechaProduccion,
  generatePdfCortePlegadoByRangoProduccion,
};
