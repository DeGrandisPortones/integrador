// src/pages/ViewPdf.jsx
import { useMemo, useState } from 'react';

// Arm Primario (tu archivo real)
import {
  generatePdfArmPrimarioByNv,
  generatePdfArmPrimarioByPartida,
} from './pdfs/PdfArmPrimario.jsx';

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

  // Helper: carga módulo y busca función por nombre (named / default-object / default-fn)
  async function callGenerator(importer, fnName, ...args) {
    const mod = await importer();

    const candidate =
      mod?.[fnName] ??
      mod?.default?.[fnName] ??
      (fnName === 'default' ? mod?.default : null) ??
      mod?.default;

    if (typeof candidate !== 'function') {
      const keys = Object.keys(mod || {});
      const defKeys = mod?.default && typeof mod.default === 'object' ? Object.keys(mod.default) : [];
      throw new Error(
        `No se encontró la función "${fnName}". Exports disponibles: [${keys.join(', ')}] default: [${defKeys.join(', ')}]`
      );
    }

    return candidate(...args);
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
                // Ajustá el nombre de la función según tu módulo real
                return callGenerator(() => import('./pdfs/PdfDisenoLaser.jsx'), 'generatePdfDisenoLaser', toStr(partida));
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
                // Ajustá el nombre de la función según tu módulo real
                return callGenerator(() => import('./pdfs/PdfCortePlegado.jsx'), 'generatePdfCortePlegado', toStr(partida));
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
                // Ajustá el nombre de la función según tu módulo real
                return callGenerator(() => import('./pdfs/PdfTapajuntas.jsx'), 'generatePdfTapajuntas', toStr(partida));
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
        <code>pdf_modelo_diseño_laser.pdf</code>, <code>pdf_modelo_corte_plegado.pdf</code>,{' '}
        <code>pdf_modelo_tapajuntas.pdf</code>, <code>pdf_modelo_armPrimario.pdf</code>
      </p>
    </div>
  );
}
