// src/pages/ViewPdf.jsx
import { useMemo, useState } from 'react';
import { generatePdfDisenoLaser } from './pdfs/PdfDisenoLaser';
import { generatePdfCortePlegado } from './pdfs/PdfCortePlegado';
import { generatePdfTapajuntas } from './pdfs/PdfTapajuntas';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export default function ViewPdf() {
  const [partida, setPartida] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingWhich, setLoadingWhich] = useState('');
  const [error, setError] = useState('');
  const [count, setCount] = useState(null);

  const canGenerate = useMemo(() => toStr(partida).length > 0, [partida]);

  async function fetchRowsByPartida(p) {
    const res = await fetch(`${API_BASE_URL}/api/pre-produccion-valores?partida=${encodeURIComponent(p)}`);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    const data = await res.json();
    const rows = data.rows || [];
    return rows;
  }

  async function handleGenerate(kind) {
    const p = toStr(partida);
    if (!p) return;

    setLoading(true);
    setLoadingWhich(kind);
    setError('');
    setCount(null);

    try {
      const rows = await fetchRowsByPartida(p);
      setCount(rows.length);

      if (!rows.length) {
        throw new Error(`No hay portones con PARTIDA = ${p}`);
      }

      let pdfBlob;
      let filename;

      if (kind === 'diseno_laser') {
        pdfBlob = await generatePdfDisenoLaser(p, rows);
        filename = `Partida_${p}_DisenoLaser.pdf`;
      } else if (kind === 'corte_plegado') {
        pdfBlob = await generatePdfCortePlegado(p, rows);
        filename = `Partida_${p}_CortePlegado.pdf`;
      } else if (kind === 'tapajuntas') {
        pdfBlob = await generatePdfTapajuntas(p, rows);
        filename = `Partida_${p}_Tapajuntas.pdf`;
      } else {
        throw new Error('Tipo de PDF inválido.');
      }

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
      setLoadingWhich('');
    }
  }

  return (
    <div className="import-panel">
      <h2>PDF por PARTIDA</h2>

      <div className="field-row" style={{ gap: 12, flexWrap: 'wrap' }}>
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
          onClick={() => handleGenerate('diseno_laser')}
          disabled={!canGenerate || loading}
        >
          {loading && loadingWhich === 'diseno_laser' ? 'Generando…' : 'PDF Diseño Laser'}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleGenerate('corte_plegado')}
          disabled={!canGenerate || loading}
        >
          {loading && loadingWhich === 'corte_plegado' ? 'Generando…' : 'PDF Corte y Plegado'}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleGenerate('tapajuntas')}
          disabled={!canGenerate || loading}
        >
          {loading && loadingWhich === 'tapajuntas' ? 'Generando…' : 'PDF Tapajuntas'}
        </button>
      </div>

      {count !== null && (
        <div className="info">
          Portones encontrados: <b>{count}</b>
        </div>
      )}

      {error && <div className="error">⚠ {error}</div>}

      <p className="hint">
        Plantillas en <code>/public</code>:&nbsp;
        <code>pdf_modelo_diseño_laser.pdf</code>, <code>pdf_modelo_corte_plegado.pdf</code>, <code>pdf_modelo_tapajuntas.pdf</code>.
      </p>
    </div>
  );
}
