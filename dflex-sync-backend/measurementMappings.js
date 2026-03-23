const SOURCE_APP = 'presupuestador';

const MEASUREMENT_SOURCE_CATALOG = [
  {
    section_key: 'datos_generales',
    section_label: 'Datos generales',
    fields: [
      { path: 'fecha', label: 'Fecha' },
      { path: 'distribuidor', label: 'Distribuidor' },
      { path: 'nro_porton', label: 'N° de portón / Nota de venta' },
      { path: 'en_acopio', label: 'Portón en acopio' },
    ],
  },
  {
    section_key: 'parantes_laterales',
    section_label: 'Parantes / Laterales',
    fields: [
      { path: 'parantes.cant', label: 'Parantes (cantidad)' },
      { path: 'lado_puerta', label: 'Lado de la puerta' },
      { path: 'lado_motor', label: 'Lado de motor o soporte' },
      { path: 'toma_corriente', label: 'Toma corriente' },
    ],
  },
  {
    section_key: 'esquema_medidas',
    section_label: 'Esquema (medidas)',
    fields: [
      { path: 'esquema.alto', label: 'Altos (array x3)' },
      { path: 'esquema.ancho', label: 'Anchos (array x3)' },
      { path: 'alto_final_mm', label: 'Alto final (mm)' },
      { path: 'ancho_final_mm', label: 'Ancho final (mm)' },
    ],
  },
  {
    section_key: 'instalacion_sistema',
    section_label: 'Instalación / Sistema',
    fields: [
      { path: 'colocacion', label: 'Tipo de colocación' },
      { path: 'accionamiento', label: 'Tipo de accionamiento' },
      { path: 'levadizo', label: 'Sistema levadizo' },
      { path: 'estructura_metalica', label: 'Estructura metálica para puerta' },
      { path: 'rebaje_lateral_mm', label: 'Rebaje lateral (mm)' },
      { path: 'rebaje_inferior_mm', label: 'Rebaje inferior (mm)' },
      { path: 'anclaje', label: 'Anclaje de fijación' },
      { path: 'color_sistema', label: 'Color de sistema' },
    ],
  },
  {
    section_key: 'revestimiento',
    section_label: 'Revestimiento',
    fields: [
      { path: 'tipo_revestimiento', label: 'Tipo de revestimiento' },
      { path: 'varillado_medida', label: 'Medida varillado' },
      { path: 'orientacion_revestimiento', label: 'Orientación del revestimiento' },
      { path: 'revestimiento', label: 'Revestimiento' },
      { path: 'color_revestimiento', label: 'Color de revestimiento' },
      { path: 'color_revestimiento_otro', label: 'Color de revestimiento (otro)' },
      { path: 'lucera', label: 'Lucera con vidrios' },
      { path: 'lucera_cantidad', label: 'Cantidad lucera' },
      { path: 'peso_revestimiento', label: 'Peso del revestimiento' },
    ],
  },
  {
    section_key: 'servicios_contacto',
    section_label: 'Servicios / Contacto',
    fields: [
      { path: 'traslado', label: 'Servicio de traslado' },
      { path: 'relevamiento', label: 'Servicio de relevamiento de medidas' },
      { path: 'contacto_obra_nombre', label: 'Nombre contacto en obra' },
      { path: 'contacto_obra_tel', label: 'Teléfono contacto en obra' },
    ],
  },
  {
    section_key: 'observaciones',
    section_label: 'Observaciones',
    fields: [
      { path: 'observaciones', label: 'Observaciones' },
    ],
  },
];

function getByPath(obj, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toNumericArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toNumber(item))
    .filter((n) => n !== null);
}

function applyResolver(value, resolver) {
  const mode = String(resolver || 'identity').trim().toLowerCase();

  if (mode === 'identity') return value;
  if (mode === 'first_non_empty') {
    if (!Array.isArray(value)) return value;
    for (const item of value) {
      if (item !== null && item !== undefined && String(item).trim() !== '') return item;
    }
    return null;
  }
  if (mode === 'join_csv') {
    if (!Array.isArray(value)) return value;
    return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== '').join(', ');
  }

  const numeric = toNumericArray(value);
  if (!numeric.length) return null;

  if (mode === 'min') return Math.min(...numeric);
  if (mode === 'max') return Math.max(...numeric);
  if (mode === 'sum') return numeric.reduce((acc, item) => acc + item, 0);

  return value;
}

async function ensureMeasurementMappingsTable(pool) {
  if (!pool) throw new Error('SUPABASE_DB_URL no está configurado');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS preproduccion_property_mappings (
      id bigserial PRIMARY KEY,
      target_property text NOT NULL UNIQUE,
      source_app text NOT NULL DEFAULT 'presupuestador',
      source_section text,
      source_path text,
      resolver text NOT NULL DEFAULT 'identity',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function listMeasurementPropertyMappings(pool) {
  await ensureMeasurementMappingsTable(pool);

  const { rows } = await pool.query(`
    SELECT
      id,
      target_property,
      source_app,
      source_section,
      source_path,
      resolver,
      is_active,
      created_at,
      updated_at
    FROM preproduccion_property_mappings
    ORDER BY target_property
  `);

  return rows || [];
}

async function upsertMeasurementPropertyMapping(pool, payload) {
  await ensureMeasurementMappingsTable(pool);

  const targetProperty = String(payload?.target_property || '').trim();
  if (!targetProperty) throw new Error('Falta target_property');

  const sourceSection = payload?.source_section ? String(payload.source_section).trim() : null;
  const sourcePath = payload?.source_path ? String(payload.source_path).trim() : null;
  const resolver = String(payload?.resolver || 'identity').trim() || 'identity';
  const sourceApp = String(payload?.source_app || SOURCE_APP).trim() || SOURCE_APP;
  const isActive = payload?.is_active !== false;

  const { rows } = await pool.query(
    `
      INSERT INTO preproduccion_property_mappings (
        target_property,
        source_app,
        source_section,
        source_path,
        resolver,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (target_property)
      DO UPDATE SET
        source_app = EXCLUDED.source_app,
        source_section = EXCLUDED.source_section,
        source_path = EXCLUDED.source_path,
        resolver = EXCLUDED.resolver,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING
        id,
        target_property,
        source_app,
        source_section,
        source_path,
        resolver,
        is_active,
        created_at,
        updated_at
    `,
    [targetProperty, sourceApp, sourceSection, sourcePath, resolver, isActive]
  );

  return rows?.[0] || null;
}

function listMeasurementSourceCatalog() {
  return MEASUREMENT_SOURCE_CATALOG;
}

function computeMeasurementMappedValues(measurementForm, mappings) {
  const out = {};
  const safeForm = measurementForm && typeof measurementForm === 'object' ? measurementForm : null;
  if (!safeForm) return out;

  for (const mapping of Array.isArray(mappings) ? mappings : []) {
    if (!mapping?.is_active) continue;
    const targetProperty = String(mapping?.target_property || '').trim();
    const sourcePath = String(mapping?.source_path || '').trim();
    if (!targetProperty || !sourcePath) continue;

    const raw = getByPath(safeForm, sourcePath);
    const resolved = applyResolver(raw, mapping?.resolver);

    if (resolved === undefined || resolved === null || resolved === '') continue;
    out[targetProperty] = resolved;
  }

  return out;
}

module.exports = {
  SOURCE_APP,
  MEASUREMENT_SOURCE_CATALOG,
  ensureMeasurementMappingsTable,
  listMeasurementSourceCatalog,
  listMeasurementPropertyMappings,
  upsertMeasurementPropertyMapping,
  computeMeasurementMappedValues,
  applyResolver,
  getByPath,
};
