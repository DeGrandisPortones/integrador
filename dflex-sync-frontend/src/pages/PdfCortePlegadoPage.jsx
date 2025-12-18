// src/pages/PdfCortePlegadoPage.jsx
import { useMemo, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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

function normalizeTipoPierna(tipo) {
  const t = toStr(tipo).toUpperCase();
  return t
    .replaceAll('Á', 'A')
    .replaceAll('É', 'E')
    .replaceAll('Í', 'I')
    .replaceAll('Ó', 'O')
    .replaceAll('Ú', 'U')
    .replaceAll('Ü', 'U')
    .replaceAll('Ñ', 'N');
}

function getPiernaAnchoYTapa(tipoPiernaRaw) {
  const t = normalizeTipoPierna(tipoPiernaRaw);
  if (t.includes('ANCHA')) return { piernaAncho: '77', tapaAncho: '16' };
  if (t.includes('ANGOST')) return { piernaAncho: '69', tapaAncho: '8' };
  return { piernaAncho: '72', tapaAncho: '11' }; // COMUN default
}

function drawFittedText(page, font, text, x, y, opts = {}) {
  const {
    size = 9,
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

// Coordenadas del template CORTE-PLEGADO
const FIRST_ROW_Y = 662.64;
const ROW_STEP = 14.52;
const ROWS_PER_PAGE = 12;

const POS = {
  header: {
    partidaX: 138.96,
    partidaY: 730.44,
    fechaX: 513.12,
    fechaY: 731.4,
    size: 10,
  },
  table: {
    yRows: Array.from({ length: ROWS_PER_PAGE }, (_, i) => FIRST_ROW_Y - i * ROW_STEP),
    x: {
      nv: 34.56,
      pieza: 77.4,
      desc: 129.03,
      largo: 190.68,
      piernaAncho: 231.36,
      tapaAncho: 270.24,
    },
  },
};

async function generatePdfForPartida(partida, rows) {
  const base = import.meta.env.BASE_URL || '/';
  const templateUrl = `${base}pdf_modelo_corte_plegado.pdf`;

  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) {
    throw new Error(
      `No se pudo cargar la plantilla ${templateUrl} (status ${templateRes.status}). Revisá /public/pdf_modelo_corte_plegado.pdf`
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
  const pageSize = POS.table.yRows.length;

  for (let i = 0; i < items.length; i += pageSize) {
    const chunk = items.slice(i, i + pageSize);

    const [page] = await outDoc.copyPages(templateDoc, [0]);
    outDoc.addPage(page);

    // Header
    drawFittedText(page, font, toStr(partida), POS.header.partidaX, POS.header.partidaY, {
      size: POS.header.size,
      maxWidth: 60,
    });

    drawFittedText(page, font, todayDDMMYY(), POS.header.fechaX, POS.header.fechaY, {
      size: POS.header.size,
      maxWidth: 90,
    });

    // Tabla
    chunk.forEach((r, idx) => {
      const y = POS.table.yRows[idx];
      if (y === undefined) return;

      const nv = toStr(r.NV);
      const pieza = 'PIERNA';
      const tipoPierna = toStr(r.PIERNAS_Tipo);
      const desc = normalizeTipoPierna(tipoPierna);
      const largo = toStr(r.PIERNAS_Altura);

      const { piernaAncho, tapaAncho } = getPiernaAnchoYTapa(tipoPierna);

      drawFittedText(page, font, nv, POS.table.x.nv, y, { maxWidth: 55, size: 10 });
      drawFittedText(page, font, pieza, POS.table.x.pieza, y, { maxWidth: 60, size: 10 });
      drawFittedText(page, font, desc, POS.table.x.desc, y, { maxWidth: 80, size: 10 });
      drawFittedText(page, font, largo, POS.table.x.largo, y, { maxWidth: 45, size: 10 });
      drawFittedText(page, font, piernaAncho, POS.table.x.piernaAncho, y, { maxWidth: 30, size: 10 });
      drawFittedText(page, font, tapaAncho, POS.table.x.tapaAncho, y, { maxWidth: 30, size: 10 });
    });
  }

  const bytes = await outDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export default function PdfCortePlegadoPage({ partida: partidaProp = '', embedded = false }) {
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
      a.download = `Corte_Plegado_Partida_${p}.pdf`;
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

  if (embedded) {
    return (
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleGenerate}
          disabled={!canGenerate || loading}
        >
          {loading ? 'Generando...' : 'Generar PDF (Corte y Plegado)'}
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

  return (
    <div className="import-panel">
      <h2>PDF Corte y Plegado por PARTIDA</h2>

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
        Usa la plantilla <code>/public/pdf_modelo_corte_plegado.pdf</code>.
      </p>
    </div>
  );
}
