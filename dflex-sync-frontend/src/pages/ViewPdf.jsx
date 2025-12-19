// src/pages/ViewPdf.jsx
import { useMemo, useState } from 'react';

// Arm Primario
import {
  generatePdfArmPrimarioByNv,
  generatePdfArmPrimarioByPartida,
} from './pdfs/PdfArmPrimario.jsx';

// ✅ Imports estáticos (sin dynamic import para evitar 404 de chunks en Vercel)
import { generatePdfDisenoLaserByPartida } from './pdfs/PdfDisenoLaser.jsx';
import { generatePdfCortePlegadoByPartida } from './pdfs/PdfCortePlegado.jsx';
import { generatePdfTapajuntasByPartida } from './pdfs/PdfTapajuntas.jsx';

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export default function ViewPdf() {
  const [partida, setPartida] = useState('');
  const [nv, setNv] = useState('');

  const [loadingKey, setLoadingKey] = useState('');
  const [error, setError] = useState('');

  const canPartida = useMemo(() => toStr(partida).length > 0, [partida]);
  const canNv = useMemo(() => toStr(nv).length > 0, [nv]);

  async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function run(key, fn) {
    setLoadingKey(key);
    setError('');
    try {
      const blob = await fn();
      await downloadBlob(blob, key);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setLoadingKey('');
    }
  }

  return (
    <div className="import-panel">
      <h2>Generar PDFs</h2>

      <div className="field-row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <label>
          PARTIDA:&nbsp;
          <input
            type="text"
            value={partida}
            onChange={(e) => setPartida(e.target.value)}
            placeholder="Ej: 507"
          />
        </label>

        <label>
          NV (portón):&nbsp;
          <input
            type="text"
            value={nv}
            onChange={(e) => setNv(e.target.value)}
            placeholder="Ej: 4003"
          />
        </label>
      </div>

      {/* ===== PDFs por PARTIDA ===== */}
      <div style={{ marginTop: 12 }}>
        <h3 style={{ margin: '12px 0 6px' }}>Por PARTIDA</h3>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || !!loadingKey}
            onClick={() =>
              run(`Partida_${toStr(partida)}_DisenoLaser.pdf`, async () => {
                return generatePdfDisenoLaserByPartida(toStr(partida));
              })
            }
          >
            {loadingKey ? '...' : 'PDF Diseño Laser'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || !!loadingKey}
            onClick={() =>
              run(`Partida_${toStr(partida)}_CortePlegado.pdf`, async () => {
                return generatePdfCortePlegadoByPartida(toStr(partida));
              })
            }
          >
            {loadingKey ? '...' : 'PDF Corte y Plegado'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || !!loadingKey}
            onClick={() =>
              run(`Partida_${toStr(partida)}_Tapajuntas.pdf`, async () => {
                return generatePdfTapajuntasByPartida(toStr(partida));
              })
            }
          >
            {loadingKey ? '...' : 'PDF Tapajuntas'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || !!loadingKey}
            onClick={() =>
              run(`Partida_${toStr(partida)}_ArmadoPrimario.pdf`, async () => {
                return generatePdfArmPrimarioByPartida(toStr(partida));
              })
            }
          >
            {loadingKey ? '...' : 'PDF Armado Primario (1 hoja por portón)'}
          </button>
        </div>
      </div>

      {/* ===== PDF por NV ===== */}
      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: '12px 0 6px' }}>Por NV (1 portón)</h3>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!canNv || !!loadingKey}
            onClick={() =>
              run(`NV_${toStr(nv)}_ArmadoPrimario.pdf`, async () => {
                return generatePdfArmPrimarioByNv(toStr(nv));
              })
            }
          >
            {loadingKey ? '...' : 'PDF Armado Primario'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error" style={{ marginTop: 8 }}>
          ⚠ {error}
        </div>
      )}

      <p className="hint" style={{ marginTop: 10 }}>
        Plantillas esperadas en <code>/public/</code>:
        <br />
        <code>pdf_modelo_diseno_laser.pdf</code>, <code>pdf_modelo_corte_plegado.pdf</code>,{' '}
        <code>pdf_modelo_tapajuntas.pdf</code>, <code>pdf_modelo_armPrimario.pdf</code>
      </p>
    </div>
  );
}
