// src/pages/PdfLinkView.jsx
import { useEffect, useMemo, useRef, useState } from 'react';

// ✅ tus generadores (siguen igual)
import { generatePdfDisenoLaserByPartida } from './pdfs/PdfDisenoLaser.jsx';
import { generatePdfCortePlegadoByPartida } from './pdfs/PdfCortePlegado.jsx';
import { generatePdfTapajuntasByPartida } from './pdfs/PdfTapajuntas.jsx';
import { generatePdfArmPrimarioByPartida, generatePdfArmPrimarioByNv } from './pdfs/PdfArmPrimario.jsx';

// ✅ PDF.js
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function isPortraitTablet() {
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  if (!w || !h) return false;

  const portrait = h >= w;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);

  // Heurística razonable: tablet típica en px CSS
  const tabletLike = shortSide >= 600 && longSide <= 1600;

  return portrait && tabletLike;
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
    const map = {
      'diseno-laser': {
        label: 'PDF Diseño Láser',
        gen: ({ partida }) => generatePdfDisenoLaserByPartida(partida),
        filename: ({ partida }) => `Partida_${partida}_DisenoLaser.pdf`,
        needs: 'partida',
      },
      'corte-plegado': {
        label: 'PDF Corte y Plegado',
        gen: ({ partida }) => generatePdfCortePlegadoByPartida(partida),
        filename: ({ partida }) => `Partida_${partida}_CortePlegado.pdf`,
        needs: 'partida',
      },
      tapajuntas: {
        label: 'PDF Tapajuntas',
        gen: ({ partida }) => generatePdfTapajuntasByPartida(partida),
        filename: ({ partida }) => `Partida_${partida}_Tapajuntas.pdf`,
        needs: 'partida',
      },
      'arm-primario': {
        label: 'PDF Armado Primario',
        gen: ({ nv, partida }) => {
          if (nv) return generatePdfArmPrimarioByNv(nv);
          return generatePdfArmPrimarioByPartida(partida);
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

    // ========= Ajustes de calidad =========
    // Subí/bajá estos números si querés más/menos “definición”
    const QUALITY_BOOST_PORTRAIT_TABLET = 2.0; // tablets vertical
    const QUALITY_BOOST_DEFAULT = 1.4; // desktop / mobile
    const MAX_SCALE_TO_FIT = 4.0; // antes 3
    const MAX_CANVAS_PIXELS = 20_000_000; // cap de memoria por canvas (20MP)

    try {
      clearContainer();

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      const portraitTablet = isPortraitTablet();
      const qualityBoost = portraitTablet ? QUALITY_BOOST_PORTRAIT_TABLET : QUALITY_BOOST_DEFAULT;

      // Render 1 canvas por página
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        if (myRenderId !== lastRenderIdRef.current) return;

        const page = await pdf.getPage(pageNum);

        // viewport base
        const baseViewport = page.getViewport({ scale: 1 });

        // Ajuste al ancho del contenedor
        const containerWidth =
          el.clientWidth ||
          document.documentElement.clientWidth ||
          window.innerWidth ||
          800;

        const scaleToFitRaw = containerWidth / baseViewport.width;
        const scaleToFit = clamp(scaleToFitRaw, 0.5, MAX_SCALE_TO_FIT);

        // DPR reportado por el navegador (a veces da 1 en tablets)
        const dprReported = window.devicePixelRatio || 1;
        const dpr = clamp(dprReported, 1, 3); // cap para no matar memoria

        // Vista “visual” (CSS) al ancho
        const cssViewport = page.getViewport({ scale: scaleToFit });

        // Escala real interna (más píxeles)
        let renderScale = scaleToFit * dpr * qualityBoost;
        let renderViewport = page.getViewport({ scale: renderScale });

        // Cap de pixeles (por si queda gigante)
        let targetW = Math.floor(renderViewport.width);
        let targetH = Math.floor(renderViewport.height);
        const pixels = targetW * targetH;

        if (pixels > MAX_CANVAS_PIXELS) {
          const factor = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
          renderScale = renderScale * factor;
          renderViewport = page.getViewport({ scale: renderScale });
          targetW = Math.floor(renderViewport.width);
          targetH = Math.floor(renderViewport.height);
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Tamaño real (en pixeles)
        canvas.width = targetW;
        canvas.height = targetH;

        // Tamaño visual (CSS)
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        canvas.style.display = 'block';
        canvas.style.margin = pageNum === 1 ? '12px auto 14px' : '0 auto 14px';
        canvas.style.border = '1px solid #ddd';
        canvas.style.borderRadius = '8px';
        canvas.style.background = '#fff';

        el.appendChild(canvas);

        // Render
        const renderContext = {
          canvasContext: ctx,
          viewport: renderViewport,
          // opcional (según versión): intent: 'display',
          // opcional: enableWebGL: true,
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

        const blob = await spec.gen({ partida: req.partida, nv: req.nv });
        if (!alive) return;

        const buf = await blob.arrayBuffer();
        if (!alive) return;

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
