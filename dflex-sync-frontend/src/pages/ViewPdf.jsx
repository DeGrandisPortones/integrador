// src/pages/ViewPdf.jsx
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

// Arm Primario
import {
  generatePdfArmPrimarioByNv,
  generatePdfArmPrimarioByPartida,
} from './pdfs/PdfArmPrimario.jsx';

// Imports estáticos
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

  const { session } = useAuth();
  const accessToken = session?.access_token || null;

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

  async function run(filename, fnWithToken) {
    setLoadingKey(filename);
    setError('');
    try {
      if (!accessToken) throw new Error('No hay sesión activa (token vacío).');

      const blob = await fnWithToken(accessToken);
      await downloadBlob(blob, filename);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setLoadingKey('');
    }
  }

  const anyLoading = !!loadingKey;

  return (
    <div className="import-panel">
      <h2>Generar PDFs</h2>

      {!accessToken && (
        <div className="error" style={{ marginTop: 8 }}>
          ⚠ No hay sesión activa. Iniciá sesión para generar PDFs privados.
        </div>
      )}

      <div className="field-row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
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

      <div style={{ marginTop: 12 }}>
        <h3 style={{ margin: '12px 0 6px' }}>Por PARTIDA</h3>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || anyLoading || !accessToken}
            onClick={() =>
              run(`Partida_${toStr(partida)}_DisenoLaser.pdf`, async (token) => {
                return generatePdfDisenoLaserByPartida(toStr(partida), token);
              })
            }
          >
            {anyLoading ? '...' : 'PDF Diseño Laser'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || anyLoading || !accessToken}
            onClick={() =>
              run(`Partida_${toStr(partida)}_CortePlegado.pdf`, async (token) => {
                return generatePdfCortePlegadoByPartida(toStr(partida), token);
              })
            }
          >
            {anyLoading ? '...' : 'PDF Corte y Plegado'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || anyLoading || !accessToken}
            onClick={() =>
              run(`Partida_${toStr(partida)}_Tapajuntas.pdf`, async (token) => {
                return generatePdfTapajuntasByPartida(toStr(partida), token);
              })
            }
          >
            {anyLoading ? '...' : 'PDF Tapajuntas'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canPartida || anyLoading || !accessToken}
            onClick={() =>
              run(`Partida_${toStr(partida)}_ArmadoPrimario.pdf`, async (token) => {
                return generatePdfArmPrimarioByPartida(toStr(partida), token);
              })
            }
          >
            {anyLoading ? '...' : 'PDF Armado Primario (1 hoja por portón)'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: '12px 0 6px' }}>Por NV (1 portón)</h3>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!canNv || anyLoading || !accessToken}
            onClick={() =>
              run(`NV_${toStr(nv)}_ArmadoPrimario.pdf`, async (token) => {
                return generatePdfArmPrimarioByNv(toStr(nv), token);
              })
            }
          >
            {anyLoading ? '...' : 'PDF Armado Primario'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error" style={{ marginTop: 8 }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
