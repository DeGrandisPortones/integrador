import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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

export default function FormulasPage({ hasData, columns, formulas, permissions, authHeader }) {
  const canEditFormulas = !!permissions?.canEditFormulas;

  const [nvInput, setNvInput] = useState('');
  const [sampleRow, setSampleRow] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState('');

  const [drafts, setDrafts] = useState({});
  const [savingCol, setSavingCol] = useState(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const initial = {};
    (columns || []).forEach((col) => {
      initial[col] = (formulas[col] ?? '').trim();
    });
    setDrafts(initial);
  }, [columns, formulas]);

  if (!hasData) {
    return <div className="info">No hay datos de Pre_Producción para listar propiedades todavía.</div>;
  }

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

  const nvToShow =
    sampleRow && sampleRow.NV !== undefined && sampleRow.NV !== null && sampleRow.NV !== ''
      ? sampleRow.NV
      : nvInput && nvInput !== ''
      ? nvInput
      : '(sin NV)';

  return (
    <div className="formulas-page">
      <div className="formulas-panel">
        <h2>Fórmulas por propiedad (con NV de prueba)</h2>
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
      </div>
    </div>
  );
}
