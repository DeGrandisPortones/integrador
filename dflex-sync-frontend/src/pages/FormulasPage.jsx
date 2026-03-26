// src/pages/FormulasPage.jsx
import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const RESOLVER_OPTIONS = [
  { value: 'identity', label: 'Directo' },
  { value: 'min', label: 'Mínimo' },
  { value: 'max', label: 'Máximo' },
  { value: 'sum', label: 'Suma' },
  { value: 'first_non_empty', label: 'Primer valor no vacío' },
  { value: 'join_csv', label: 'Unir CSV' },
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

      <div className="formulas-panel">
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
