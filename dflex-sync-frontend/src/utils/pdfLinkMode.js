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

// Detecta si el usuario vino por link "directo" para generar/mostrar PDF
export function isPdfLinkMode() {
  const { pathname, search } = window.location;
  const qs = new URLSearchParams(search);

  const tipo = getPdfTipoFromLocation();

  const hasTipoByQuery = (qs.get('pdf') || '').trim().length > 0;
  const hasTipoByPath = /^\/pdfs\/[^/]+\/?$/i.test(pathname);

  const hasNv = (qs.get('nv') || '').trim().length > 0;

  // NUEVO: fecha para diseno-laser
  const hasFecha =
    (qs.get('inicio_prod_imput') || '').trim().length > 0 ||
    (qs.get('fecha') || '').trim().length > 0 ||
    (qs.get('fecha_envio_produccion') || '').trim().length > 0;

  // Para arm-primario permitimos nv
  if (tipo === 'arm-primario') {
    return (hasTipoByQuery || hasTipoByPath) && (hasNv);
  }

  // Para diseno-laser / corte-plegado / tapajuntas: requiere fecha
  if (tipo === 'diseno-laser' || tipo === 'corte-plegado' || tipo === 'tapajuntas') {
    return (hasTipoByQuery || hasTipoByPath) && hasFecha;
  }

  // Para el resto: requiere fecha
  return (hasTipoByQuery || hasTipoByPath) && hasFecha;
}