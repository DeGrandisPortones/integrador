// src/pages/pdfs/PdfDisenoLaser.jsx
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const TEMPLATE_FILENAME = 'pdf_modelo_diseno_laser.pdf';

// =====================
// Helpers locales
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

function yyyymmddToDDMMYY(yyyymmdd) {
  const s = normalizeYYYYMMDD(yyyymmdd);
  if (!s) return '';
  const [Y, M, D] = s.split('-');
  return `${D}-${M}-${Y.slice(-2)}`;
}

function drawFittedText(page, font, text, x, y, opts = {}) {
  const { size = 9, minSize = 6, maxWidth = null, color = rgb(0, 0, 0) } = opts;

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
// Fetch: privado si hay token, público si NO hay token
// =====================
function getValoresEndpoint(accessToken) {
  return accessToken ? '/api/pre-produccion-valores' : '/api/public/pre-produccion-valores';
}

// NUEVO: fetch por fecha_envio_produccion (día)
async function fetchValoresByFechaProduccion(fechaProduccion, accessToken) {
  const f = normalizeYYYYMMDD(fechaProduccion);
  if (!f) return [];

  const url = `${API_BASE_URL}${getValoresEndpoint(accessToken)}?fecha_envio_produccion=${encodeURIComponent(f)}`;
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const res = await fetch(url, headers ? { headers } : undefined);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} en ${url}${txt ? `: ${txt}` : ''}`);
  }

  const data = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

// =====================
// Getters robustos puerta
// =====================
function getPuertaPos(row) {
  return toStr(
    row?.PUERTA_Posicion ??
      row?.Puerta_Posicion ??
      row?.puerta_posicion ??
      row?.PUERTA_POSICION ??
      row?.puertaPosicion
  ).toUpperCase();
}

function calcPuertaSiNo(row) {
  const pos = getPuertaPos(row);
  if (!pos) return 'NO';
  if (pos === 'NO' || pos === '0' || pos === 'N') return 'NO';
  return 'SI';
}

function getPuertaAlto(row) {
  const v =
    row?.Puerta_Alto ??
    row?.PUERTA_Alto ??
    row?.PUERTA_ALTO ??
    row?.puerta_alto ??
    row?.PUERTAalto ??
    row?.puertaAlto;
  const n = toNum(v);
  return n ? String(Math.round(n)) : '';
}

function getPuertaAncho(row) {
  const v =
    row?.Puerta_Ancho ??
    row?.PUERTA_Ancho ??
    row?.PUERTA_ANCHO ??
    row?.puerta_ancho ??
    row?.PUERTAancho ??
    row?.puertaAncho;
  const n = toNum(v);
  return n ? String(Math.round(n)) : '';
}

// =====================
// Cálculos: lado_mas_alto y calc_espada
// =====================
function calcLadoMasAltoFromParantesDescripcion(desc) {
  const s = toStr(desc);
  if (!s) return 0;

  const m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return 0;

  const a = Number(String(m[1]).replace(',', '.'));
  const b = Number(String(m[2]).replace(',', '.'));
  const max = Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0);
  return max || 0;
}

function getLadoMasAlto(row) {
  const fromRow = toNum(row?.lado_mas_alto);
  if (fromRow) return fromRow;
  return calcLadoMasAltoFromParantesDescripcion(row?.PARANTES_Descripcion);
}

function calcCalcEspadaFromRow(row) {
  const A = getLadoMasAlto(row);
  const B = toNum(row?.Largo_Parantes);
  const C = toNum(row?.DATOS_Brazos);

  if (!A || !B || !C) return 0;

  if (A === 50) {
    if (B >= 2950 && B < 3150) return C - 12 - 45;
    if (B < 2950) return C - 12 - 40;
    return C - 12 - 55;
  }

  if (A === 70) {
    if (B <= 2300) return C - 12 - 22;
    if (B <= 2420) return C - 12 - 25;
    if (B <= 2800) return C - 12 - 33;
    if (B < 3150) return C - 12 - 38;
    return C - 12 - 55;
  }

  if (A === 80) {
    return C - 12 - 35;
  }

  return 0;
}

// =====================
// Coordenadas
// =====================
const POS = {
  header: {
    partidaX: 104.52,
    partidaY: 739.34,
    fechaX: 481.44,
    fechaY: 740.0,
    size: 12,
  },

  t1: {
    yRows: [653.06, 641.54, 630.02, 618.5, 606.98, 595.46],
    x: {
      nv: 34.32,
      desc: 101.07,
      largo: 158.17,
      hc: 201.97,
      hg: 237.69,
      trav: 280.54,
      parInt: 340.65,
      cant: 404.88,
      disp: 428.88,
      pas: 478.5,
      puerta: 518.5,
    },
  },

  t2: {
    yRows: [459.62, 447.62, 435.62, 423.62, 411.62, 399.62],
    x: {
      nv: 34.32,
      desc: 94.92,
      largoPl: 145.66,
      dist: 192.94,
      pierna: 241.43,
      sino: 280.08,
      puertaAlto: 329.52,
      ancho: 390.12,
      lado: 470.5,
      descCanio: 518.5,
    },
  },

  t3: {
    yRows: [258.23, 246.23, 234.23, 222.23, 210.23, 198.23],
    x: {
      nv: 34.32,
      desc: 94.92,
      dintelAncho: 145.66,
      dist: 230.76,
      cant: 275.04,
      espadas: 322.2,
      alto: 395.52,
      chapa: 429.5,
      largo: 478.5,
      altox2: 518.5,
    },
  },
};

// =====================
// Generación PDF (por filas ya obtenidas)
// =====================
async function buildPdfDisenoLaser({ headerKey, rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) throw new Error('No hay filas para generar el PDF');

  const base = import.meta.env.BASE_URL || '/';
  const templateUrl = `${base}${TEMPLATE_FILENAME}`;

  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) {
    throw new Error(
      `No se pudo cargar la plantilla ${templateUrl} (status ${templateRes.status}). Revisá /public/${TEMPLATE_FILENAME}`
    );
  }

  const templateBytes = await templateRes.arrayBuffer();
  const templateDoc = await PDFDocument.load(templateBytes);

  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const items = [...safeRows].sort((a, b) => toNum(a?.NV) - toNum(b?.NV));
  const pageSize = 6;

  for (let i = 0; i < items.length; i += pageSize) {
    const chunk = items.slice(i, i + pageSize);

    const [page] = await outDoc.copyPages(templateDoc, [0]);
    outDoc.addPage(page);

    // Header: en el lugar “partida”, ponemos la fecha (dd-mm-yy)
    const key = toStr(headerKey);
    const keyPretty = normalizeYYYYMMDD(key) ? yyyymmddToDDMMYY(key) : key;

    drawFittedText(page, font, keyPretty, POS.header.partidaX, POS.header.partidaY, {
      size: POS.header.size,
      maxWidth: 140,
    });

    // Fecha de impresión
    drawFittedText(page, font, todayDDMMYY(), POS.header.fechaX, POS.header.fechaY, {
      size: POS.header.size,
      maxWidth: 80,
    });

    // Tabla 1
    chunk.forEach((r, idx) => {
      const y = POS.t1.yRows[idx];
      if (y === undefined) return;

      const largoTrav =
        r?.Largo_Travesaños ??
        r?.Largo_Travesanos ??
        r?.Largo_Travesaño ??
        r?.Largo_Travesano;

      drawFittedText(page, font, r?.NV, POS.t1.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, r?.PARANTES_Descripcion, POS.t1.x.desc, y, { maxWidth: 55 });
      drawFittedText(page, font, r?.Largo_Parantes, POS.t1.x.largo, y, { maxWidth: 40 });
      drawFittedText(page, font, r?.DATOS_Hueco_Chico, POS.t1.x.hc, y, { maxWidth: 35 });
      drawFittedText(page, font, r?.DATOS_Hueco_Grande, POS.t1.x.hg, y, { maxWidth: 35 });
      drawFittedText(page, font, largoTrav, POS.t1.x.trav, y, { maxWidth: 55 });
      drawFittedText(page, font, r?.Parantes_Internos, POS.t1.x.parInt, y, { maxWidth: 55 });
      drawFittedText(page, font, r?.Cantidad_Soportes, POS.t1.x.cant, y, { maxWidth: 18 });

      drawFittedText(page, font, r?.PARANTES_Distribucion, POS.t1.x.disp, y, { maxWidth: 47 });
      drawFittedText(page, font, r?.PASADOR_Condicion, POS.t1.x.pas, y, {
        maxWidth: 36,
        size: 7,
        minSize: 5,
      });
      drawFittedText(page, font, r?.PUERTA_Posicion, POS.t1.x.puerta, y, {
        maxWidth: 42,
        size: 7,
        minSize: 5,
      });
    });

    // Tabla 2
    chunk.forEach((r, idx) => {
      const y = POS.t2.yRows[idx];
      if (y === undefined) return;

      const tipoPierna = r?.PIERNAS_Tipo ?? r?.PIERNAS_tipo ?? r?.PIERNA_Tipo;

      const puertaSiNo = calcPuertaSiNo(r);
      const puertaAlto = getPuertaAlto(r);
      const puertaAncho = getPuertaAncho(r);

      drawFittedText(page, font, r?.NV, POS.t2.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, tipoPierna, POS.t2.x.desc, y, { maxWidth: 45 });
      drawFittedText(page, font, r?.Largo_Planchuelas, POS.t2.x.largoPl, y, { maxWidth: 45 });
      drawFittedText(page, font, r?.DATOS_Brazos, POS.t2.x.dist, y, { maxWidth: 45 });
      drawFittedText(page, font, tipoPierna, POS.t2.x.pierna, y, { maxWidth: 40 });

      drawFittedText(page, font, puertaSiNo, POS.t2.x.sino, y, { maxWidth: 40 });
      drawFittedText(page, font, puertaAlto, POS.t2.x.puertaAlto, y, { maxWidth: 55 });
      drawFittedText(page, font, puertaAncho, POS.t2.x.ancho, y, { maxWidth: 55 });

      drawFittedText(page, font, r?.PUERTA_Posicion, POS.t2.x.lado, y, {
        maxWidth: 44,
        size: 7,
        minSize: 5,
      });
    });

    // Tabla 3
    chunk.forEach((r, idx) => {
      const y = POS.t3.yRows[idx];
      if (y === undefined) return;

      const hasStored =
        r?.calc_espada !== undefined &&
        r?.calc_espada !== null &&
        String(r?.calc_espada).trim() !== '';

      const espadaValue = hasStored ? toNum(r?.calc_espada) : calcCalcEspadaFromRow(r);
      const espadaText =
        Number.isFinite(espadaValue) && (espadaValue !== 0 || hasStored)
          ? String(Math.round(espadaValue))
          : '';

      const ladoMasAlto = getLadoMasAlto(r);
      const chapa = ladoMasAlto >= 60 ? '100mm' : '75mm';

      const tipoPierna = r?.PIERNAS_Tipo ?? r?.PIERNAS_tipo ?? r?.PIERNA_Tipo;
      const largoTrav =
        r?.Largo_Travesaños ??
        r?.Largo_Travesanos ??
        r?.Largo_Travesaño ??
        r?.Largo_Travesano;

      drawFittedText(page, font, r?.NV, POS.t3.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, tipoPierna, POS.t3.x.desc, y, { maxWidth: 45 });
      drawFittedText(page, font, r?.DINTEL_Ancho, POS.t3.x.dintelAncho, y, { maxWidth: 55 });

      drawFittedText(page, font, espadaText, POS.t3.x.dist, y, {
        maxWidth: 32,
        size: 7,
        minSize: 5,
      });

      drawFittedText(page, font, r?.Espesor_Revestimiento, POS.t3.x.alto, y, { maxWidth: 28 });

      drawFittedText(page, font, chapa, POS.t3.x.chapa, y, {
        maxWidth: 44,
        size: 7,
        minSize: 5,
      });

      drawFittedText(page, font, largoTrav, POS.t3.x.largo, y, { maxWidth: 36 });
      drawFittedText(page, font, r?.Largo_Parantes, POS.t3.x.altox2, y, { maxWidth: 42 });
    });
  }

  const bytes = await outDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

// =====================
// API pública: por fecha de producción
// =====================
export async function generatePdfDisenoLaserByFechaProduccion(fechaProduccion, accessToken) {
  const f = normalizeYYYYMMDD(fechaProduccion);
  if (!f) throw new Error('Falta parámetro "fecha" (YYYY-MM-DD)');

  const rows = await fetchValoresByFechaProduccion(f, accessToken);
  if (!rows.length) throw new Error(`No hay filas para fecha_envio_produccion=${f}`);

  return buildPdfDisenoLaser({ headerKey: f, rows });
}

export default {
  generatePdfDisenoLaserByFechaProduccion,
};
