// src/pages/PdfPartidaPage.jsx
import { useMemo, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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

function todayDDMMYY() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${yy}`;
}

function normalizeSiNoFromPuerta(puertaPos) {
  const v = toStr(puertaPos).toUpperCase();
  return v && v !== 'NO' ? 'SI' : 'NO';
}

function planchuelaDescripcionByPierna(piernaTipo) {
  const t = toStr(piernaTipo).toUpperCase();
  return t === 'ANCHA' ? '1Y1/4X5/16' : '1Y1/4X1/4';
}

function canioPuertaDescripcion(puertaAlto, puertaAncho) {
  const alto = toNum(puertaAlto);
  const ancho = toNum(puertaAncho);
  const total = alto * 2 + ancho * 2;
  if (total > 5880) return 'Separada';
  if (total < 5880) return 'Incompleta';
  return 'Completa';
}

// =====================
// Cálculos calc_espada / lado_mas_alto
// =====================
function calcLadoMasAltoFromParantesDescripcion(desc) {
  const s = toStr(desc);
  if (!s) return 0;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return 0;
  const right = Number(String(m[2]).replace(',', '.'));
  return Number.isFinite(right) ? right : 0;
}

function getLadoMasAlto(row) {
  const fromRow = toNum(row.lado_mas_alto);
  if (fromRow) return fromRow;
  return calcLadoMasAltoFromParantesDescripcion(row.PARANTES_Descripcion);
}

function calcCalcEspadaFromRow(row) {
  const A = getLadoMasAlto(row);
  const B = toNum(row.Largo_Parantes);
  const C = toNum(row.DATOS_Brazos);

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

function drawFittedText(page, font, text, x, y, opts = {}) {
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

async function generatePdfForPartida(partida, rows) {
  const base = import.meta.env.BASE_URL || '/';
  const templateUrl = `${base}pdf_modelo.pdf`;

  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) {
    throw new Error(
      `No se pudo cargar la plantilla ${templateUrl} (status ${templateRes.status}). Revisá /public/pdf_modelo.pdf`
    );
  }

  const templateBytes = await templateRes.arrayBuffer();
  const head = new Uint8Array(templateBytes.slice(0, 4));
  const isPdf =
    head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  if (!isPdf) {
    throw new Error(`La plantilla ${templateUrl} no parece un PDF válido.`);
  }

  const templateDoc = await PDFDocument.load(templateBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const items = [...rows].sort((a, b) => toNum(a.NV) - toNum(b.NV));
  const pageSize = 6;

  for (let i = 0; i < items.length; i += pageSize) {
    const chunk = items.slice(i, i + pageSize);

    const [page] = await outDoc.copyPages(templateDoc, [0]);
    outDoc.addPage(page);

    drawFittedText(page, font, toStr(partida), POS.header.partidaX, POS.header.partidaY, {
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

      drawFittedText(page, font, r.NV, POS.t1.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, r.PARANTES_Descripcion, POS.t1.x.desc, y, { maxWidth: 55 });
      drawFittedText(page, font, r.Largo_Parantes, POS.t1.x.largo, y, { maxWidth: 40 });
      drawFittedText(page, font, r.DATOS_Hueco_Chico, POS.t1.x.hc, y, { maxWidth: 35 });
      drawFittedText(page, font, r.DATOS_Hueco_Grande, POS.t1.x.hg, y, { maxWidth: 35 });
      drawFittedText(page, font, r.Largo_Travesaños, POS.t1.x.trav, y, { maxWidth: 55 });
      drawFittedText(page, font, r.Parantes_Internos, POS.t1.x.parInt, y, { maxWidth: 55 });
      drawFittedText(page, font, r.Cantidad_Soportes, POS.t1.x.cant, y, { maxWidth: 18 });

      drawFittedText(page, font, r.PARANTES_Distribucion, POS.t1.x.disp, y, { maxWidth: 47 });
      drawFittedText(page, font, r.PASADOR_Condicion, POS.t1.x.pas, y, {
        maxWidth: 36,
        size: 7,
        minSize: 5,
      });
      drawFittedText(page, font, r.PUERTA_Posicion, POS.t1.x.puerta, y, {
        maxWidth: 42,
        size: 7,
        minSize: 5,
      });
    });

    // Tabla 2
    chunk.forEach((r, idx) => {
      const y = POS.t2.yRows[idx];
      if (y === undefined) return;

      const piernaTipo = r.PIERNAS_tipo ?? r.PIERNA_Tipo ?? r.PIERNAS_Tipo;
      const puertaPos = r.PUERTA_Posicion;

      const descPlanchuela = planchuelaDescripcionByPierna(piernaTipo);
      const sino = normalizeSiNoFromPuerta(puertaPos);
      const descCanio = canioPuertaDescripcion(r.Puerta_Alto, r.Puerta_Ancho);

      drawFittedText(page, font, r.NV, POS.t2.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, descPlanchuela, POS.t2.x.desc, y, { maxWidth: 45 });

      drawFittedText(page, font, r.Largo_Planchuelas, POS.t2.x.largoPl, y, { maxWidth: 45 });
      drawFittedText(page, font, r.DATOS_Brazos, POS.t2.x.dist, y, { maxWidth: 45 });

      drawFittedText(page, font, piernaTipo, POS.t2.x.pierna, y, { maxWidth: 40 });
      drawFittedText(page, font, sino, POS.t2.x.sino, y, { maxWidth: 35 });

      drawFittedText(page, font, r.Puerta_Alto, POS.t2.x.puertaAlto, y, { maxWidth: 50 });
      drawFittedText(page, font, r.Puerta_Ancho, POS.t2.x.ancho, y, { maxWidth: 50 });

      drawFittedText(page, font, puertaPos, POS.t2.x.lado, y, { maxWidth: 44, size: 7, minSize: 5 });
      drawFittedText(page, font, descCanio, POS.t2.x.descCanio, y, { maxWidth: 42, size: 7, minSize: 5 });
    });

    // Tabla 3
    chunk.forEach((r, idx) => {
      const y = POS.t3.yRows[idx];
      if (y === undefined) return;

      const trav = toNum(r.Largo_Travesaños ?? r.Largo_Travesaño);
      const cant = trav > 350 ? '2' : '1';

      const motor = toStr(r.MOTOR_Condicion).toUpperCase();
      const espadas = motor.includes('AUTOM') ? 'AUTOMATICO' : '';

      const hasStoredCalcEspada =
        r.calc_espada !== undefined && r.calc_espada !== null && String(r.calc_espada).trim() !== '';

      const espadaValue = hasStoredCalcEspada ? toNum(r.calc_espada) : calcCalcEspadaFromRow(r);

      const distEHuecos =
        Number.isFinite(espadaValue) && (espadaValue !== 0 || hasStoredCalcEspada)
          ? String(Math.round(espadaValue))
          : '';

      const ladoMasAlto = getLadoMasAlto(r);
      const chapa = ladoMasAlto >= 60 ? '100mm' : '75mm';

      drawFittedText(page, font, r.NV, POS.t3.x.nv, y, { maxWidth: 40 });
      drawFittedText(page, font, r.PIERNAS_Tipo ?? r.PIERNAS_tipo ?? r.PIERNA_Tipo, POS.t3.x.desc, y, { maxWidth: 45 });
      drawFittedText(page, font, r.DINTEL_Ancho, POS.t3.x.dintelAncho, y, { maxWidth: 55 });

      drawFittedText(page, font, distEHuecos, POS.t3.x.dist, y, { maxWidth: 32, size: 7, minSize: 5 });

      drawFittedText(page, font, cant, POS.t3.x.cant, y, { maxWidth: 20 });

      drawFittedText(page, font, espadas, POS.t3.x.espadas, y, { maxWidth: 61, size: 7, minSize: 5 });

      drawFittedText(page, font, r.Espesor_Revestimiento, POS.t3.x.alto, y, { maxWidth: 28 });

      drawFittedText(page, font, chapa, POS.t3.x.chapa, y, { maxWidth: 44, size: 7, minSize: 5 });

      drawFittedText(page, font, r.Largo_Travesaños ?? r.Largo_Travesaño, POS.t3.x.largo, y, { maxWidth: 36 });

      drawFittedText(page, font, r.Largo_Parantes, POS.t3.x.altox2, y, { maxWidth: 42 });
    });
  }

  const bytes = await outDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

// =====================
// Componente
// =====================
// Props:
// - partida: string (si viene desde ViewPdf)
// - embedded: boolean (si está embebido en ViewPdf, oculta input y solo muestra botón)
export default function PdfPartidaPage({ partida: partidaProp = '', embedded = false }) {
  const [partidaState, setPartidaState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState(null);

  const partidaFinal = embedded ? toStr(partidaProp) : toStr(partidaState);
  const canGenerate = useMemo(() => partidaFinal.length > 0, [partidaFinal]);

  async function handleGenerate() {
    const p = partidaFinal;
    if (!p) return;

    setLoading(true);
    setError('');
    setCount(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/pre-produccion-valores?partida=${encodeURIComponent(p)}`
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }

      const data = await res.json();
      const rows = data.rows || [];
      setCount(rows.length);

      if (!rows.length) {
        throw new Error(`No hay portones con PARTIDA = ${p}`);
      }

      const pdfBlob = await generatePdfForPartida(p, rows);

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Partida_${p}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // Embebido: solo botón
  if (embedded) {
    return (
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleGenerate}
          disabled={!canGenerate || loading}
        >
          {loading ? 'Generando...' : 'Generar PDF (Modelo General)'}
        </button>

        {count !== null && (
          <div className="info" style={{ marginTop: 8 }}>
            Portones encontrados: <b>{count}</b>
          </div>
        )}

        {error && (
          <div className="error" style={{ marginTop: 8 }}>
            ⚠ {error}
          </div>
        )}
      </div>
    );
  }

  // Modo standalone (como lo tenías)
  return (
    <div className="import-panel">
      <h2>Generar PDF por PARTIDA</h2>

      <div className="field-row">
        <label>
          PARTIDA:&nbsp;
          <input
            type="text"
            value={partidaState}
            onChange={(e) => setPartidaState(e.target.value)}
            placeholder="Ej: 507"
          />
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleGenerate}
          disabled={!canGenerate || loading}
        >
          {loading ? 'Generando...' : 'Generar PDF'}
        </button>
      </div>

      {count !== null && (
        <div className="info">
          Portones encontrados: <b>{count}</b>
        </div>
      )}

      {error && <div className="error">⚠ {error}</div>}

      <p className="hint">
        Usa la plantilla <code>/public/pdf_modelo.pdf</code> y completa las 3
        tablas según la PARTIDA.
      </p>
    </div>
  );
}
