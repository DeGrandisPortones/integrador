// src/pages/PdfLinkView.jsx
import { useEffect, useMemo, useRef, useState } from 'react';

import { generatePdfDisenoLaserByPartida } from './pdfs/PdfDisenoLaser.jsx';
import { generatePdfCortePlegadoByPartida } from './pdfs/PdfCortePlegado.jsx';
import { generatePdfTapajuntasByPartida } from './pdfs/PdfTapajuntas.jsx';
import { generatePdfArmPrimarioByPartida, generatePdfArmPrimarioByNv } from './pdfs/PdfArmPrimario.jsx';

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function getPdfTipoFromLocation() {
  const { pathname, search } = window.location;

  // 1) path: /pdfs/<tipo>
  let tipoFromPath = '';
  const m = pathname.match(/^\/pdfs\/([^/]+)\/?$/i);
  if (m && m[1]) tipoFromPath = toStr(m[1]).toLowerCase();

  // 2) query: ?pdf=<tipo>
  const qs = new URLSearchParams(search);
  const tipoFromQuery = toStr(qs.get('pdf')).toLowerCase();

  return tipoFromPath || tipoFromQuery;
}

function getPdfRequestFromLocation() {
  const { search } = window.location;
  const qs = new URLSearchParams(search);

  const tipo = getPdfTipoFromLocation();

  const partida = toStr(qs.get('partida'));
  const nv = toStr(qs.get('nv'));

  if (!tipo) {
    return { active: false, tipo: '', partida: '', nv: '' };
  }

  // Reglas de activación:
  // - Para arm-primario: aceptamos NV (preferido) o partida.
  // - Para el resto: requiere partida.
  if (tipo === 'arm-primario') {
    const active = !!nv || !!partida;
    return { active, tipo, partida, nv };
  }

  return { active: !!partida, tipo, partida, nv };
}

// ✅ Chrome/Android suele fallar renderizando PDFs desde blob: en iframe.
// Solución: en mobile/tablet abrimos el blob directamente (misma pestaña) para que use el visor nativo.
function isMobileOrTablet() {
  const ua = navigator.userAgent || '';
  // Android tablet + phones, iPad/iPhone
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;

  // iPadOS 13+ se reporta como Mac, pero con touch
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (isIpadOs) return true;

  return false;
}

export default function PdfLinkView() {
  const req = useMemo(() => getPdfRequestFromLocation(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const [filename, setFilename] = useState('');

  const openedRef = useRef(false);
  const mobile = useMemo(() => isMobileOrTablet(), []);

  const spec = useMemo(() => {
    // ✅ 4 PDFs soportados (MODO PÚBLICO: NO token)
    const map = {
      'diseno-laser': {
        label: 'PDF Diseño Láser',
        gen: ({ partida }) => generatePdfDisenoLaserByPartida(partida /* token = undefined */),
        filename: ({ partida }) => `Partida_${partida}_DisenoLaser.pdf`,
        needs: 'partida',
      },
      'corte-plegado': {
        label: 'PDF Corte y Plegado',
        gen: ({ partida }) => generatePdfCortePlegadoByPartida(partida /* token = undefined */),
        filename: ({ partida }) => `Partida_${partida}_CortePlegado.pdf`,
        needs: 'partida',
      },
      tapajuntas: {
        label: 'PDF Tapajuntas',
        gen: ({ partida }) => generatePdfTapajuntasByPartida(partida /* token = undefined */),
        filename: ({ partida }) => `Partida_${partida}_Tapajuntas.pdf`,
        needs: 'partida',
      },
      'arm-primario': {
        label: 'PDF Armado Primario',
        // ✅ preferimos NV si viene
        gen: ({ nv, partida }) => {
          if (nv) return generatePdfArmPrimarioByNv(nv /* token = undefined */);
          return generatePdfArmPrimarioByPartida(partida /* token = undefined */);
        },
        filename: ({ nv, partida }) => {
          if (nv) return `NV_${nv}_ArmadoPrimario.pdf`;
          return `Partida_${partida}_ArmadoPrimario.pdf`;
        },
        needs: 'nv_or_partida',
      },
    };

    return map[req.tipo] || null;
  }, [req.tipo]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError('');
      setFilename('');
      openedRef.current = false;

      // Limpieza del anterior
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl('');
      }

      try {
        if (!req.active) {
          throw new Error(
            'Faltan parámetros. Ejemplos:\n' +
              '- /?pdf=diseno-laser&partida=507\n' +
              '- /?pdf=corte-plegado&partida=507\n' +
              '- /?pdf=tapajuntas&partida=507\n' +
              '- /?pdf=arm-primario&nv=4003'
          );
        }

        if (!spec) {
          throw new Error(
            `Tipo de PDF no soportado: "${req.tipo}". Soportados: diseno-laser, corte-plegado, tapajuntas, arm-primario.`
          );
        }

        // Validación de parámetros requeridos
        if (spec.needs === 'partida' && !req.partida) {
          throw new Error(`Falta parámetro "partida" para "${req.tipo}".`);
        }
        if (spec.needs === 'nv_or_partida' && !req.nv && !req.partida) {
          throw new Error(`Falta parámetro "nv" (preferido) o "partida" para "${req.tipo}".`);
        }

        // 🔓 Público: NO token
        const blob = await spec.gen({ partida: req.partida, nv: req.nv });
        if (!alive) return;

        const url = URL.createObjectURL(blob);
        const name = spec.filename({ partida: req.partida, nv: req.nv });

        setBlobUrl(url);
        setFilename(name);

        // ✅ En mobile/tablet: abrir directo para usar visor nativo (evita iframe con "Abrir")
        if (mobile && !openedRef.current) {
          openedRef.current = true;
          window.location.replace(url);
          return;
        }
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.active, req.partida, req.nv, req.tipo, spec, mobile]);

  function download() {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'documento.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{spec?.label || 'PDF'}</h2>

        <div style={{ opacity: 0.8 }}>
          {req.tipo === 'arm-primario' ? (
            <>
              NV: <strong>{req.nv || '-'}</strong>
              <span style={{ marginLeft: 12 }}>
                Partida: <strong>{req.partida || '-'}</strong>
              </span>
            </>
          ) : (
            <>
              Partida: <strong>{req.partida || '-'}</strong>
            </>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" onClick={download} disabled={!blobUrl || loading}>
            Descargar
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {loading && <div>Generando PDF…</div>}
        {error && <div style={{ color: 'crimson' }}>⚠ {error}</div>}

        {/* ✅ Solo desktop: iframe. En mobile/tablet redirigimos al visor nativo */}
        {!loading && !error && blobUrl && !mobile && (
          <iframe
            title="PDF"
            src={blobUrl}
            style={{
              width: '100%',
              height: '82vh',
              border: '1px solid #ddd',
              borderRadius: 8,
              marginTop: 10,
            }}
          />
        )}

        {!loading && !error && blobUrl && mobile && (
          <div style={{ opacity: 0.8 }}>
            Abriendo PDF en el visor del dispositivo…
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
        <div>Ejemplos:</div>
        <div>
          <code>/?pdf=diseno-laser&amp;partida=507</code>
        </div>
        <div>
          <code>/?pdf=corte-plegado&amp;partida=507</code>
        </div>
        <div>
          <code>/?pdf=tapajuntas&amp;partida=507</code>
        </div>
        <div>
          <code>/?pdf=arm-primario&amp;nv=4003</code> (preferido)
        </div>
      </div>
    </div>
  );
}
