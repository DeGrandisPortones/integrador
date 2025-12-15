import { useEffect, useMemo, useRef, useState } from 'react';
import TablePage from './pages/TablePage';
import FormulasPage from './pages/FormulasPage';
import ImportPage from './pages/ImportPage';
import PdfPartidaPage from './pages/PdfPartidaPage';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

// ==== helpers de backend ====

async function fetchPreProduccion(nv) {
  const params = new URLSearchParams();
  if (nv) params.set('nv', nv);

  const qs = params.toString() ? `?${params.toString()}` : '';

  // 1) Siempre pegamos al SQL para sincronizar
  const syncRes = await fetch(`${API_BASE_URL}/api/pre-produccion${qs}`);
  if (!syncRes.ok) {
    throw new Error(`Error HTTP ${syncRes.status}`);
  }
  const syncData = await syncRes.json();

  // 2) Intentar leer valores definitivos
  try {
    const valsRes = await fetch(`${API_BASE_URL}/api/pre-produccion-valores${qs}`);
    if (!valsRes.ok) {
      throw new Error(`Error HTTP ${valsRes.status}`);
    }
    const valsData = await valsRes.json();

    if (Array.isArray(valsData.rows)) {
      return valsData;
    }
  } catch (e) {
    console.warn(
      'No se pudo leer pre-produccion-valores, uso SQL crudo:',
      e?.message || e
    );
  }

  return syncData;
}

async function fetchFormulasFromBackend() {
  const res = await fetch(`${API_BASE_URL}/api/formulas`);
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status}`);
  }
  return res.json();
}

async function saveFormulaToBackend(columnName, expression) {
  const res = await fetch(`${API_BASE_URL}/api/formulas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column_name: columnName, expression }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ==== componente principal ====

