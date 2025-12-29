import { useEffect, useMemo, useRef, useState } from 'react';

const LS_VISIBLE_COLS_KEY = 'dflex_pp_visible_columns_v1';
const LS_PAGE_SIZE_KEY = 'dflex_pp_page_size_v1';

export default function TablePage({
  rows,
  columns,
  hasData,
  loading,
  formulas,
  formulaErrors,
  formulaInputRefs,
  handleFormulaKeyDown,
  getDisplayValue,
  onSaveChanges,
  totalRows,
  permissions,
}) {
  const canEditData = !!permissions?.canEditData;
  const canEditFormulas = !!permissions?.canEditFormulas;

  // =========================
  // Ediciones manuales
  // =========================
  const editedRef = useRef({});

  function getRowKey(row, idx) {
    if (row.NV !== null && row.NV !== undefined) return String(row.NV);
    if (row.ID !== null && row.ID !== undefined) return `ID:${row.ID}`;
    return String(idx);
  }

  function handleCellChange(row, rowIndex, col, newValue) {
    if (!canEditData) return;
    const key = getRowKey(row, rowIndex);
    if (!editedRef.current[key]) editedRef.current[key] = {};
    editedRef.current[key][col] = newValue;
  }

  async function handleSaveClick() {
    if (!canEditData) {
      window.alert('No tenés permisos para guardar cambios.');
      return;
    }

    const changes = editedRef.current || {};
    const keys = Object.keys(changes);

    if (!keys.length) {
      window.alert('No hay cambios para guardar.');
      return;
    }

    const ok = window.confirm(
      `Hay cambios en ${keys.length} portón(es).\n\n¿Deseás guardar estos cambios?`
    );
    if (!ok) return;

    try {
      if (typeof onSaveChanges === 'function') {
        await onSaveChanges(changes);
      }
      window.alert('Cambios guardados correctamente.');
      editedRef.current = {};
    } catch (err) {
      console.error('Error guardando cambios:', err);
      window.alert(
        'Ocurrió un error guardando los cambios:\n' +
          (err?.message || String(err))
      );
    }
  }

  // =========================
  // Menú de columnas visibles (persistente)
  // =========================
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [colSearch, setColSearch] = useState('');

  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_VISIBLE_COLS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (visibleCols === null) {
        localStorage.removeItem(LS_VISIBLE_COLS_KEY);
      } else {
        localStorage.setItem(LS_VISIBLE_COLS_KEY, JSON.stringify(visibleCols));
      }
    } catch {
      // ignore
    }
  }, [visibleCols]);

  useEffect(() => {
    if (!Array.isArray(visibleCols)) return;
    const available = new Set(columns || []);
    const filtered = visibleCols.filter((c) => available.has(c));
    setVisibleCols(filtered.length ? filtered : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const filteredColumnsForMenu = useMemo(() => {
    const q = (colSearch || '').trim().toLowerCase();
    if (!q) return columns || [];
    return (columns || []).filter((c) => String(c).toLowerCase().includes(q));
  }, [columns, colSearch]);

  const effectiveColumns = useMemo(() => {
    if (!Array.isArray(visibleCols)) return columns || [];
    const allowed = new Set(visibleCols);
    return (columns || []).filter((c) => allowed.has(c));
  }, [columns, visibleCols]);

  function toggleColumn(col) {
    setVisibleCols((current) => {
      const all = columns || [];
      const base = Array.isArray(current) ? current : [...all];
      const set = new Set(base);

      if (set.has(col)) set.delete(col);
      else set.add(col);

      const next = [...set];

      if (next.length === all.length) return null;

      if (!next.length) {
        return all.includes('NV') ? ['NV'] : all.slice(0, 1);
      }

      return all.filter((c) => next.includes(c));
    });
  }

  function selectAllColumns() {
    setVisibleCols(null);
  }

  function selectMinimalColumns() {
    const all = columns || [];
    const minimal = [];

    ['NV', 'PARTIDA', 'PARANTES_Descripcion', 'Largo_Parantes', 'DATOS_Brazos', 'lado_mas_alto', 'calc_espada'].forEach(
      (k) => {
        if (all.includes(k)) minimal.push(k);
      }
    );

    setVisibleCols(minimal.length ? minimal : (all.includes('NV') ? ['NV'] : all.slice(0, 1)));
  }

  // =========================
  // Paginación (persistente)
  // =========================
  const [pageSize, setPageSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(LS_PAGE_SIZE_KEY));
      return Number.isFinite(v) && v > 0 ? v : 25;
    } catch {
      return 25;
    }
  });

  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PAGE_SIZE_KEY, String(pageSize));
    } catch {
      // ignore
    }
  }, [pageSize]);

  const total = totalRows ?? (rows?.length || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return (rows || []).slice(start, end);
  }, [rows, page, pageSize]);

  function goFirst() {
    setPage(1);
  }
  function goPrev() {
    setPage((p) => Math.max(1, p - 1));
  }
  function goNext() {
    setPage((p) => Math.min(totalPages, p + 1));
  }
  function goLast() {
    setPage(totalPages);
  }

  // =========================
  // Render
  // =========================
  return (
    <>
      {loading && <div className="info">Cargando datos...</div>}

      {!loading && !hasData && <div className="info">No hay datos para mostrar.</div>}

      {hasData && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {canEditData ? (
                <button type="button" className="save-btn" onClick={handleSaveClick}>
                  Guardar cambios
                </button>
              ) : (
                <span className="hint">Modo solo lectura</span>
              )}

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowColumnsMenu((v) => !v)}
              >
                {showColumnsMenu ? 'Ocultar columnas' : 'Columnas visibles'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="hint" style={{ whiteSpace: 'nowrap' }}>
                Filas: <b>{total}</b>
              </span>

              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="hint">Por página</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPageSize(Number.isFinite(v) && v > 0 ? v : 25);
                    setPage(1);
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </label>

              <button type="button" onClick={goFirst} disabled={page <= 1}>
                {'<<'}
              </button>
              <button type="button" onClick={goPrev} disabled={page <= 1}>
                {'<'}
              </button>

              <span style={{ whiteSpace: 'nowrap' }}>
                Página <b>{page}</b> / {totalPages}
              </span>

              <button type="button" onClick={goNext} disabled={page >= totalPages}>
                {'>'}
              </button>
              <button type="button" onClick={goLast} disabled={page >= totalPages}>
                {'>>'}
              </button>
            </div>
          </div>

          {showColumnsMenu && (
            <div
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 10,
                marginBottom: 10,
                background: '#fff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 8,
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>Propiedades visibles</b>

                  <button type="button" className="btn-small" onClick={selectAllColumns}>
                    Ver todas
                  </button>
                  <button type="button" className="btn-small" onClick={selectMinimalColumns}>
                    Ver mínimas
                  </button>

                  <span className="hint" style={{ whiteSpace: 'nowrap' }}>
                    Mostrando: <b>{effectiveColumns.length}</b> / {columns.length}
                  </span>
                </div>

                <input
                  type="text"
                  value={colSearch}
                  onChange={(e) => setColSearch(e.target.value)}
                  placeholder="Buscar propiedad…"
                  style={{ minWidth: 220 }}
                />
              </div>

              <div
                style={{
                  maxHeight: 220,
                  overflow: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 6,
                }}
              >
                {filteredColumnsForMenu.map((col) => {
                  const checked = Array.isArray(visibleCols) ? visibleCols.includes(col) : true;

                  return (
                    <label key={`colpick-${col}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleColumn(col)} />
                      <span style={{ fontFamily: 'monospace' }}>{col}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {effectiveColumns.map((col) => (
                    <th key={`${col}-formula`}>
                      <input
                        key={`input-${col}-${formulas[col] ?? ''}`}
                        className="formula-input-header"
                        type="text"
                        defaultValue={formulas[col] ?? ''}
                        disabled={!canEditFormulas}
                        ref={(el) => {
                          if (!formulaInputRefs.current) {
                            formulaInputRefs.current = {};
                          }
                          formulaInputRefs.current[col] = el;
                        }}
                        onKeyDown={(e) => {
                          if (!canEditFormulas) return;
                          handleFormulaKeyDown(e, col);
                        }}
                        placeholder={canEditFormulas ? 'fórmula' : 'solo lectura'}
                      />
                      {formulaErrors[col] && (
                        <div className="col-error" title={formulaErrors[col]}>
                          ⚠
                        </div>
                      )}
                    </th>
                  ))}
                </tr>

                <tr>
                  {effectiveColumns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pageRows.map((row, idx) => {
                  const globalIndex = (page - 1) * pageSize + idx;
                  const rowKey = getRowKey(row, globalIndex);

                  return (
                    <tr key={row.ID ?? row.NV ?? `${page}-${idx}`}>
                      {effectiveColumns.map((col) => {
                        const edited =
                          editedRef.current?.[rowKey] &&
                          Object.prototype.hasOwnProperty.call(editedRef.current[rowKey], col)
                            ? editedRef.current[rowKey][col]
                            : undefined;

                        return (
                          <td key={col}>
                            <input
                              className="cell-input"
                              key={`cell-${rowKey}-${col}-${formulas[col] ?? ''}`}
                              defaultValue={edited !== undefined ? edited : getDisplayValue(row, col)}
                              disabled={!canEditData}
                              onChange={(e) => handleCellChange(row, globalIndex, col, e.target.value)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <button type="button" onClick={goFirst} disabled={page <= 1}>
              {'<<'}
            </button>
            <button type="button" onClick={goPrev} disabled={page <= 1}>
              {'<'}
            </button>
            <span>
              Página <b>{page}</b> / {totalPages}
            </span>
            <button type="button" onClick={goNext} disabled={page >= totalPages}>
              {'>'}
            </button>
            <button type="button" onClick={goLast} disabled={page >= totalPages}>
              {'>>'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
