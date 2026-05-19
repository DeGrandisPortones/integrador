// src/pages/FormulasPage.jsx
import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const HIDE_MEASUREMENT_MAPPINGS_PANEL = true;
const PRODUCTION_SOURCE_SECTION = 'nota_venta';

const RESOLVER_OPTIONS = [
  { value: 'identity', label: 'Directo' },
  { value: 'min', label: 'Mínimo' },
  { value: 'max', label: 'Máximo' },
  { value: 'sum', label: 'Suma' },
  { value: 'first_non_empty', label: 'Primer valor no vacío' },
  { value: 'join_csv', label: 'Unir CSV' },
];

const PRODUCTION_SOURCE_PROPERTIES = [
  { source_key: 'nv', label: 'NV', group: 'Referencias', description: 'Número de nota de venta final.' },
  { source_key: 'referencia_nv', label: 'Referencia NV', group: 'Referencias', description: 'Texto completo de la NV, por ejemplo NV5056.' },
  { source_key: 'referencia_np', label: 'Referencia NP', group: 'Referencias', description: 'Texto completo de la NP origen, si existe.' },
  { source_key: 'quote_number', label: 'Número interno presupuesto', group: 'Referencias', description: 'Número interno del presupuestador.' },

  { source_key: 'fecha_presupuesto', label: 'Fecha presupuesto', group: 'Fechas', description: 'Fecha de creación del presupuesto original.' },
  { source_key: 'fecha_confirmacion', label: 'Fecha confirmación', group: 'Fechas', description: 'Fecha en la que se confirmó el presupuesto.' },
  { source_key: 'fecha_aprobacion_comercial', label: 'Fecha aprobación comercial', group: 'Fechas', description: 'Fecha de aprobación comercial.' },
  { source_key: 'fecha_aprobacion_tecnica', label: 'Fecha aprobación técnica', group: 'Fechas', description: 'Fecha de aprobación técnica inicial.' },
  { source_key: 'fecha_np', label: 'Fecha NP', group: 'Fechas', description: 'Fecha de generación/sync de la NP en Odoo, si existe.' },
  { source_key: 'fecha_medicion', label: 'Fecha medición', group: 'Fechas', description: 'Fecha de medición del portón, si existe.' },
  { source_key: 'fecha_revision_tecnica_final', label: 'Fecha revisión técnica final', group: 'Fechas', description: 'Fecha de revisión técnica final de la medición.' },
  { source_key: 'fecha_solicitud_salida_acopio', label: 'Fecha solicitud salida de acopio', group: 'Fechas', description: 'Fecha en la que se pidió pasar un portón de acopio a producción.' },
  { source_key: 'fecha_nv', label: 'Fecha NV', group: 'Fechas', description: 'Fecha de generación/sync de la NV final en Odoo.' },

  { source_key: 'catalog_kind', label: 'Tipo de catálogo', group: 'General', description: 'porton / ipanel / otros.' },
  { source_key: 'fulfillment_mode', label: 'Modo', group: 'General', description: 'acopio / produccion.' },
  { source_key: 'payment_method', label: 'Forma de pago', group: 'General', description: 'Forma de pago del presupuesto.' },

  { source_key: 'cliente_nombre', label: 'Cliente nombre', group: 'Cliente', description: 'Nombre del cliente final.' },
  { source_key: 'cliente_apellido', label: 'Cliente apellido', group: 'Cliente', description: 'Apellido del cliente final.' },
  { source_key: 'cliente_nombre_completo', label: 'Cliente nombre completo', group: 'Cliente', description: 'Nombre y apellido del cliente final.' },
  { source_key: 'cliente_telefono', label: 'Cliente teléfono', group: 'Cliente', description: 'Teléfono del cliente final.' },
  { source_key: 'cliente_email', label: 'Cliente email', group: 'Cliente', description: 'Email del cliente final.' },
  { source_key: 'cliente_direccion', label: 'Cliente dirección', group: 'Cliente', description: 'Dirección del cliente final.' },
  { source_key: 'cliente_localidad', label: 'Cliente localidad', group: 'Cliente', description: 'Ciudad / localidad del cliente final.' },
  { source_key: 'cliente_maps_url', label: 'Cliente Maps', group: 'Cliente', description: 'URL de Google Maps del cliente.' },

  { source_key: 'vendido_por_rol', label: 'Vendido por rol', group: 'Venta', description: 'Rol del usuario que vendió el portón.' },
  { source_key: 'vendido_por_nombre', label: 'Vendido por nombre', group: 'Venta', description: 'Nombre del usuario que vendió el portón.' },
  { source_key: 'vendido_por_username', label: 'Vendido por usuario', group: 'Venta', description: 'Username del usuario que vendió el portón.' },
  { source_key: 'vendedor_nombre', label: 'Vendedor nombre', group: 'Venta', description: 'Nombre del vendedor, si la venta la hizo un vendedor.' },
  { source_key: 'distribuidor_nombre', label: 'Distribuidor nombre', group: 'Venta', description: 'Nombre del distribuidor, si la venta la hizo un distribuidor.' },

  { source_key: 'porton_type', label: 'Sistema (label visible)', group: 'Portón', description: 'Tipo/sistema visible, en mayúsculas como el desplegable del cotizador.' },
  { source_key: 'porton_type_key', label: 'Sistema (key interna)', group: 'Portón', description: 'Key interna, por ejemplo acero_simil_aluminio_clasico.' },
  { source_key: 'alto_final_mm', label: 'Alto final (mm)', group: 'Portón', description: 'Alto final en milímetros.' },
  { source_key: 'ancho_final_mm', label: 'Ancho final (mm)', group: 'Portón', description: 'Ancho final en milímetros.' },
  { source_key: 'cantidad_parantes', label: 'Cantidad parantes', group: 'Portón', description: 'Cantidad de parantes.' },
  { source_key: 'orientacion_parantes', label: 'Orientación parantes', group: 'Portón', description: 'Orientación de parantes.' },
  { source_key: 'distribucion_parantes', label: 'Distribución parantes', group: 'Portón', description: 'Distribución de parantes.' },
  { source_key: 'observaciones_parantes', label: 'Observaciones parantes', group: 'Portón', description: 'Observaciones de parantes.' },

  { source_key: 'tolerance_percent', label: 'Tolerancia %', group: 'Métricas', description: 'Tolerancia porcentual final aplicada.' },
  { source_key: 'tolerance_amount', label: 'Tolerancia importe', group: 'Métricas', description: 'Tolerancia monetaria aplicada.' },
  { source_key: 'difference_amount', label: 'Diferencia final', group: 'Métricas', description: 'Diferencia final calculada.' },
  { source_key: 'absorbed_by_company', label: 'Absorbido por empresa', group: 'Métricas', description: 'true / false.' },
  { source_key: 'final_amount_to_charge', label: 'Importe final a cobrar', group: 'Métricas', description: 'Monto final de la NV.' },
];

