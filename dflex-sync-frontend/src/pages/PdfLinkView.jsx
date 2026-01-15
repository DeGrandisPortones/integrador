// src/pages/PdfLinkView.jsx
import { useEffect, useMemo, useRef, useState } from 'react';

// ✅ generadores
import { generatePdfDisenoLaserByFechaProduccion } from './pdfs/PdfDisenoLaser.jsx';
import { generatePdfCortePlegadoByFechaProduccion } from './pdfs/PdfCortePlegado.jsx';
import { generatePdfTapajuntasByFechaProduccion } from './pdfs/PdfTapajuntas.jsx';
import { generatePdfArmPrimarioByNv } from './pdfs/PdfArmPrimario.jsx';

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
  const nv = toStr(qs.get('nv'));

  // NUEVO: fecha para diseno-laser
  const fecha = toStr(qs.get('inicio_prod_imput')) || toStr(qs.get('fecha')) || toStr(qs.get('fecha_envio_produccion'));

  if (!tipo) return { active: false, tipo: '', nv: '', fecha: '' };

  if (tipo === 'arm-primario') {
    const active = !!nv;
    return { active, tipo, nv, fecha };
  }

  if (tipo === 'diseno-laser' || tipo === 'corte-plegado' || tipo === 'tapajuntas') {
    return { active: !!fecha, tipo, nv, fecha };
  }

  return { active: false, tipo, nv, fecha };
}

export default function PdfLinkView() {
  const req = useMemo(() => getPdfRequestFromLocation(), []);

  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  const containerRef = useRef(null);
  const lastRenderIdRef = useRef(0);

  const spec = useMemo(() => {
    const map = {
      'diseno-laser': {
        gen: ({ fecha }) => generatePdfDisenoLaserByFechaProduccion(fecha),
        needs: 'fecha',
      },
      'corte-plegado': {
        gen: ({ fecha }) => generatePdfCortePlegadoByFechaProduccion(fecha),
        needs: 'fecha',
      },
      tapajuntas: {
        gen: ({ fecha }) => generatePdfTapajuntasByFechaProduccion(fecha),
        needs: 'fecha',
      },
      'arm-primario': {
        gen: ({ nv }) => generatePdfArmPrimarioByNv(nv),
        needs: 'nv',
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

    const QUALITY_BOOST_PORTRAIT_TABLET = 2.0;
    const QUALITY_BOOST_DEFAULT = 1.4;
    const MAX_SCALE_TO_FIT = 4.0;
    const MAX_CANVAS_PIXELS = 20_000_000;

    try {
      clearContainer();

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      const portraitTablet = isPortraitTablet();
      const qualityBoost = portraitTablet ? QUALITY_BOOST_PORTRAIT_TABLET : QUALITY_BOOST_DEFAULT;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        if (myRenderId !== lastRenderIdRef.current) return;

        const page = await pdf.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });

        const containerWidth =
          el.clientWidth ||
          document.documentElement.clientWidth ||
          window.innerWidth ||
          800;

        const scaleToFitRaw = containerWidth / baseViewport.width;
        const scaleToFit = clamp(scaleToFitRaw, 0.5, MAX_SCALE_TO_FIT);

        const dprReported = window.devicePixelRatio || 1;
        const dpr = clamp(dprReported, 1, 3);

        const cssViewport = page.getViewport({ scale: scaleToFit });

        let renderScale = scaleToFit * dpr * qualityBoost;
        let renderViewport = page.getViewport({ scale: renderScale });

        let targetW = Math.floor(renderViewport.width);
        let targetH = Math.floor(renderViewport.height);
        const pixels = targetW * targetH;

        if (pixels > MAX_CANVAS_PIXELS) {
          const factor = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
          renderScale *= factor;
          renderViewport = page.getViewport({ scale: renderScale });
          targetW = Math.floor(renderViewport.width);
          targetH = Math.floor(renderViewport.height);
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = targetW;
        canvas.height = targetH;

        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.background = '#fff';

        el.appendChild(canvas);

        await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
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

      try {
        if (!req.active) {
          throw new Error('Faltan parámetros para generar el PDF.');
        }

        if (!spec) {
          throw new Error('Tipo de PDF no soportado.');
        }
        if (spec.needs === 'fecha' && !req.fecha) {
          throw new Error('Falta parámetro "fecha" (inicio_prod_imput, YYYY-MM-DD).');
        }
        if (spec.needs === 'nv' && !req.nv) {
          throw new Error('Falta parámetro "nv".');
        }

        const blob = await spec.gen({ nv: req.nv, fecha: req.fecha });
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
  }, [req.active, req.nv, req.fecha, req.tipo, spec]);

  if (error) {
    return (
      <div style={{ padding: 16, color: 'crimson' }}>
        ⚠ {error}
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', minHeight: '100vh', background: '#fff' }}>
      {(loading || rendering) && (
        <div style={{ padding: 12, opacity: 0.7 }}>
          Mostrando PDF…
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', minHeight: '100vh' }} />
    </div>
  );
}