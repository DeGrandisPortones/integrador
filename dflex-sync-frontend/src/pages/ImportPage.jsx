// src/pages/ImportPage.jsx
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function letterToIndex(letter) {
  if (!letter) return 0;
  const trimmed = letter.trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 65 || code > 90) {
      return 0; // por si meten algo raro, caemos en A
    }
    index = index * 26 + (code - 64);
  }
  return index - 1; // 0-based
}

export default function ImportPage({ rows, columns, authHeader }) {
  const hasData = rows && rows.length > 0;

  const [excelNvColumn, setExcelNvColumn] = useState('A');
  const [excelValueColumn, setExcelValueColumn] = useState('B');
  const [preFieldToCompare, setPreFieldToCompare] = useState('Nombre');

  const [importProcessing, setImportProcessing] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);

  // ✅ Nuevo: archivo seleccionado + updates preparados (A->NV, L->Descripcion)
  const [selectedFile, setSelectedFile] = useState(null);
  const [descUpdates, setDescUpdates] = useState([]); // [{ nv, descripcion }]
  const [descNotFound, setDescNotFound] = useState([]); // [{ rowNumber, nv, descripcion }]
  const [descDuplicates, setDescDuplicates] = useState(0);

  const [applyProcessing, setApplyProcessing] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyResult, setApplyResult] = useState(null);

  const mapaPorNV = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => {
      const nvKey = String(r.NV ?? '').trim();
      if (!nvKey) return;
      m.set(nvKey, r);
    });
    return m;
  }, [rows]);

  async function readPrincipalSheet(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const desiredSheetName = 'PRINCIPAL';
    const sheet = workbook.Sheets[desiredSheetName];

    if (!sheet) {
      throw new Error('La hoja "PRINCIPAL" no existe en este archivo. Verificá el Excel.');
    }

    const rowsExcel = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    // desde fila 3
    const dataRows = rowsExcel.slice(2);
    return dataRows;
  }

  function buildDescripcionUpdatesFromExcel(dataRows) {
    // Requisito: NV en columna A (desde fila 3) y Descripcion en columna L
    const nvIndex = letterToIndex('A'); // 0
    const descIndex = letterToIndex('L'); // 11

    const byNv = new Map(); // nv -> { nv, descripcion }
    const notFound = [];
    let duplicates = 0;

    dataRows.forEach((excelRow, idx) => {
      const excelRowNumber = idx + 3;

      const nvCell = excelRow[nvIndex];
      const descCell = excelRow[descIndex];

      if (nvCell == null && descCell == null) return;

      const nvKey = String(nvCell ?? '').trim();
      const descripcion = String(descCell ?? '').trim();

      if (!nvKey) return;

      // Por defecto: si L viene vacío, NO pisamos Descripcion
      if (!descripcion) return;

      const existeEnBase = mapaPorNV.has(nvKey);

      if (!existeEnBase) {
        notFound.push({ rowNumber: excelRowNumber, nv: nvKey, descripcion });
        return;
      }

      if (byNv.has(nvKey)) duplicates += 1;
      byNv.set(nvKey, { nv: nvKey, descripcion });
    });

    return {
      updates: Array.from(byNv.values()),
      notFound,
      duplicates,
    };
  }

  async function handleExcelFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!hasData) {
      window.alert('Primero cargá datos de Pre_Producción (la tabla principal).');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    setImportError('');
    setImportResult(null);
    setImportProcessing(true);

    setApplyError('');
    setApplyResult(null);
    setDescUpdates([]);
    setDescNotFound([]);
    setDescDuplicates(0);

    try {
      const dataRows = await readPrincipalSheet(file);

      // ======================
      // Comparación (lo actual)
      // ======================
      const nvIndex = letterToIndex(excelNvColumn);
      const valueIndex = letterToIndex(excelValueColumn);

      const matches = [];
      const mismatches = [];
      const notFound = [];

      dataRows.forEach((excelRow, idx) => {
        const excelRowNumber = idx + 3;

        const nvCell = excelRow[nvIndex];
        const valueCell = excelRow[valueIndex];

        if (nvCell == null && valueCell == null) return;

        const nvKey = String(nvCell ?? '').trim();
        const excelValue = String(valueCell ?? '').trim();

        if (!nvKey) return;

        const listadoRow = mapaPorNV.get(nvKey);

        if (!listadoRow) {
          notFound.push({ rowNumber: excelRowNumber, nv: nvKey, excelValue });
          return;
        }

        const listadoValue = String(listadoRow[preFieldToCompare] ?? '').trim();

        const excelNorm = excelValue.toUpperCase();
        const listadoNorm = listadoValue.toUpperCase();

        if (excelNorm === listadoNorm) {
          matches.push({ rowNumber: excelRowNumber, nv: nvKey, excelValue, listadoValue });
        } else {
          mismatches.push({ rowNumber: excelRowNumber, nv: nvKey, excelValue, listadoValue });
        }
      });

      setImportResult({
        totalExcelRows: dataRows.length,
        matches,
        mismatches,
        notFound,
        fileName: file.name,
        excelNvColumn,
        excelValueColumn,
        preFieldToCompare,
      });

      // ==========================================
      // ✅ Preparar updates Descripcion (A -> NV, L -> Descripcion)
      // ==========================================
      const prep = buildDescripcionUpdatesFromExcel(dataRows);
      setDescUpdates(prep.updates);
      setDescNotFound(prep.notFound);
      setDescDuplicates(prep.duplicates);
    } catch (err) {
      console.error('Error leyendo Excel:', err);
      setImportError(err.message || 'Error leyendo el archivo Excel');
    } finally {
      setImportProcessing(false);
    }
  }

  async function applyDescripcionFromExcel() {
    if (!selectedFile) {
      window.alert('Primero seleccioná un Excel.');
      return;
    }
    if (!hasData) {
      window.alert('Primero cargá datos de Pre_Producción (la tabla principal).');
      return;
    }
    if (!authHeader?.Authorization) {
      window.alert('No hay sesión válida (falta Authorization). Volvé a iniciar sesión.');
      return;
    }

    const total = descUpdates.length;

    if (!total) {
      window.alert('No hay actualizaciones para aplicar (o la columna L está vacía / NV no existe).');
      return;
    }

    const ok = window.confirm(
      `Se van a aplicar ${total} actualizaciones:\n\n- NV (col A) debe existir en la base\n- Descripcion se toma de col L (desde fila 3)\n- Filas con L vacío NO pisan Descripcion\n\n¿Confirmás aplicar?`
    );
    if (!ok) return;

    setApplyProcessing(true);
    setApplyError('');
    setApplyResult(null);

    try {
      // Armamos payload para bulk-update: [{ nv, changes: { Descripcion: "..." } }]
      const updatesPayload = descUpdates.map((u) => ({
        nv: u.nv,
        changes: { Descripcion: u.descripcion },
      }));

      // Chunk para evitar requests gigantes (ajustable)
      const CHUNK = 200;
      let applied = 0;
      let skipped = 0;

      for (let i = 0; i < updatesPayload.length; i += CHUNK) {
        const chunk = updatesPayload.slice(i, i + CHUNK);

        const res = await fetch(`${API_BASE_URL}/api/pre-produccion-valores/bulk-update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader || {}),
          },
          body: JSON.stringify({ updates: chunk }),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`HTTP ${res.status}: ${txt}`);
        }

        const data = await res.json();
        applied += Number(data?.applied || 0);
        skipped += Number(data?.skipped || 0);
      }

      setApplyResult({
        fileName: selectedFile.name,
        totalPrepared: updatesPayload.length,
        applied,
        skipped,
        notFoundCount: descNotFound.length,
        duplicatesCount: descDuplicates,
      });

      window.alert('Descripcion aplicada. Si querés ver los cambios, recargá o volvé a la tabla.');
    } catch (err) {
      console.error('Error aplicando Descripcion:', err);
      setApplyError(err.message || 'Error aplicando Descripcion');
    } finally {
      setApplyProcessing(false);
    }
  }

  return (
    <div className="import-page">
      {!hasData && (
        <div className="info">Primero cargá datos en la tabla de Pre-Producción para poder comparar.</div>
      )}

      <div className="import-panel">
        <h2>Importar Excel y comparar</h2>

        <p className="hint">
          Subí un Excel donde, desde la fila <b>3</b> en adelante, se tomará:
          <br />
          • La columna definida como <b>NV</b> para buscar el número de venta.
          <br />
          • La columna definida como <b>Valor Excel</b> para comparar contra un campo del listado.
          <br />
          Siempre se usa la hoja <code>PRINCIPAL</code> del archivo.
        </p>

        <div className="import-config">
          <div className="import-field">
            <label>
              Columna NV (Excel):
              <input
                type="text"
                value={excelNvColumn}
                onChange={(e) => setExcelNvColumn(e.target.value)}
                maxLength={3}
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <span className="hint-small">Ej: A</span>
          </div>

          <div className="import-field">
            <label>
              Columna valor a comparar (Excel):
              <input
                type="text"
                value={excelValueColumn}
                onChange={(e) => setExcelValueColumn(e.target.value)}
                maxLength={3}
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <span className="hint-small">Ej: B</span>
          </div>

          <div className="import-field">
            <label>
              Campo del listado a comparar:
              <select value={preFieldToCompare} onChange={(e) => setPreFieldToCompare(e.target.value)}>
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label className="import-file-label">
          Archivo Excel:
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelFileChange}
            disabled={importProcessing || !hasData || applyProcessing}
          />
        </label>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          {/* ✅ Botón nuevo */}
          <button
            type="button"
            className="btn-secondary"
            onClick={applyDescripcionFromExcel}
            disabled={!hasData || importProcessing || applyProcessing || !selectedFile}
            title='Toma NV de columna A y setea "Descripcion" con columna L (desde fila 3)'
          >
            {applyProcessing ? 'Aplicando Descripcion…' : 'Aplicar Descripcion (A→NV, L→Descripcion)'}
          </button>

          {selectedFile && (
            <span className="hint-small" style={{ whiteSpace: 'nowrap' }}>
              Archivo seleccionado: <b>{selectedFile.name}</b>
            </span>
          )}
        </div>

        {importProcessing && <div className="info">Procesando Excel...</div>}
        {importError && <div className="error">⚠ {importError}</div>}

        {/* ✅ Estado preparación para aplicar Descripcion */}
        {!importProcessing && selectedFile && !importError && (
          <div className="hint" style={{ marginTop: 10 }}>
            Preparado para aplicar Descripcion: <b>{descUpdates.length}</b> NV encontrados (col A) con Descripcion no vacía
            (col L).
            {descDuplicates > 0 && (
              <>
                {' '}
                Duplicados en Excel: <b>{descDuplicates}</b> (se usa el último).
              </>
            )}
            {descNotFound.length > 0 && (
              <>
                {' '}
                NV de Excel no encontrados en base: <b>{descNotFound.length}</b>.
              </>
            )}
          </div>
        )}

        {applyError && <div className="error">⚠ {applyError}</div>}

        {applyResult && (
          <div className="info" style={{ marginTop: 10 }}>
            <b>Aplicación completada</b>
            <div>Archivo: {applyResult.fileName}</div>
            <div>Preparados: {applyResult.totalPrepared}</div>
            <div>Applied (backend): {applyResult.applied}</div>
            <div>Skipped (backend): {applyResult.skipped}</div>
            <div>NV no encontrados (según Excel): {applyResult.notFoundCount}</div>
            <div>Duplicados (según Excel): {applyResult.duplicatesCount}</div>
          </div>
        )}
      </div>

      {importResult && (
        <div className="import-summary">
          <h2>Resultado de la comparación</h2>
          <p>
            Archivo: <b>{importResult.fileName}</b>
          </p>
          <p>
            Configuración usada:&nbsp;
            <code>
              NV: {importResult.excelNvColumn} | Valor Excel: {importResult.excelValueColumn} | Campo listado:{' '}
              {importResult.preFieldToCompare}
            </code>
          </p>
          <p>
            Filas Excel (desde fila 3): <b>{importResult.totalExcelRows}</b>
          </p>
          <p>
            <span className="badge badge-ok">Coincidencias: {importResult.matches.length}</span>
            <span className="badge badge-warn">NV no encontrados: {importResult.notFound.length}</span>
            <span className="badge badge-error">Diferencias de valor: {importResult.mismatches.length}</span>
          </p>

          {importResult.mismatches.length > 0 && (
            <>
              <h3>Diferencias (NV encontrado pero valor distinto)</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fila Excel</th>
                      <th>NV</th>
                      <th>Valor (Excel)</th>
                      <th>Valor listado ({importResult.preFieldToCompare})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.mismatches.map((m) => (
                      <tr key={`mm-${m.rowNumber}-${m.nv}`}>
                        <td>{m.rowNumber}</td>
                        <td>{m.nv}</td>
                        <td>{m.excelValue}</td>
                        <td>{m.listadoValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {importResult.notFound.length > 0 && (
            <>
              <h3>NV que están en Excel pero no en el listado</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fila Excel</th>
                      <th>NV</th>
                      <th>Valor (Excel)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.notFound.map((m) => (
                      <tr key={`nf-${m.rowNumber}-${m.nv}`}>
                        <td>{m.rowNumber}</td>
                        <td>{m.nv}</td>
                        <td>{m.excelValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {importResult.mismatches.length === 0 && importResult.notFound.length === 0 && (
            <div className="info">Todo coincide ✔</div>
          )}
        </div>
      )}
    </div>
  );
}