async function saveFormulaToBackend(columnName, expression, authHeader) {
  const res = await fetch(`${API_BASE_URL}/api/formulas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
    body: JSON.stringify({ column_name: columnName, expression }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchMeasurementSourceCatalog(authHeader) {
  const res = await fetch(`${API_BASE_URL}/api/measurement-source-catalog`, {
    headers: { ...(authHeader || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchPropertyMappings(authHeader) {
  const res = await fetch(`${API_BASE_URL}/api/property-mappings`, {
    headers: { ...(authHeader || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function savePropertyMappingToBackend(payload, authHeader) {
  const res = await fetch(`${API_BASE_URL}/api/property-mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchPropertyValueOptions(property, authHeader) {
  const params = new URLSearchParams();
  params.set('property', property);

  const res = await fetch(`${API_BASE_URL}/api/property-value-options?${params.toString()}`, {
    headers: { ...(authHeader || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function getResolverLabel(value) {
  const match = RESOLVER_OPTIONS.find((item) => item.value === value);
  return match?.label || value || 'Directo';
}

function isProductionMapping(row = {}) {
  return row?.source_section === PRODUCTION_SOURCE_SECTION || !!row?.source_key;
}

function getProductionSourceKey(row = {}) {
  return String(row?.source_key || row?.source_path || '').trim();
}

function buildProductionSearchText(item = {}, draft = {}) {
  return [item?.group, item?.label, item?.source_key, item?.description, draft?.target_property]
    .join(' ')
    .toLowerCase();
}

export default function FormulasPage({ hasData, columns, formulas, permissions, authHeader }) {
  const canEditFormulas = !!permissions?.canEditFormulas;

  const [nvInput, setNvInput] = useState('');
  const [sampleRow, setSampleRow] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState('');

  const [drafts, setDrafts] = useState({});
  const [savingCol, setSavingCol] = useState(null);
  const [saveError, setSaveError] = useState('');

  const [mappingCatalog, setMappingCatalog] = useState([]);
  const [mappingRows, setMappingRows] = useState([]);
  const [mappingDrafts, setMappingDrafts] = useState({});
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState('');
  const [savingMappingCol, setSavingMappingCol] = useState(null);

  const [productionDrafts, setProductionDrafts] = useState({});
  const [productionSearch, setProductionSearch] = useState('');
  const [productionError, setProductionError] = useState('');
  const [savingProductionKey, setSavingProductionKey] = useState(null);

  const [valueProperty, setValueProperty] = useState('');
  const [valueOptions, setValueOptions] = useState([]);
  const [valueSelected, setValueSelected] = useState('');
  const [valueLoading, setValueLoading] = useState(false);
  const [valueError, setValueError] = useState('');

  const targetProperties = useMemo(() => {
    const set = new Set([...(columns || [])]);
    (mappingRows || []).forEach((row) => {
      if (row?.target_property) set.add(String(row.target_property));
    });
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'es'));
  }, [columns, mappingRows]);

  const catalogBySection = useMemo(() => {
    const map = new Map();
    (mappingCatalog || []).forEach((section) => {
      map.set(section.section_key, section);
    });
    return map;
  }, [mappingCatalog]);

  const productionSourceProperties = useMemo(() => {
    const byKey = new Map();
    const productionSection = (mappingCatalog || []).find((section) => section?.section_key === PRODUCTION_SOURCE_SECTION);
    const catalogFields = Array.isArray(productionSection?.fields) ? productionSection.fields : [];

    catalogFields.forEach((field) => {
      const key = String(field?.source_key || field?.path || '').trim();
      if (!key) return;
      byKey.set(key, {
        source_key: key,
        label: field?.label || key,
        group: field?.group || productionSection?.section_label || 'Nota de venta',
        description: field?.description || '',
      });
    });

    if (!byKey.size) {
      (PRODUCTION_SOURCE_PROPERTIES || []).forEach((item) => {
        const key = String(item?.source_key || '').trim();
        if (key) byKey.set(key, item);
      });
    }

    (mappingRows || []).forEach((row) => {
      if (!isProductionMapping(row)) return;
      const key = getProductionSourceKey(row);
      if (!key || byKey.has(key)) return;
      byKey.set(key, {
        source_key: key,
        label: row?.source_label || row?.label || key,
        group: row?.source_group || (key.startsWith('section__') ? 'Secciones del presupuesto' : 'Nota de venta'),
        description: row?.source_description || (key.startsWith('section__')
          ? 'Item elegido en esta sección del presupuesto. Si la sección no participa en la NV, la propiedad asignada queda null.'
          : 'Campo ya asignado desde Nota de venta.'),
      });
    });

    return Array.from(byKey.values()).sort((a, b) => {
      const aIsSection = String(a?.source_key || '').startsWith('section__') ? 0 : 1;
      const bIsSection = String(b?.source_key || '').startsWith('section__') ? 0 : 1;
      return aIsSection - bIsSection ||
        String(a.group || '').localeCompare(String(b.group || ''), 'es') ||
        String(a.label || a.source_key || '').localeCompare(String(b.label || b.source_key || ''), 'es');
    });
  }, [mappingCatalog, mappingRows]);

  const productionFilteredSourceProperties = useMemo(() => {
    const needle = String(productionSearch || '').trim().toLowerCase();
    if (!needle) return productionSourceProperties;
    return (productionSourceProperties || []).filter((item) => {
      const key = String(item?.source_key || '');
      return buildProductionSearchText(item, productionDrafts[key] || {}).includes(needle);
    });
  }, [productionSourceProperties, productionDrafts, productionSearch]);

  useEffect(() => {
    const initial = {};
    (columns || []).forEach((col) => {
      initial[col] = (formulas[col] ?? '').trim();
    });
    setDrafts(initial);
  }, [columns, formulas]);

  useEffect(() => {
    let cancelled = false;

    async function loadMappings() {
      setMappingLoading(true);
      setMappingError('');
      try {
        const [catalogData, mappingsData] = await Promise.all([
          fetchMeasurementSourceCatalog(authHeader),
          fetchPropertyMappings(authHeader),
        ]);

        if (cancelled) return;

        setMappingCatalog(catalogData?.sections || []);
        setMappingRows(mappingsData?.mappings || []);
      } catch (err) {
        console.error('Error cargando catálogo / mappings:', err);
        if (!cancelled) setMappingError(err.message || 'Error cargando mappings');
      } finally {
        if (!cancelled) setMappingLoading(false);
      }
    }

    loadMappings();
    return () => { cancelled = true; };
  }, [authHeader]);

  useEffect(() => {
    const byTarget = new Map();
    (mappingRows || []).forEach((row) => {
      if (isProductionMapping(row)) return;
      byTarget.set(String(row.target_property), row);
    });

    const next = {};
    targetProperties.forEach((property) => {
      const existing = byTarget.get(String(property));
      next[property] = {
        target_property: property,
        source_app: existing?.source_app || 'presupuestador',
        source_section: existing?.source_section || '',
        source_path: existing?.source_path || '',
        resolver: existing?.resolver || 'identity',
        is_active: existing?.is_active !== false,
      };
    });
    setMappingDrafts(next);
  }, [targetProperties, mappingRows]);

  useEffect(() => {
    const next = {};

    (mappingRows || []).forEach((row) => {
      if (!isProductionMapping(row)) return;
      const sourceKey = getProductionSourceKey(row);
      if (!sourceKey) return;
      next[sourceKey] = {
        target_property: String(row?.target_property || ''),
        is_active: row?.is_active !== false,
      };
    });

    (productionSourceProperties || []).forEach((item) => {
      const sourceKey = String(item?.source_key || '').trim();
      if (!sourceKey || next[sourceKey]) return;
      next[sourceKey] = { target_property: '', is_active: true };
    });

    setProductionDrafts(next);
  }, [mappingRows, productionSourceProperties]);

  useEffect(() => {
    if (!valueProperty) return;
    if (targetProperties.includes(valueProperty)) return;
    setValueProperty('');
    setValueOptions([]);
    setValueSelected('');
    setValueError('');
  }, [targetProperties, valueProperty]);

  useEffect(() => {
    let cancelled = false;

    async function loadPropertyValues() {
      if (!valueProperty) {
        setValueOptions([]);
        setValueSelected('');
        setValueError('');
        return;
      }

      setValueLoading(true);
      setValueError('');
      try {
        const data = await fetchPropertyValueOptions(valueProperty, authHeader);
        if (cancelled) return;

        const options = Array.isArray(data?.values) ? data.values : [];
        setValueOptions(options);
        setValueSelected((current) => (
          options.some((item) => String(item?.value) === String(current)) ? current : ''
        ));
      } catch (err) {
        console.error('Error cargando valores de propiedad:', err);
        if (!cancelled) {
          setValueOptions([]);
          setValueSelected('');
          setValueError(err.message || 'Error cargando valores de propiedad');
        }
      } finally {
        if (!cancelled) setValueLoading(false);
      }
    }

    loadPropertyValues();
    return () => { cancelled = true; };
  }, [authHeader, valueProperty]);

  async function handleLoadSampleRow(e) {
    e.preventDefault();
    const nv = nvInput.trim();
    if (!nv) {
      setSampleError('Ingresá un NV para probar.');
      setSampleRow(null);
      return;
    }

    setSampleLoading(true);
    setSampleError('');
    setSampleRow(null);

    try {
      const params = new URLSearchParams();
      params.set('nv', nv);

      await fetch(`${API_BASE_URL}/api/pre-produccion?${params.toString()}`, {
        headers: { ...(authHeader || {}) },
      });

      let res = await fetch(`${API_BASE_URL}/api/pre-produccion-valores?${params.toString()}`, {
        headers: { ...(authHeader || {}) },
      });

      if (!res.ok) {
        res = await fetch(`${API_BASE_URL}/api/pre-produccion?${params.toString()}`, {
          headers: { ...(authHeader || {}) },
        });
      }

      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

      const data = await res.json();
      if (!data.rows || !data.rows.length) {
        setSampleError(`No se encontró ningún portón con NV = ${nv}`);
        setSampleRow(null);
        return;
      }
      setSampleRow(data.rows[0]);
    } catch (err) {
      console.error('Error cargando NV de prueba:', err);
      setSampleError(err.message || 'Error cargando NV de prueba');
      setSampleRow(null);
    } finally {
      setSampleLoading(false);
    }
  }

  const { compiledDrafts, compileErrors } = useMemo(() => {
    const compiled = {};
    const errors = {};

    for (const [col, expr] of Object.entries(drafts)) {
      const trimmed = (expr ?? '').trim();
      if (!trimmed) continue;

      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(
          'row',
          `
            with (row) {
              return (${trimmed});
            }
          `
        );
        compiled[col] = fn;
      } catch (e) {
        console.error(`Error compilando fórmula para ${col}:`, e);
        errors[col] = 'Error de sintaxis';
      }
    }

    return { compiledDrafts: compiled, compileErrors: errors };
  }, [drafts]);

  function getPrePostForColumn(col) {
    if (!sampleRow) return { pre: '', post: '' };

    const raw = sampleRow[col];
    const pre = raw === null || raw === undefined ? '' : String(raw);

    const expr = drafts[col] ? drafts[col].trim() : '';
    if (!expr) return { pre, post: pre };

    const fn = compiledDrafts[col];
    if (!fn) return { pre, post: '' };

    const cache = {};
    const visiting = new Set();

    function evalCol(c) {
      if (Object.prototype.hasOwnProperty.call(cache, c)) return cache[c];

      if (visiting.has(c)) {
        console.warn('Dependencia circular de fórmulas (FormulasPage) en:', c);
        return sampleRow[c];
      }
      visiting.add(c);

      const rawVal = sampleRow[c];
      const colFn = compiledDrafts[c];

      if (!colFn) {
        cache[c] = rawVal;
        visiting.delete(c);
        return rawVal;
      }

      const proxyRow = new Proxy(sampleRow, {
        get(target, prop, receiver) {
          if (
            typeof prop === 'string' &&
            (Object.prototype.hasOwnProperty.call(target, prop) || compiledDrafts[prop])
          ) {
            return evalCol(prop);
          }
          return Reflect.get(target, prop, receiver);
        },
        has(target, prop) {
          if (
            typeof prop === 'string' &&
            (Object.prototype.hasOwnProperty.call(target, prop) || compiledDrafts[prop])
          ) {
            return true;
          }
          return Reflect.has(target, prop);
        },
      });

      let result;
      try {
        result = colFn(proxyRow);
      } catch (e) {
        console.error(`Error evaluando fórmula (FormulasPage) para ${c}:`, e);
        result = rawVal;
      }

      visiting.delete(c);
      cache[c] = result;
      return result;
    }

    const r = evalCol(col);
    const post = r === null || r === undefined || Number.isNaN(r) ? '' : String(r);

    return { pre, post };
  }

  async function handleSaveColumnFormula(col) {
    if (!canEditFormulas) {
      window.alert('No tenés permisos para editar fórmulas.');
      return;
    }

    const prev = (formulas[col] ?? '').trim();
    const draft = (drafts[col] ?? '').trim();

    if (!draft && !prev) {
      window.alert('No hay cambios para guardar en esta columna.');
      return;
    }

    if (draft) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(
          'row',
          `
            with (row) {
              return (${draft});
            }
          `
        );
      } catch (e) {
        console.error('Error de sintaxis en fórmula:', e);
        window.alert('La fórmula tiene un error de sintaxis y no se guardó:\n\n' + (e.message || String(e)));
        return;
      }
    }

    const msg = prev
      ? `La columna "${col}" tiene actualmente la fórmula:\n\n${prev || '(sin fórmula)'}\n\n¿Querés reemplazarla por?\n\n${
          draft || '(sin fórmula, usar valor original)'
        }`
      : `¿Querés aplicar esta fórmula a la columna "${col}"?\n\n${
          draft || '(sin fórmula, usar valor original)'
        }`;

    const ok = window.confirm(msg);
    if (!ok) return;

    setSavingCol(col);
    setSaveError('');
    try {
      await saveFormulaToBackend(col, draft, authHeader);
      window.alert(`Fórmula de la columna "${col}" guardada correctamente.\nSe recargará la página.`);
      window.location.reload();
    } catch (err) {
      console.error('Error guardando fórmula:', err);
      setSaveError(err.message || 'Error guardando fórmula');
    } finally {
      setSavingCol(null);
    }
  }

  function handleFormulaKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleSaveColumnFormula(col);
  }

  function setMappingDraft(targetProperty, patch) {
    setMappingDrafts((current) => ({
      ...current,
      [targetProperty]: {
        ...(current[targetProperty] || {
          target_property: targetProperty,
          source_app: 'presupuestador',
          source_section: '',
          source_path: '',
          resolver: 'identity',
          is_active: true,
        }),
        ...(patch || {}),
      },
    }));
  }

  function setProductionDraft(sourceKey, patch) {
    setProductionDrafts((current) => ({
      ...current,
      [sourceKey]: {
        ...(current[sourceKey] || { target_property: '', is_active: true }),
        ...(patch || {}),
      },
    }));
  }

  async function handleSaveMapping(targetProperty) {
    if (!canEditFormulas) {
      window.alert('No tenés permisos para editar mappings.');
      return;
    }

    const draft = mappingDrafts[targetProperty];
    if (!draft) return;

    if (!draft.source_section || !draft.source_path) {
      window.alert(`La propiedad "${targetProperty}" necesita sección y campo origen antes de guardar.`);
      return;
    }

    const section = catalogBySection.get(draft.source_section);
    const field = section?.fields?.find((item) => item.path === draft.source_path);

    const ok = window.confirm(
      `¿Guardar mapping para "${targetProperty}"?\n\n` +
      `Sección: ${section?.section_label || draft.source_section}\n` +
      `Campo: ${field?.label || draft.source_path}\n` +
      `Resolver: ${getResolverLabel(draft.resolver)}\n` +
      `Activo: ${draft.is_active ? 'Sí' : 'No'}`
    );
    if (!ok) return;

    setSavingMappingCol(targetProperty);
    setMappingError('');
    try {
      const data = await savePropertyMappingToBackend(draft, authHeader);
      const savedRow = data?.mapping;
      setMappingRows((current) => {
        const next = (current || []).filter((item) => String(item.target_property) !== String(targetProperty));
        if (savedRow) next.push(savedRow);
        next.sort((a, b) => String(a.target_property).localeCompare(String(b.target_property), 'es'));
        return next;
      });
    } catch (err) {
      console.error('Error guardando mapping:', err);
      setMappingError(err.message || 'Error guardando mapping');
    } finally {
      setSavingMappingCol(null);
    }
  }

  async function handleSaveProductionMapping(sourceKey) {
    if (!canEditFormulas) {
      window.alert('No tenés permisos para editar asignaciones.');
      return;
    }

    const key = String(sourceKey || '').trim();
    if (!key) return;

    const draft = productionDrafts[key] || { target_property: '', is_active: true };
    const selectedTarget = String(draft.target_property || '').trim();
    const sourceMeta = (productionSourceProperties || []).find((item) => String(item?.source_key || '') === key) || {};

    const ok = window.confirm(
      `¿Guardar asignación desde Nota de venta?\n\n` +
      `Propiedad presupuestador: ${key}\n` +
      `Propiedad integrador: ${selectedTarget || '(sin asignar)'}\n` +
      `Activo: ${draft.is_active !== false ? 'Sí' : 'No'}`
    );
    if (!ok) return;

    setSavingProductionKey(key);
    setProductionError('');
    try {
      const data = await savePropertyMappingToBackend({
        source_app: 'presupuestador',
        source_section: PRODUCTION_SOURCE_SECTION,
        source_path: key,
        source_key: key,
        target_property: selectedTarget,
        resolver: 'identity',
        is_active: draft.is_active !== false,
      }, authHeader);

      const savedRow = {
        source_label: sourceMeta?.label || key,
        source_group: sourceMeta?.group || (key.startsWith('section__') ? 'Secciones del presupuesto' : 'Nota de venta'),
        source_description: sourceMeta?.description || '',
        ...(data?.mapping || {
          source_key: key,
          source_section: PRODUCTION_SOURCE_SECTION,
          source_path: key,
          target_property: selectedTarget,
          resolver: 'identity',
          is_active: draft.is_active !== false,
        }),
      };

      setMappingRows((current) => {
        const next = (current || []).filter((item) => {
          if (!isProductionMapping(item)) return true;
          const itemSourceKey = getProductionSourceKey(item);
          if (itemSourceKey === key) return false;
          if (selectedTarget && String(item?.target_property || '') === selectedTarget) return false;
          return true;
        });
        next.push(savedRow);
        next.sort((a, b) =>
          String(getProductionSourceKey(a) || a.target_property || '').localeCompare(
            String(getProductionSourceKey(b) || b.target_property || ''),
            'es'
          )
        );
        return next;
      });
    } catch (err) {
      console.error('Error guardando asignación desde Nota de venta:', err);
      setProductionError(err.message || 'Error guardando asignación desde Nota de venta');
    } finally {
      setSavingProductionKey(null);
    }
  }

  const nvToShow =
    sampleRow && sampleRow.NV !== undefined && sampleRow.NV !== null && sampleRow.NV !== ''
      ? sampleRow.NV
      : nvInput && nvInput !== ''
      ? nvInput
      : '(sin NV)';

  return (
    <div className="formulas-page" style={{ display: 'grid', gap: 20 }}>
      <div className="formulas-panel">
        <h2>Fórmulas por propiedad (con NV de prueba)</h2>
        {!hasData && <div className="info">Todavía no hay datos cargados para probar fórmulas contra un NV.</div>}
        {hasData && (
          <>
            <p className="hint">
              Ingresá un NV para ver, por cada propiedad, el valor original y el valor calculado con la fórmula actual / borrador.
            </p>

            <form className="field-row" onSubmit={handleLoadSampleRow}>
              <label>
                NV de prueba:&nbsp;
                <input
                  type="text"
                  value={nvInput}
                  onChange={(e) => setNvInput(e.target.value)}
                  placeholder="Ej: 1019"
                />
              </label>
              <button type="submit" className="btn-secondary" disabled={sampleLoading}>
                {sampleLoading ? 'Cargando...' : 'Cargar portón'}
              </button>
            </form>

            {!canEditFormulas && <div className="info">Modo solo lectura de fórmulas.</div>}
            {sampleError && <div className="error">⚠ {sampleError}</div>}
            {saveError && <div className="error">⚠ {saveError}</div>}

            {sampleRow && (
              <p className="hint">
                Mostrando valores para NV <b>{nvToShow}</b>
              </p>
            )}

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Propiedad</th>
                    <th>Fórmula (borrador)</th>
                    <th>Valor original (NV de prueba)</th>
                    <th>Valor con fórmula</th>
                    {canEditFormulas && <th>Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col) => {
                    const expr = drafts[col] ?? '';
                    const { pre, post } = getPrePostForColumn(col);
                    const hasSyntaxError = !!compileErrors[col];

                    return (
                      <tr key={col}>
                        <td>{col}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              className="formula-input-header"
                              value={expr}
                              disabled={!canEditFormulas}
                              onChange={(e) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [col]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (!canEditFormulas) return;
                                handleFormulaKeyDown(e, col);
                              }}
                              placeholder={canEditFormulas ? 'fórmula' : 'solo lectura'}
                            />
                            {hasSyntaxError && <span className="col-error" title={compileErrors[col]}>⚠</span>}
                          </div>
                        </td>
                        <td>{pre}</td>
                        <td>{post}</td>
                        {canEditFormulas && (
                          <td>
                            <button
                              type="button"
                              className="btn-small"
                              onClick={() => handleSaveColumnFormula(col)}
                              disabled={savingCol === col}
                            >
                              {savingCol === col ? 'Guardando…' : 'Guardar'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!sampleRow && !sampleError && (
              <p className="hint">Cargá un NV de prueba para ver los valores “pre” y “post” en cada propiedad.</p>
            )}
          </>
        )}
      </div>

      <div className="formulas-panel" hidden={HIDE_MEASUREMENT_MAPPINGS_PANEL}>
        <h2>Asignador de propiedades desde medición</h2>
        <p className="hint">
          Acá definís qué dato de la planilla de medición de presupuestador alimenta cada propiedad del integrador.
        </p>

        {!canEditFormulas && <div className="info">Modo solo lectura de mappings.</div>}
        {mappingLoading && <div className="info">Cargando catálogo y mappings…</div>}
        {mappingError && <div className="error">⚠ {mappingError}</div>}

        {!mappingLoading && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Propiedad integrador</th>
                  <th>Sección origen</th>
                  <th>Campo origen</th>
                  <th>Resolver</th>
                  <th>Activo</th>
                  {canEditFormulas && <th>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {targetProperties.map((targetProperty) => {
                  const draft = mappingDrafts[targetProperty] || {
                    target_property: targetProperty,
                    source_app: 'presupuestador',
                    source_section: '',
                    source_path: '',
                    resolver: 'identity',
                    is_active: true,
                  };

                  const currentSection = catalogBySection.get(draft.source_section);
                  const fields = currentSection?.fields || [];

                  return (
                    <tr key={`mapping-${targetProperty}`}>
                      <td style={{ fontWeight: 700 }}>{targetProperty}</td>
                      <td>
                        <select
                          value={draft.source_section || ''}
                          disabled={!canEditFormulas}
                          onChange={(e) => {
                            const nextSection = e.target.value;
                            setMappingDraft(targetProperty, {
                              source_section: nextSection,
                              source_path: '',
                            });
                          }}
                        >
                          <option value="">Seleccionar…</option>
                          {(mappingCatalog || []).map((section) => (
                            <option key={section.section_key} value={section.section_key}>
                              {section.section_label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={draft.source_path || ''}
                          disabled={!canEditFormulas || !draft.source_section}
                          onChange={(e) => setMappingDraft(targetProperty, { source_path: e.target.value })}
                        >
                          <option value="">Seleccionar…</option>
                          {fields.map((field) => (
                            <option key={field.path} value={field.path}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={draft.resolver || 'identity'}
                          disabled={!canEditFormulas}
                          onChange={(e) => setMappingDraft(targetProperty, { resolver: e.target.value })}
                        >
                          {RESOLVER_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={draft.is_active !== false}
                            disabled={!canEditFormulas}
                            onChange={(e) => setMappingDraft(targetProperty, { is_active: e.target.checked })}
                          />
                          {draft.is_active !== false ? 'Sí' : 'No'}
                        </label>
                      </td>
                      {canEditFormulas && (
                        <td>
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => handleSaveMapping(targetProperty)}
                            disabled={savingMappingCol === targetProperty}
                          >
                            {savingMappingCol === targetProperty ? 'Guardando…' : 'Guardar'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="formulas-panel">
        <h2>Asignador de propiedades desde Nota de venta</h2>
        <p className="hint">
          Acá asignás cada sección del presupuesto a una propiedad del integrador. El valor será el item elegido en esa sección; si la sección no participa en la NV, la propiedad asignada se escribirá como null.
        </p>

        {!canEditFormulas && <div className="info">Modo solo lectura de asignaciones.</div>}
        {mappingLoading && <div className="info">Cargando asignaciones…</div>}
        {productionError && <div className="error">⚠ {productionError}</div>}

        <div
          className="field-row"
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}
        >
          <label style={{ minWidth: 360, flex: 1 }}>
            Buscar sección / propiedad origen
            <br />
            <input
              type="text"
              value={productionSearch}
              onChange={(e) => setProductionSearch(e.target.value)}
              placeholder="Buscar por sección, item origen o propiedad destino…"
              style={{ width: '100%' }}
            />
          </label>
          <div className="hint" style={{ marginBottom: 4 }}>
            {productionFilteredSourceProperties.length} propiedad(es)
          </div>
        </div>

        {!mappingLoading && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Sección / propiedad presupuestador</th>
                  <th>Descripción</th>
                  <th>Propiedad integrador</th>
                  <th>Activo</th>
                  {canEditFormulas && <th>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {productionFilteredSourceProperties.map((item) => {
                  const sourceKey = String(item?.source_key || '');
                  const draft = productionDrafts[sourceKey] || { target_property: '', is_active: true };

                  return (
                    <tr key={`production-${sourceKey}`}>
                      <td>{item?.group || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item?.label || sourceKey}</div>
                        <div className="hint" style={{ margin: 0 }}>{sourceKey}</div>
                      </td>
                      <td>{item?.description || '—'}</td>
                      <td>
                        <select
                          value={draft.target_property || ''}
                          disabled={!canEditFormulas}
                          onChange={(e) => setProductionDraft(sourceKey, { target_property: e.target.value })}
                        >
                          <option value="">Sin asignar</option>
                          {targetProperties.map((target) => (
                            <option key={`${sourceKey}-${target}`} value={target}>
                              {target}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={draft.is_active !== false}
                            disabled={!canEditFormulas}
                            onChange={(e) => setProductionDraft(sourceKey, { is_active: e.target.checked })}
                          />
                          {draft.is_active !== false ? 'Sí' : 'No'}
                        </label>
                      </td>
                      {canEditFormulas && (
                        <td>
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => handleSaveProductionMapping(sourceKey)}
                            disabled={savingProductionKey === sourceKey}
                          >
                            {savingProductionKey === sourceKey ? 'Guardando…' : 'Guardar'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="formulas-panel">
        <h2>Valores</h2>
        <p className="hint">
          Elegí una propiedad del integrador para ver qué valores distintos existen hoy en la base.
        </p>

        <div
          className="field-row"
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}
        >
          <label style={{ minWidth: 280 }}>
            Propiedad
            <br />
            <select
              value={valueProperty}
              onChange={(e) => {
                setValueProperty(e.target.value);
                setValueSelected('');
              }}
            >
              <option value="">Seleccionar…</option>
              {targetProperties.map((property) => (
                <option key={`value-property-${property}`} value={property}>
                  {property}
                </option>
              ))}
            </select>
          </label>

          <label style={{ minWidth: 380 }}>
            Valor
            <br />
            <select
              value={valueSelected}
              onChange={(e) => setValueSelected(e.target.value)}
              disabled={!valueProperty || valueLoading || !valueOptions.length}
            >
              <option value="">
                {!valueProperty
                  ? 'Seleccionar propiedad…'
                  : valueLoading
                  ? 'Cargando…'
                  : valueOptions.length
                  ? 'Seleccionar…'
                  : 'Sin valores disponibles'}
              </option>
              {valueOptions.map((item) => {
                const optionValue = String(item?.value ?? '');
                const count = Number(item?.count ?? 0);
                return (
                  <option key={`${valueProperty}-${optionValue}`} value={optionValue}>
                    {count > 0 ? `${optionValue} (${count})` : optionValue}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        {valueError && <div className="error">⚠ {valueError}</div>}

        {valueProperty && !valueError && !valueLoading && (
          <p className="hint">
            {valueOptions.length
              ? `Se encontraron ${valueOptions.length} valor(es) distintos para "${valueProperty}".`
              : `No se encontraron valores cargados para "${valueProperty}".`}
          </p>
        )}
      </div>
    </div>
  );
}
