// src/pages/PdfLinkView.jsx
import { useEffect, useMemo, useRef, useState } from 'react';

// ✅ tus generadores (siguen igual)
import { generatePdfDisenoLaserByPartida } from './pdfs/PdfDisenoLaser.jsx';
import { generatePdfCortePlegadoByPartida } from './pdfs/PdfCortePlegado.jsx';
import { generatePdfTapajuntasByPartida } from './pdfs/PdfTapajuntas.jsx';
import {
  generatePdfArmPrimarioByPartida,
  generatePdfArmPrimarioByNv,
} from './pdfs/PdfArmPrimario.jsx';

// ✅ PDF.js
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function getPdfTipoFromLocation() {
  const { pathname, search } = window.location;

  let tipoFromPath = '';
  const m = pathname.match(/^\/pdfs\/([^/]+)\/?$/i);
  if (m && m[1]) tipoFromPath = toStr(m[1]).toLowerCase();

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

  if (!tipo) return { active: false, tipo: '', partida: '', nv: '' };

  if (tipo === 'arm-primario') {
    const active = !!nv || !!partida;
    return { active, tipo, partida, nv };
  }

  return { active: !!partida, tipo, partida, nv };
}

export default function PdfLinkView() {
  const req = useMemo(() => getPdfRequestFromLocation(), []);

  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');

  const containerRef = useRef(null);
  const lastRenderIdRef = useRef(0);

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

  function clearContainer() {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';
  }

  async function renderPdfToCanvas(arrayBuffer) {
    const el = containerRef.current;
    if (!el) return;

    const myRenderId = ++lastRenderIdRef.current;
    setRendering(true);

    try {
      clearContainer();

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      // Render 1 canvas por página
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        // Cancelación “suave” si llega un nuevo render
        if (myRenderId !== lastRenderIdRef.current) return;

        const page = await pdf.getPage(pageNum);

        // viewport base
        const baseViewport = page.getViewport({ scale: 1 });

        // Ajuste al ancho del contenedor
        const containerWidth = el.clientWidth || window.innerWidth || 800;
        const scaleToFit = Math.max(0.5, Math.min(3, containerWidth / baseViewport.width));

        // Retina / Android: devicePixelRatio
        const dpr = window.devicePixelRatio || 1;

        const viewport = page.getViewport({ scale: scaleToFit });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Tamaño “real” (en pixeles)
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);

        // Tamaño “visual” (CSS)
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        canvas.style.display = 'block';
        canvas.style.margin = pageNum === 1 ? '12px auto 14px' : '0 auto 14px';
        canvas.style.border = '1px solid #ddd';
        canvas.style.borderRadius = '8px';
        canvas.style.background = '#fff';

        el.appendChild(canvas);

        const renderContext = {
          canvasContext: ctx,
          viewport: page.getViewport({ scale: scaleToFit * dpr }),
        };

        await page.render(renderContext).promise;
      }
    } finally {
      setRendering(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError('');
      setFilename('');

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

        if (spec.needs === 'partida' && !req.partida) {
          throw new Error(`Falta parámetro "partida" para "${req.tipo}".`);
        }
        if (spec.needs === 'nv_or_partida' && !req.nv && !req.partida) {
          throw new Error(`Falta parámetro "nv" (preferido) o "partida" para "${req.tipo}".`);
        }

        const name = spec.filename({ partida: req.partida, nv: req.nv });
        setFilename(name);

        // Generás el PDF como Blob (como ahora)
        const blob = await spec.gen({ partida: req.partida, nv: req.nv });
        if (!alive) return;

        const buf = await blob.arrayBuffer();
        if (!alive) return;

        // ✅ Render con PDF.js (sin iframe, sin blobUrl)
        await renderPdfToCanvas(buf);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
        clearContainer();
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
      // invalidar renders en curso
      lastRenderIdRef.current += 1;
      clearContainer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.active, req.partida, req.nv, req.tipo, spec]);

  async function download() {
    try {
      setError('');
      if (!spec) return;

      const blob = await spec.gen({ partida: req.partida, nv: req.nv });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'documento.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      setError(e?.message || String(e));
    }
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
          <button type="button" onClick={download} disabled={loading || rendering || !!error}>
            Descargar
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {(loading || rendering) && <div>Mostrando PDF…</div>}
        {error && <div style={{ color: 'crimson' }}>⚠ {error}</div>}

        {/* ✅ Contenedor de canvases */}
        <div ref={containerRef} style={{ width: '100%', minHeight: '60vh' }} />
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
