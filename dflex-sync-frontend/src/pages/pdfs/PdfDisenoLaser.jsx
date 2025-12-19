// src/pages/pdfs/PdfDisenoLaser.jsx
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { drawFittedText, toNum, toStr, todayDDMMYY } from './pdfUtils';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const TEMPLATE_FILENAME = 'pdf_modelo_diseno_laser.pdf';

// =====================
// Fetch SIEMPRE desde pre-produccion-valores
// =====================
async function fetchValoresByPartida(partida) {
  const p = toStr(partida);
  if (!p) return [];

  const url = `${API_BASE_URL}/api/pre-produccion-valores?partida=${encodeURIComponent(p)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} en ${url}${txt ? `: ${txt}` : ''}`);
  }

  const data = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

// =====================
// Cálculos: lado_mas_alto y calc_espada
// =====================
function calcLadoMasAltoFromParantesDescripcion(desc) {
  const s = toStr(desc);
  if (!s) return 0;

  // Ej: "40x50" / "40 X 50" / "40X50"
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return 0;

  const a = Number(String(m[1]).replace(',', '.'));
  const b = Number(String(m[2]).replace(',', '.'));
  const max = Math.max(
    Number.isFinite(a) ? a : 0,
    Number.isFinite(b) ? b : 0
  );
  return max || 0;
}

function getLadoMasAlto(row) {
  const fromRow = toNum(row?.lado_mas_alto);
  if (fromRow) return fromRow;
  return calcLadoMasAltoFromParantesDescripcion(row?.PARANTES_Descripcion);
}

function calcCalcEspadaFromRow(row) {
  const A = getLadoMasAlto(row); // lado_mas_alto
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
      dist: 230.76, // ESPADA / distancia e/huecos
      cant: 275.04,
      espadas: 322.2,
      alto: 395.52,
      chapa: 429.5, // REBAJE / CHAPA
      largo: 478.5,
      altox2: 518.5,
    },
  },
};

// =====================
// Generación PDF
//
// ✅ Soporta:
//   - generatePdfDisenoLaser(partida) -> fetchea rows
//   - generatePdfDisenoLaser(partida, rows) -> usa rows provistos
// =====================
export async function generatePdfDisenoLaser(partida, rows) {
  const p = toStr(partida);
  if (!p) throw new Error('Partida vacía');

  const safeRows = Array.isArray(rows) ? rows : await fetchValoresByPartida(p);
  if (!safeRows.length) throw new Error(`No hay filas en pre-produccion-valores para PARTIDA=${p}`);

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

    // Header
    drawFittedText(page, font, p, POS.header.partidaX, POS.header.partidaY, {
      size: POS.header.size,
      maxWidth: 120,
    });

    drawFittedText(page, font, todayDDMMYY(), POS.header.fechaX, POS.header.fechaY, {
      size: POS.header.size,
      maxWidth: 80,
    });

    // Tabla 1
    chunk.forEach((r, idx) => {
      const y = POS.t1.yRows[idx];
      if (y === undefined) return;

      drawFittedText(page, font, r?.NV, POS.t1.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, r?.PARANTES_Descripcion, POS.t1.x.desc, y, { maxWidth: 55 });
      drawFittedText(page, font, r?.Largo_Parantes, POS.t1.x.largo, y, { maxWidth: 40 });
      drawFittedText(page, font, r?.DATOS_Hueco_Chico, POS.t1.x.hc, y, { maxWidth: 35 });
      drawFittedText(page, font, r?.DATOS_Hueco_Grande, POS.t1.x.hg, y, { maxWidth: 35 });
      drawFittedText(page, font, r?.Largo_Travesaños, POS.t1.x.trav, y, { maxWidth: 55 });
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

      drawFittedText(page, font, r?.NV, POS.t2.x.nv, y, { maxWidth: 40 });

      const tipoPierna = r?.PIERNAS_Tipo ?? r?.PIERNAS_tipo ?? r?.PIERNA_Tipo;

      drawFittedText(page, font, tipoPierna, POS.t2.x.desc, y, { maxWidth: 45 });
      drawFittedText(page, font, r?.Largo_Planchuelas, POS.t2.x.largoPl, y, { maxWidth: 45 });
      drawFittedText(page, font, r?.DATOS_Brazos, POS.t2.x.dist, y, { maxWidth: 45 });

      drawFittedText(page, font, tipoPierna, POS.t2.x.pierna, y, { maxWidth: 40 });

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

      // ESPADA: si viene persistido, usarlo; sino calcularlo
      const hasStored =
        r?.calc_espada !== undefined &&
        r?.calc_espada !== null &&
        String(r?.calc_espada).trim() !== '';

      const espadaValue = hasStored ? toNum(r?.calc_espada) : calcCalcEspadaFromRow(r);
      const espadaText =
        Number.isFinite(espadaValue) && (espadaValue !== 0 || hasStored)
          ? String(Math.round(espadaValue))
          : '';

      // CHAPA: según lado_mas_alto
      const ladoMasAlto = getLadoMasAlto(r);
      const chapa = ladoMasAlto >= 60 ? '100mm' : '75mm';

      const tipoPierna = r?.PIERNAS_Tipo ?? r?.PIERNAS_tipo ?? r?.PIERNA_Tipo;

      drawFittedText(page, font, r?.NV, POS.t3.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, tipoPierna, POS.t3.x.desc, y, { maxWidth: 45 });
      drawFittedText(page, font, r?.DINTEL_Ancho, POS.t3.x.dintelAncho, y, { maxWidth: 55 });

      // ESPADA / distancia e/huecos
      drawFittedText(page, font, espadaText, POS.t3.x.dist, y, {
        maxWidth: 32,
        size: 7,
        minSize: 5,
      });

      // ALTO (lo mantenemos como estaba)
      drawFittedText(page, font, r?.Espesor_Revestimiento, POS.t3.x.alto, y, { maxWidth: 28 });

      // CHAPA
      drawFittedText(page, font, chapa, POS.t3.x.chapa, y, {
        maxWidth: 44,
        size: 7,
        minSize: 5,
      });

      drawFittedText(page, font, r?.Largo_Travesaños ?? r?.Largo_Travesaño, POS.t3.x.largo, y, {
        maxWidth: 36,
      });
      drawFittedText(page, font, r?.Largo_Parantes, POS.t3.x.altox2, y, { maxWidth: 42 });
    });
  }

  const bytes = await outDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

// Default export para callGenerator (mod.default[fnName])
export default {
  generatePdfDisenoLaser,
};