export default function App() {
  const [currentPage, setCurrentPage] = useState('tabla'); // 'tabla' | 'formulas' | 'import' | 'pdf'

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formulas, setFormulas] = useState({});
  const [formulaBackendError, setFormulaBackendError] = useState('');

  const nvInputRef = useRef(null);
  const formulaInputRefs = useRef({});

  // ===== carga inicial =====
  useEffect(() => {
    loadData();
    loadFormulas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(nv) {
    try {
      setLoading(true);
      setError('');
      const data = await fetchPreProduccion(nv);
      setRows(data.rows || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }

  async function loadFormulas() {
    try {
      setFormulaBackendError('');
      const data = await fetchFormulasFromBackend();
      const map = {};
      (data.formulas || []).forEach((f) => {
        map[f.column_name] = f.expression || '';
      });
      setFormulas(map);
    } catch (err) {
      console.error(err);
      setFormulaBackendError(err.message || 'Error cargando fórmulas guardadas');
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    const nv = nvInputRef.current ? nvInputRef.current.value.trim() : '';
    loadData(nv || undefined);
  }

  const hasData = rows && rows.length > 0;

  // Columns robustas:
  const columns = useMemo(() => {
    const set = new Set();

    if (hasData) {
      Object.keys(rows[0] || {}).forEach((k) => set.add(k));
      (rows || []).forEach((r) => Object.keys(r || {}).forEach((k) => set.add(k)));
    }

    Object.keys(formulas || {}).forEach((k) => set.add(k));

    ['lado_mas_alto', 'calc_espada'].forEach((k) => set.add(k));

    return Array.from(set);
  }, [hasData, rows, formulas]);

  // ===== compilar fórmulas =====
  const { compiledFormulas, formulaErrors } = useMemo(() => {
    const compiled = {};
    const errors = {};

    for (const [col, expr] of Object.entries(formulas)) {
      const trimmed = (expr || '').trim();
      if (!trimmed) continue;

      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(
          'row',
          `
            try {
              with (row) {
                return (${trimmed});
              }
            } catch (e) {
              return undefined;
            }
          `
        );
        compiled[col] = fn;
      } catch (e) {
        console.error(`Error compilando fórmula para ${col}:`, e);
        errors[col] = 'Error de sintaxis';
      }
    }

    return { compiledFormulas: compiled, formulaErrors: errors };
  }, [formulas]);

  // ===== evaluar valor mostrado (con cadenas de fórmulas) =====
  function getDisplayValue(row, targetCol) {
    const cache = {};
    const visiting = new Set();

    function evalCol(col) {
      if (Object.prototype.hasOwnProperty.call(cache, col)) {
        return cache[col];
      }

      if (visiting.has(col)) {
        console.warn('Dependencia circular de fórmulas en la columna:', col);
        return row[col];
      }
      visiting.add(col);

      const raw = row[col];
      const fn = compiledFormulas[col];

      if (!fn) {
        cache[col] = raw;
        visiting.delete(col);
        return raw;
      }

      // permitir referenciar columnas con fórmula aunque no existan en row
      const proxyRow = new Proxy(row, {
        get(target, prop, receiver) {
          if (
            typeof prop === 'string' &&
            (Object.prototype.hasOwnProperty.call(target, prop) || compiledFormulas[prop])
          ) {
            return evalCol(prop);
          }
          return Reflect.get(target, prop, receiver);
        },
        has(target, prop) {
          if (
            typeof prop === 'string' &&
            (Object.prototype.hasOwnProperty.call(target, prop) || compiledFormulas[prop])
          ) {
            return true;
          }
          return Reflect.has(target, prop);
        },
      });

      let result;
      try {
        result = fn(proxyRow);
      } catch (e) {
        console.error(`Error evaluando fórmula para ${col}:`, e);
        result = raw;
      }

      visiting.delete(col);
      cache[col] = result;
      return result;
    }

    const result = evalCol(targetCol);

    if (result === undefined || result === null || Number.isNaN(result)) {
      const raw = row[targetCol];
      if (raw === undefined || raw === null) return '';
      return String(raw);
    }

    return String(result);
  }

  function handleFormulaKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const inputEl = formulaInputRefs.current[col];
    const draft = inputEl ? inputEl.value.trim() : '';
    const prev = (formulas[col] || '').trim();

    if (!draft && !prev) return;

    if (draft === prev) {
      window.alert('La fórmula nueva es igual a la actual.');
      return;
    }

    const msg = prev
      ? `La columna "${col}" ya tiene esta fórmula:\n\n${prev}\n\n¿Querés reemplazarla por?\n\n${
          draft || '(sin fórmula, usar valor original)'
        }`
      : `¿Querés aplicar esta fórmula a la columna "${col}"?\n\n${
          draft || '(sin fórmula, usar valor original)'
        }`;

    const ok = window.confirm(msg);
    if (!ok) {
      if (inputEl) inputEl.value = prev;
      return;
    }

    setFormulas((current) => ({
      ...current,
      [col]: draft,
    }));

    saveFormulaToBackend(col, draft).catch((err) => {
      console.error('Error guardando fórmula en backend:', err);
      window.alert(
        'Error guardando la fórmula en la base de datos:\n' +
          (err.message || String(err))
      );
    });
  }

  // ===== guardar cambios de la tabla (ediciones manuales) =====
  async function saveTableChanges(changesByRow) {
    const updates = [];

    Object.entries(changesByRow).forEach(([rowKey, cols]) => {
      if (!cols || !Object.keys(cols).length) return;

      let nvValue = null;

      if (rowKey.startsWith('ID:')) {
        const idPart = rowKey.slice(3);
        const row = rows.find((r) => String(r.ID) === idPart);
        if (row && row.NV !== null && row.NV !== undefined) {
          nvValue = row.NV;
        }
      } else {
        const parsed = parseInt(rowKey, 10);
        if (!Number.isNaN(parsed)) {
          nvValue = parsed;
        }
      }

      if (nvValue === null || nvValue === undefined) return;

      updates.push({
        nv: nvValue,
        changes: cols,
      });
    });

    if (!updates.length) return;

    const res = await fetch(
      `${API_BASE_URL}/api/pre-produccion-valores/bulk-update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
  }

  // ===== render =====
  return (
    <div className="page">
      <header className="header">
        <h1>Pre Producción – NV / Portones</h1>

        <nav className="nav">
          <button
            type="button"
            className={currentPage === 'tabla' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setCurrentPage('tabla')}
          >
            Tabla Pre-Producción
          </button>

          <button
            type="button"
            className={currentPage === 'formulas' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setCurrentPage('formulas')}
          >
            Fórmulas
          </button>

          <button
            type="button"
            className={currentPage === 'pdf' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setCurrentPage('pdf')}
          >
            PDF por Partida
          </button>

          <button
            type="button"
            className={currentPage === 'import' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setCurrentPage('import')}
          >
            Importar Excel
          </button>
        </nav>

        {currentPage === 'tabla' && (
          <form className="search-form" onSubmit={handleSearch}>
            <label>
              NV:&nbsp;
              <input type="text" ref={nvInputRef} placeholder="Ej: 1019" />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (nvInputRef.current) nvInputRef.current.value = '';
                loadData();
              }}
              disabled={loading}
            >
              Limpiar
            </button>
          </form>
        )}

        {formulaBackendError && (
          <div className="error">⚠ {formulaBackendError}</div>
        )}
      </header>

      {error && <div className="error">⚠ {error}</div>}

      {currentPage === 'tabla' && (
        <TablePage
          rows={rows}
          columns={columns}
          hasData={hasData}
          loading={loading}
          formulas={formulas}
          formulaErrors={formulaErrors}
          formulaInputRefs={formulaInputRefs}
          handleFormulaKeyDown={handleFormulaKeyDown}
          getDisplayValue={getDisplayValue}
          onSaveChanges={saveTableChanges}
          totalRows={rows?.length || 0}
        />
      )}

      {currentPage === 'formulas' && (
        <FormulasPage hasData={hasData} columns={columns} formulas={formulas} />
      )}

      {currentPage === 'import' && <ImportPage rows={rows} columns={columns} />}

      {currentPage === 'pdf' && <PdfPartidaPage />}
    </div>
  );
}
