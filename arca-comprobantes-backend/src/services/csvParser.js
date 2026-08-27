// Parser del CSV "Mis Comprobantes Recibidos" de ARCA. Estructura confirmada el
// 2026-08-27 contra una muestra real (30 columnas, separador ";", decimal con coma,
// sin separador de miles, fecha ISO yyyy-mm-dd, "Tipo de Comprobante" = código
// numérico de ARCA/AFIP que coincide directo con l10n_latam.document.type.code en Odoo).
const { parse } = require('csv-parse/sync');

function parseNumeroArg(value) {
  if (value === undefined || value === null || value === '') return 0;
  const normalizado = String(value).trim().replace(/\./g, '').replace(',', '.');
  const num = Number(normalizado);
  return Number.isNaN(num) ? 0 : num;
}

function parseFechaArg(value) {
  const v = String(value || '').trim();
  // Formato real observado: yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // Por las dudas, soportar también dd/mm/yyyy si algún export viene así.
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

// Normaliza un nombre de columna para hacer el match tolerante a acentos/mayúsculas/
// espacios (y a corrupciones de encoding en tránsito): saca diacríticos, pasa a
// minúscula y deja solo [a-z0-9%].
function normalizeHeader(h) {
  return String(h || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca diacríticos (acentos) tras la normalización NFD
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, '');
}

// Claves normalizadas -> nombre de campo interno.
const HEADER_MAP = {
  fechadeemision: 'fechaEmision',
  tipodecomprobante: 'tipoComprobanteCodigo',
  puntodeventa: 'puntoVenta',
  numerodesde: 'numero',
  numerohasta: 'numeroHasta',
  codautorizacion: 'cae',
  tipodocemisor: 'tipoDocEmisor',
  nrodocemisor: 'cuit',
  denominacionemisor: 'denominacionEmisor',
  tipodocreceptor: 'tipoDocReceptor',
  nrodocreceptor: 'cuitReceptor',
  tipocambio: 'tipoCambio',
  moneda: 'moneda',
  'impnetogravadoiva0%': 'netoIva0',
  'iva25%': 'ivaMonto25',
  'impnetogravadoiva25%': 'netoIva25',
  'iva5%': 'ivaMonto5',
  'impnetogravadoiva5%': 'netoIva5',
  'iva105%': 'ivaMonto105',
  'impnetogravadoiva105%': 'netoIva105',
  'iva21%': 'ivaMonto21',
  'impnetogravadoiva21%': 'netoIva21',
  'iva27%': 'ivaMonto27',
  'impnetogravadoiva27%': 'netoIva27',
  impnetogravadototal: 'impNetoGravadoTotal',
  impnetonogravado: 'impNetoNoGravado',
  impopexentas: 'impExento',
  otrostributos: 'otrosTributos',
  totaliva: 'totalIva',
  imptotal: 'impTotal',
};

const CAMPOS_OBLIGATORIOS = ['fechaEmision', 'tipoComprobanteCodigo', 'puntoVenta', 'cuit', 'impTotal'];

function parseBuffer(buffer, encoding) {
  const text = buffer.toString(encoding);
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    delimiter: ';',
    trim: true,
    relax_column_count: true,
  });
  return records;
}

function mapRecord(record) {
  const out = {};
  for (const [rawKey, value] of Object.entries(record)) {
    const norm = normalizeHeader(rawKey);
    const campo = HEADER_MAP[norm];
    if (campo) out[campo] = value;
  }
  return out;
}

const NUMERIC_FIELDS = [
  'netoIva0', 'ivaMonto25', 'netoIva25', 'ivaMonto5', 'netoIva5',
  'ivaMonto105', 'netoIva105', 'ivaMonto21', 'netoIva21', 'ivaMonto27', 'netoIva27',
  'impNetoGravadoTotal', 'impNetoNoGravado', 'impExento', 'otrosTributos', 'totalIva', 'impTotal',
];

function normalizeRow(mapped, index) {
  const row = { _fila: index + 1 };
  for (const [campo, value] of Object.entries(mapped)) {
    row[campo] = NUMERIC_FIELDS.includes(campo) ? parseNumeroArg(value) : value;
  }
  row.fechaEmision = parseFechaArg(mapped.fechaEmision);
  row.cuit = String(mapped.cuit || '').replace(/\D/g, '');
  row.cuitReceptor = String(mapped.cuitReceptor || '').replace(/\D/g, '');
  row.tipoComprobanteCodigo = String(mapped.tipoComprobanteCodigo || '').trim();
  row.puntoVenta = String(mapped.puntoVenta || '').trim();
  row.numero = String(mapped.numero || '').trim();
  return row;
}

/**
 * @param {Buffer} fileBuffer
 * @returns {{ filas: Array<object>, cuitReceptorDetectado: string|null }}
 */
function parseComprobantesRecibidosCsv(fileBuffer) {
  let records = parseBuffer(fileBuffer, 'utf8');
  let mapped = records.map(mapRecord);

  const okUtf8 = mapped.some((m) => CAMPOS_OBLIGATORIOS.every((c) => m[c] !== undefined));
  if (!okUtf8) {
    // Posible archivo en Latin1/CP1252 en vez de UTF-8 — reintentamos.
    records = parseBuffer(fileBuffer, 'latin1');
    mapped = records.map(mapRecord);
  }

  const faltantes = CAMPOS_OBLIGATORIOS.filter((c) => !mapped.some((m) => m[c] !== undefined));
  if (faltantes.length > 0) {
    throw new Error(
      `No se pudieron reconocer las columnas del CSV (esperaba, entre otras: ${faltantes.join(', ')}). ` +
      `¿Es un export de "Mis Comprobantes Recibidos" de ARCA?`
    );
  }

  const filas = mapped.map(normalizeRow);
  const cuitReceptorDetectado = filas.find((f) => f.cuitReceptor)?.cuitReceptor || null;

  return { filas, cuitReceptorDetectado };
}

module.exports = { parseComprobantesRecibidosCsv, parseNumeroArg, parseFechaArg, normalizeHeader };
