// src/pages/pdfs/PdfCortePlegado.jsx
import { useMemo, useState } from 'react';
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
  return n < 500 ? n * 10 : n;
}

function todayDDMMYY() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${yy}`;
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
// Fetch: SIEMPRE desde pre-produccion-valores
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
// PDF builder (EXPORTADO)
//
// ✅ Ahora soporta 2 usos:
//   - generatePdfCortePlegado(partida)            -> fetchea rows solo
//   - generatePdfCortePlegado(partida, rows)      -> usa rows provistos
// =====================
export async function generatePdfCortePlegado(partida, rows) {
  const p = toStr(partida);
  if (!p) throw new Error('Partida vacía');

  const safeRows = Array.isArray(rows) ? rows : await fetchValoresByPartida(p);
  if (!safeRows.length) throw new Error(`No hay portones con PARTIDA = ${p}`);

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

      const tipo = r.PIERNAS_Tipo ?? r.PIERNAS_tipo ?? r.PIERNA_Tipo ?? '';
      const largoMm = Math.round(toMm(r.PIERNAS_Altura ?? r.Piernas_Altura ?? r.PIERNA_Altura ?? r.Pierna_Altura));
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

// =====================
// Component (opcional)
// =====================
export default function PdfCortePlegado() {
  const [partida, setPartida] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState(null);

  const canGenerate = useMemo(() => toStr(partida).length > 0, [partida]);

  async function handleGenerate() {
    const p = toStr(partida);
    if (!p) return;

    setLoading(true);
    setError('');
    setCount(null);

    try {
      const rows = await fetchValoresByPartida(p);
      setCount(rows.length);

      if (!rows.length) throw new Error(`No hay portones con PARTIDA = ${p}`);

      const pdfBlob = await generatePdfCortePlegado(p, rows);

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Partida_${p}_CortePlegado.pdf`;
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

  return (
    <div className="import-panel">
      <h2>PDF Corte y Plegado</h2>

      <div className="field-row">
        <label>
          PARTIDA:&nbsp;
          <input
            type="text"
            value={partida}
            onChange={(e) => setPartida(e.target.value)}
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
        <div className="info" style={{ marginTop: 8 }}>
          Portones encontrados: <b>{count}</b>
        </div>
      )}

      {error && (
        <div className="error" style={{ marginTop: 8 }}>
          ⚠ {error}
        </div>
      )}

      <p className="hint">
        Usa la plantilla <code>/public/pdf_modelo_corte_plegado.pdf</code>.
      </p>
    </div>
  );
}
