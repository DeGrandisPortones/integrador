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

  const hasPartida = (qs.get('partida') || '').trim().length > 0;
  const hasNv = (qs.get('nv') || '').trim().length > 0;

  // Para arm-primario permitimos nv o partida
  if (tipo === 'arm-primario') {
    return (hasTipoByQuery || hasTipoByPath) && (hasNv || hasPartida);
  }

  // Para el resto: requiere partida
  return (hasTipoByQuery || hasTipoByPath) && hasPartida;
}
