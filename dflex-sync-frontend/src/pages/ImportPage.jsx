// src/pages/ImportPage.jsx
import { useState } from 'react';
import * as XLSX from 'xlsx';

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

export default function ImportPage({ rows, columns }) {
  const hasData = rows && rows.length > 0;

  const [excelNvColumn, setExcelNvColumn] = useState('A');
  const [excelValueColumn, setExcelValueColumn] = useState('B');
  const [preFieldToCompare, setPreFieldToCompare] = useState('Nombre');

  const [importProcessing, setImportProcessing] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);

  async function handleExcelFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!hasData) {
      window.alert('Primero cargá datos de Pre_Producción (la tabla principal).');
      e.target.value = '';
      return;
    }

    setImportError('');
    setImportResult(null);
    setImportProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      const desiredSheetName = 'PRINCIPAL';
      const sheet = workbook.Sheets[desiredSheetName];

      if (!sheet) {
        window.alert('La hoja "PRINCIPAL" no existe en este archivo. Verificá el Excel.');
        setImportProcessing(false);
        return;
      }

      const rowsExcel = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        defval: '',
      });

      const dataRows = rowsExcel.slice(2); // desde fila 3

      // Mapa NV -> fila completa del listado
      const mapaPorNV = new Map();
      rows.forEach((r) => {
        const nvKey = String(r.NV ?? '').trim();
        if (!nvKey) return;
        mapaPorNV.set(nvKey, r);
      });

      const nvIndex = letterToIndex(excelNvColumn);
      const valueIndex = letterToIndex(excelValueColumn);

      const matches = [];
      const mismatches = [];
      const notFound = [];

      dataRows.forEach((excelRow, idx) => {
        const excelRowNumber = idx + 3; // nº real de fila

        const nvCell = excelRow[nvIndex];
        const valueCell = excelRow[valueIndex];

        if (nvCell == null && valueCell == null) return;

        const nvKey = String(nvCell ?? '').trim();
        const excelValue = String(valueCell ?? '').trim();

        if (!nvKey) return;

        const listadoRow = mapaPorNV.get(nvKey);

        if (!listadoRow) {
          notFound.push({
            rowNumber: excelRowNumber,
            nv: nvKey,
            excelValue,
          });
          return;
        }

        const listadoValue = String(
          listadoRow[preFieldToCompare] ?? ''
        ).trim();

        const excelNorm = excelValue.toUpperCase();
        const listadoNorm = listadoValue.toUpperCase();

        if (excelNorm === listadoNorm) {
          matches.push({
            rowNumber: excelRowNumber,
            nv: nvKey,
            excelValue,
            listadoValue,
          });
        } else {
          mismatches.push({
            rowNumber: excelRowNumber,
            nv: nvKey,
            excelValue,
            listadoValue,
          });
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
    } catch (err) {
      console.error('Error leyendo Excel:', err);
      setImportError(err.message || 'Error leyendo el archivo Excel');
    } finally {
      setImportProcessing(false);
    }
  }

  return (
    <div className="import-page">
      {!hasData && (
        <div className="info">
          Primero cargá datos en la tabla de Pre-Producción para poder comparar.
        </div>
      )}

      <div className="import-panel">
        <h2>Importar Excel y comparar</h2>

        <p className="hint">
          Subí un Excel donde, desde la fila <b>3</b> en adelante, se tomará:
          <br />
          • La columna definida como <b>NV</b> para buscar el número de venta.
          <br />
          • La columna definida como <b>Valor Excel</b> para comparar contra un
          campo del listado.
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
              <select
                value={preFieldToCompare}
                onChange={(e) => setPreFieldToCompare(e.target.value)}
              >
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
            disabled={importProcessing || !hasData}
          />
        </label>

        {importProcessing && <div className="info">Procesando Excel...</div>}
        {importError && <div className="error">⚠ {importError}</div>}
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
              NV: {importResult.excelNvColumn} | Valor Excel:{' '}
              {importResult.excelValueColumn} | Campo listado:{' '}
              {importResult.preFieldToCompare}
            </code>
          </p>
          <p>
            Filas Excel (desde fila 3): <b>{importResult.totalExcelRows}</b>
          </p>
          <p>
            <span className="badge badge-ok">
              Coincidencias: {importResult.matches.length}
            </span>
            <span className="badge badge-warn">
              NV no encontrados: {importResult.notFound.length}
            </span>
            <span className="badge badge-error">
              Diferencias de valor: {importResult.mismatches.length}
            </span>
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
                      <th>
                        Valor listado ({importResult.preFieldToCompare})
                      </th>
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

          {importResult.mismatches.length === 0 &&
            importResult.notFound.length === 0 && (
              <div className="info">Todo coincide ✔</div>
            )}
        </div>
      )}
    </div>
  );
}
