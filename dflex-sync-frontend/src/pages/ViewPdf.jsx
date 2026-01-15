// src/pages/ViewPdf.jsx
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

// Arm Primario
import { generatePdfArmPrimarioByNv } from './pdfs/PdfArmPrimario.jsx';

// Diseño / CortePlegado / Tapajuntas (día)
import { generatePdfDisenoLaserByFechaProduccion } from './pdfs/PdfDisenoLaser.jsx';
import { generatePdfCortePlegadoByFechaProduccion } from './pdfs/PdfCortePlegado.jsx';
import { generatePdfTapajuntasByFechaProduccion } from './pdfs/PdfTapajuntas.jsx';

// ✅ NUEVO: rango
import { generatePdfDisenoLaserByRangoProduccion } from './pdfs/PdfDisenoLaser.jsx';
import { generatePdfCortePlegadoByRangoProduccion } from './pdfs/PdfCortePlegado.jsx';
import { generatePdfTapajuntasByRangoProduccion } from './pdfs/PdfTapajuntas.jsx';

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
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

export default function ViewPdf() {
  const [nv, setNv] = useState('');

  // día único
  const [fechaProd, setFechaProd] = useState('');

  // ✅ rango
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [loadingKey, setLoadingKey] = useState('');
  const [error, setError] = useState('');

  const canNv = useMemo(() => toStr(nv).length > 0, [nv]);

  const fDia = useMemo(() => normalizeYYYYMMDD(fechaProd), [fechaProd]);
  const canFechaProd = useMemo(() => fDia.length > 0, [fDia]);

  const fDesde = useMemo(() => normalizeYYYYMMDD(fechaDesde), [fechaDesde]);
  const fHasta = useMemo(() => normalizeYYYYMMDD(fechaHasta), [fechaHasta]);

  const canRango = useMemo(() => {
    if (!fDesde || !fHasta) return false;
    return new Date(`${fDesde}T00:00:00Z`).getTime() <= new Date(`${fHasta}T00:00:00Z`).getTime();
  }, [fDesde, fHasta]);

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
          NV (portón):&nbsp;
          <input type="text" value={nv} onChange={(e) => setNv(e.target.value)} placeholder="Ej: 4003" />
        </label>

        <label>
          FECHA (inicio_prod_imput, YYYY-MM-DD):&nbsp;
          <input
            type="text"
            value={fechaProd}
            onChange={(e) => setFechaProd(e.target.value)}
            placeholder="Ej: 2026-01-13"
          />
        </label>
      </div>

      {/* ✅ rango */}
      <div className="field-row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        <label>
          DESDE (inicio_prod_imput):&nbsp;
          <input
            type="text"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            placeholder="Ej: 2026-01-14"
          />
        </label>

        <label>
          HASTA (inicio_prod_imput):&nbsp;
          <input
            type="text"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            placeholder="Ej: 2026-01-15"
          />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3 style={{ margin: '12px 0 6px' }}>Diseño / Corte-Plegado / Tapajuntas</h3>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* POR DÍA */}
          <button
            type="button"
            className="btn-secondary"
            disabled={!canFechaProd || anyLoading || !accessToken}
            onClick={() => {
              run(`Fecha_${fDia}_DisenoLaser.pdf`, async (token) => generatePdfDisenoLaserByFechaProduccion(fDia, token));
            }}
          >
            {anyLoading ? '...' : 'PDF Diseño Laser (día)'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canFechaProd || anyLoading || !accessToken}
            onClick={() => {
              run(`Fecha_${fDia}_CortePlegado.pdf`, async (token) =>
                generatePdfCortePlegadoByFechaProduccion(fDia, token)
              );
            }}
          >
            {anyLoading ? '...' : 'PDF Corte y Plegado (día)'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canFechaProd || anyLoading || !accessToken}
            onClick={() => {
              run(`Fecha_${fDia}_Tapajuntas.pdf`, async (token) => generatePdfTapajuntasByFechaProduccion(fDia, token));
            }}
          >
            {anyLoading ? '...' : 'PDF Tapajuntas (día)'}
          </button>
        </div>

        {/* ✅ POR RANGO (UNA MISMA LISTA, SIN SEPARAR POR FECHA) */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!canRango || anyLoading || !accessToken}
            onClick={() => {
              run(`Rango_${fDesde}_a_${fHasta}_DisenoLaser.pdf`, async (token) =>
                generatePdfDisenoLaserByRangoProduccion(fDesde, fHasta, token)
              );
            }}
          >
            {anyLoading ? '...' : 'PDF Diseño Laser (rango)'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canRango || anyLoading || !accessToken}
            onClick={() => {
              run(`Rango_${fDesde}_a_${fHasta}_CortePlegado.pdf`, async (token) =>
                generatePdfCortePlegadoByRangoProduccion(fDesde, fHasta, token)
              );
            }}
          >
            {anyLoading ? '...' : 'PDF Corte y Plegado (rango)'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!canRango || anyLoading || !accessToken}
            onClick={() => {
              run(`Rango_${fDesde}_a_${fHasta}_Tapajuntas.pdf`, async (token) =>
                generatePdfTapajuntasByRangoProduccion(fDesde, fHasta, token)
              );
            }}
          >
            {anyLoading ? '...' : 'PDF Tapajuntas (rango)'}
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
              run(`NV_${toStr(nv)}_ArmadoPrimario.pdf`, async (token) => generatePdfArmPrimarioByNv(toStr(nv), token))
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
