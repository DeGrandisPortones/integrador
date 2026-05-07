// src/pages/IpanelsPage.jsx
import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const SIMPLE_OPTIONS = ['', 'MADERA', 'ALUMINIO', 'PINTURA', 'OTRO'];

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function formatDate(v) {
  const raw = toStr(v);
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(v) {
  const raw = toStr(v);
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getProductoDescripcion(row) {
  return toStr(row?.producto_descripcion ?? row?.producto_descripciones ?? row?.descripcion_producto ?? row?.descripcion);
}

function getDescripcionSimple(row) {
  return toStr(row?.DescripcionSimple ?? row?.descripcion_simple);
}

function joinObs(row) {
  const parts = [];
  const observ = toStr(row?.observ);
  const obs = toStr(row?.obs);
  const oc = toStr(row?.oc);
  const idpedido = toStr(row?.idpedido);
  const producto = getProductoDescripcion(row);

  if (producto) parts.push(`Producto: ${producto}`);
  if (observ) parts.push(`Observ: ${observ}`);
  if (obs) parts.push(`Obs: ${obs}`);
  if (oc) parts.push(`OC: ${oc}`);
  if (idpedido) parts.push(`ID pedido: ${idpedido}`);

  return parts.join('\n');
}

function SimpleBadge({ value }) {
  const v = toStr(value);
  if (!v) return <span style={{ opacity: 0.55 }}>Sin asignar</span>;
  return (
    <span style={{ padding: '3px 8px', borderRadius: 999, background: '#e0f2fe', color: '#075985', fontWeight: 800, whiteSpace: 'nowrap' }}>
      {v}
    </span>
  );
}

export default function IpanelsPage({ authHeader, canSyncIpanel }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncResult, setSyncResult] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [filter, setFilter] = useState('');

  const [showSimplePanel, setShowSimplePanel] = useState(false);
  const [catalogRows, setCatalogRows] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [simpleDrafts, setSimpleDrafts] = useState({});
  const [savingMappingKey, setSavingMappingKey] = useState('');

  const headers = useMemo(() => authHeader || {}, [authHeader]);

  function buildParams(extra = {}) {
    const params = new URLSearchParams();
    params.set('limit', String(extra.limit || 1000));
    const f = toStr(extra.filter ?? filter);
    if (f) {
      params.set('partida', f);
      params.set('nv', f);
    }
    return params;
  }

  async function loadLastSync() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ipanel/last-sync`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setLastSyncAt(data?.lastSyncAt || null);
    } catch (e) {
      console.warn('No se pudo leer ultima sincronizacion ipanel:', e?.message || e);
    }
  }

  async function loadIpanelsFromSql(nextFilter = filter) {
    try {
      setLoading(true);
      setError('');
      const qs = buildParams({ filter: nextFilter }).toString();
      const res = await fetch(`${API_BASE_URL}/api/ipanel?${qs}`, { headers });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      await loadLastSync();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error cargando ipanels desde SQL');
    } finally {
      setLoading(false);
    }
  }

  async function loadDescripcionCatalog() {
    try {
      setCatalogLoading(true);
      setCatalogError('');
      const res = await fetch(`${API_BASE_URL}/api/ipanel/descripcion-simple/catalog?limit=10000`, { headers });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = await res.json();
      const arr = Array.isArray(data.rows) ? data.rows : [];
      setCatalogRows(arr);
      const drafts = {};
      for (const r of arr) drafts[r.descripcion] = toStr(r.descripcion_simple);
      setSimpleDrafts(drafts);
    } catch (e) {
      console.error(e);
      setCatalogError(e.message || 'Error cargando catalogo DescripcionSimple');
    } finally {
      setCatalogLoading(false);
    }
  }

  async function saveDescripcionSimple(descripcion) {
    const desc = toStr(descripcion);
    if (!desc) return;

    try {
      setSavingMappingKey(desc);
      setCatalogError('');
      const value = toStr(simpleDrafts[desc]);
      const res = await fetch(`${API_BASE_URL}/api/ipanel/descripcion-simple/mapping`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ descripcion: desc, descripcion_simple: value || null }),
      });
      const text = await res.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
      if (!res.ok) throw new Error(payload?.details || payload?.error || text || `HTTP ${res.status}`);
      await loadDescripcionCatalog();
      await loadIpanelsFromSql(filter.trim());
    } catch (e) {
      console.error(e);
      setCatalogError(e.message || 'Error guardando DescripcionSimple');
    } finally {
      setSavingMappingKey('');
    }
  }

  async function syncIpanels({ ask = true, nextFilter = filter } = {}) {
    const f = toStr(nextFilter);

    if (ask && !canSyncIpanel) {
      window.alert('No tenes permisos para sincronizar ipanels (solo admin).');
      return null;
    }

    if (ask) {
      const msg = f ? `Sincronizar ipanel ${f} desde SQL Server hacia Supabase?` : 'Sincronizar ipanels desde SQL Server hacia Supabase?';
      const ok = window.confirm(msg);
      if (!ok) return null;
    }

    try {
      setSyncing(true);
      setError('');
      setSyncResult(null);
      const body = { limit: 10000 };
      if (f) {
        body.partida = f;
        body.nv = f;
      }

      const res = await fetch(`${API_BASE_URL}/api/sync/ipanel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });

      const payloadText = await res.text();
      let payload = null;
      try { payload = payloadText ? JSON.parse(payloadText) : null; } catch { payload = { raw: payloadText }; }

      if (!res.ok && res.status !== 207) {
        const msgError = payload?.error || payload?.details || payloadText || `HTTP ${res.status}`;
        throw new Error(msgError);
      }

      setSyncResult(payload || {});
      await loadLastSync();
      return payload || {};
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error sincronizando ipanels');
      return null;
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadIpanelsFromSql('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showSimplePanel) loadDescripcionCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSimplePanel]);

  async function handleSearch(e) {
    e.preventDefault();
    await loadIpanelsFromSql(filter.trim());
  }

  async function handleSync() {
    const result = await syncIpanels({ ask: true, nextFilter: filter });
    if (result) await loadIpanelsFromSql(filter.trim());
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Filtrar por partida / NV</div>
            <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Ej: 1019" style={{ minWidth: 180 }} />
          </div>

          <button type="submit" disabled={loading || syncing}>{loading ? 'Cargando...' : 'Buscar'}</button>

          <button type="button" className="btn-secondary" onClick={() => { setFilter(''); setSyncResult(null); loadIpanelsFromSql(''); }} disabled={loading || syncing}>
            Limpiar
          </button>
        </form>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="info">Listado directo desde SQL Server</div>
          {lastSyncAt ? <div className="info">Ultima sync Supabase: {formatDateTime(lastSyncAt)}</div> : <div className="info">Sin sync registrada</div>}

          <button type="button" className="btn-secondary" onClick={() => setShowSimplePanel((v) => !v)} disabled={loading || syncing}>
            {showSimplePanel ? 'Ocultar DescripcionSimple' : 'Configurar DescripcionSimple'}
          </button>

          <button type="button" onClick={handleSync} disabled={!canSyncIpanel || loading || syncing}>
            {syncing ? 'Sincronizando...' : 'Sincronizar ipanels'}
          </button>
        </div>
      </div>

      <div className="info" style={{ marginTop: 8 }}>
        Esta pantalla muestra la data de Paneles.dbo.NTASVTAS, suma PRODUCTOS.descripcion y permite mapearla a DescripcionSimple para el workflow.
      </div>

      {!canSyncIpanel && <div className="info" style={{ marginTop: 8 }}>Nota: solo admin puede sincronizar y guardar mapeos.</div>}

      {showSimplePanel && (
        <div style={{ marginTop: 12, border: '1px solid #d1d5db', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Mapeo de descripcion a DescripcionSimple</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Elegi qué valores de descripcion se guardan como MADERA, ALUMINIO, etc. Esto se guarda en Supabase y se aplica en la sincronizacion.
              </div>
            </div>
            <button type="button" className="btn-secondary" onClick={loadDescripcionCatalog} disabled={catalogLoading || syncing}>
              {catalogLoading ? 'Actualizando...' : 'Actualizar lista'}
            </button>
          </div>

          {catalogError && <div className="error" style={{ marginTop: 8 }}>⚠ {catalogError}</div>}

          <div className="table-wrap" style={{ marginTop: 10, maxHeight: 420, overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Descripcion</th>
                  <th>Cantidad</th>
                  <th>DescripcionSimple</th>
                  <th>Guardar</th>
                </tr>
              </thead>
              <tbody>
                {(catalogRows || []).map((r) => {
                  const desc = toStr(r.descripcion);
                  const value = Object.prototype.hasOwnProperty.call(simpleDrafts, desc)
                    ? simpleDrafts[desc]
                    : toStr(r.descripcion_simple);
                  return (
                    <tr key={desc}>
                      <td style={{ minWidth: 420, maxWidth: 760, whiteSpace: 'pre-wrap' }}>{desc}</td>
                      <td>{r.count ?? ''}</td>
                      <td>
                        <select
                          value={value || ''}
                          onChange={(e) => setSimpleDrafts((prev) => ({ ...prev, [desc]: e.target.value }))}
                          disabled={!canSyncIpanel || savingMappingKey === desc}
                        >
                          {SIMPLE_OPTIONS.map((opt) => (
                            <option key={opt || 'blank'} value={opt}>{opt || '(sin asignar)'}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button type="button" onClick={() => saveDescripcionSimple(desc)} disabled={!canSyncIpanel || savingMappingKey === desc}>
                          {savingMappingKey === desc ? 'Guardando...' : 'Guardar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!catalogLoading && (!catalogRows || !catalogRows.length) && (
                  <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', opacity: 0.8 }}>No hay descripciones para mapear.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {syncResult && (
        <div className="info" style={{ marginTop: 8 }}>
          Sync finalizada: filas SQL {syncResult.totalSqlRows ?? 0}, importados {syncResult.imported ?? 0}, nuevos {syncResult.inserted ?? 0}, actualizados {syncResult.updated ?? 0}, omitidos {syncResult.skipped ?? 0}
          {Array.isArray(syncResult.errors) && syncResult.errors.length ? `, errores ${syncResult.errors.length}` : ''}.
        </div>
      )}

      {error && <div className="error">⚠ {error}</div>}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Sucursal</th>
              <th>Numero / Partida</th>
              <th>Deposito</th>
              <th>Producto / descripcion</th>
              <th>DescripcionSimple</th>
              <th>Cliente</th>
              <th>Nombre</th>
              <th>Direccion</th>
              <th>Localidad</th>
              <th>Provincia</th>
              <th>Fecha entrega</th>
              <th>Forma pago</th>
              <th>Vendedor</th>
              <th>Operador</th>
              <th>OC</th>
              <th>ID pedido</th>
              <th>Factura</th>
              <th>Remito</th>
              <th>Observaciones SQL</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, idx) => {
              const key = r?.idpedido ? `idpedido-${r.idpedido}` : r?.numero ? `numero-${r.numero}-${idx}` : `row-${idx}`;
              const obsText = joinObs(r) || toStr(r?.observaciones);
              const productoDescripcion = getProductoDescripcion(r);
              const descripcionSimple = getDescripcionSimple(r);
              return (
                <tr key={key}>
                  <td>{formatDate(r?.fecha)}</td>
                  <td>{toStr(r?.tipo)}</td>
                  <td>{toStr(r?.sucursal)}</td>
                  <td>{toStr(r?.numero ?? r?.partida)}</td>
                  <td>{toStr(r?.deposito)}</td>
                  <td title={productoDescripcion} style={{ minWidth: 260, maxWidth: 520, whiteSpace: 'pre-wrap' }}>{productoDescripcion}</td>
                  <td><SimpleBadge value={descripcionSimple} /></td>
                  <td>{toStr(r?.cliente)}</td>
                  <td>{toStr(r?.nombre)}</td>
                  <td>{toStr(r?.direccion)}</td>
                  <td>{toStr(r?.localidad)}</td>
                  <td>{toStr(r?.provincia)}</td>
                  <td>{formatDate(r?.fechaent ?? r?.fecha_plan_entrega)}</td>
                  <td>{toStr(r?.fpago)}</td>
                  <td>{toStr(r?.vendedor)}</td>
                  <td>{toStr(r?.operador)}</td>
                  <td>{toStr(r?.oc)}</td>
                  <td>{toStr(r?.idpedido)}</td>
                  <td>{toStr(r?.factura)}</td>
                  <td>{toStr(r?.remito)}</td>
                  <td title={obsText} style={{ minWidth: 260, maxWidth: 420, whiteSpace: 'pre-wrap' }}>{obsText}</td>
                </tr>
              );
            })}
            {!loading && (!rows || !rows.length) && (
              <tr>
                <td colSpan={21} style={{ padding: 16, textAlign: 'center', opacity: 0.8 }}>No hay ipanels para mostrar desde SQL.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
