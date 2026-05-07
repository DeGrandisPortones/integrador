// src/pages/IpanelsPage.jsx
import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function formatDate(v) {
  const raw = toStr(v);
  if (!raw) return '';

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);

  return d.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(v) {
  const raw = toStr(v);
  if (!raw) return '';

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(value) {
  const v = toStr(value).toLowerCase();
  if (v === 'finalizado') return 'chip chip-ok';
  if (v === 'en proceso') return 'chip chip-warn';
  return 'chip';
}

function StatusChip({ value }) {
  const label = toStr(value) || 'Pendiente';
  return <span className={statusClass(label)}>{label}</span>;
}

export default function IpanelsPage({ authHeader, canSyncIpanel }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncResult, setSyncResult] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [filter, setFilter] = useState('');

  const headers = useMemo(() => authHeader || {}, [authHeader]);

  function buildParams(extra = {}) {
    const params = new URLSearchParams();
    params.set('limit', String(extra.limit || 1000));

    const f = toStr(extra.filter ?? filter);
    if (f) {
      // El backend acepta ambas claves; como para ipanel usamos numero -> partida/nv,
      // mandamos las dos para que el filtro funcione sin obligar al usuario a distinguir.
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

  async function loadIpanels(nextFilter = filter) {
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
      setError(e.message || 'Error cargando ipanels');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIpanels('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    await loadIpanels(filter.trim());
  }

  async function handleSync() {
    if (!canSyncIpanel) {
      window.alert('No tenes permisos para sincronizar ipanels (solo admin).');
      return;
    }

    const f = toStr(filter);
    const msg = f
      ? `Sincronizar ipanel ${f} desde SQL Server hacia Supabase?`
      : 'Sincronizar ipanels desde SQL Server hacia Supabase?';

    const ok = window.confirm(msg);
    if (!ok) return;

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
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });

      const payloadText = await res.text();
      let payload = null;
      try {
        payload = payloadText ? JSON.parse(payloadText) : null;
      } catch {
        payload = { raw: payloadText };
      }

      if (!res.ok && res.status !== 207) {
        const msgError = payload?.error || payload?.details || payloadText || `HTTP ${res.status}`;
        throw new Error(msgError);
      }

      setSyncResult(payload || {});
      await loadIpanels(f);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error sincronizando ipanels');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Filtrar por partida / NV</div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Ej: 1019"
              style={{ minWidth: 180 }}
            />
          </div>

          <button type="submit" disabled={loading || syncing}>
            {loading ? 'Cargando...' : 'Buscar'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFilter('');
              setSyncResult(null);
              loadIpanels('');
            }}
            disabled={loading || syncing}
          >
            Limpiar
          </button>
        </form>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastSyncAt ? (
            <div className="info">Ultima sync: {formatDateTime(lastSyncAt)}</div>
          ) : (
            <div className="info">Sin sync registrada</div>
          )}

          <button type="button" onClick={handleSync} disabled={!canSyncIpanel || loading || syncing}>
            {syncing ? 'Sincronizando...' : 'Sincronizar ipanels'}
          </button>
        </div>
      </div>

      {!canSyncIpanel && (
        <div className="info" style={{ marginTop: 8 }}>
          Nota: solo admin puede sincronizar ipanels desde SQL Server.
        </div>
      )}

      {syncResult && (
        <div className="info" style={{ marginTop: 8 }}>
          Sync finalizada: importados {syncResult.imported ?? 0}, nuevos {syncResult.inserted ?? 0}, actualizados{' '}
          {syncResult.updated ?? 0}, omitidos {syncResult.skipped ?? 0}
          {Array.isArray(syncResult.errors) && syncResult.errors.length ? `, errores ${syncResult.errors.length}` : ''}.
        </div>
      )}

      {error && <div className="error">⚠ {error}</div>}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Partida</th>
              <th>NV</th>
              <th>Fecha NV</th>
              <th>Plan entrega</th>
              <th>Diseño</th>
              <th>Guillotina</th>
              <th>Plegado</th>
              <th>Pintura</th>
              <th>Inyección</th>
              <th>Despacho</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, idx) => {
              const key = r?.id ? `id-${r.id}` : r?.partida ? `partida-${r.partida}` : `row-${idx}`;

              return (
                <tr key={key}>
                  <td>{toStr(r?.partida)}</td>
                  <td>{toStr(r?.nv)}</td>
                  <td>{formatDate(r?.fecha_nv)}</td>
                  <td>{formatDate(r?.fecha_plan_entrega)}</td>
                  <td><StatusChip value={r?.diseno} /></td>
                  <td><StatusChip value={r?.guillotina} /></td>
                  <td><StatusChip value={r?.plegado} /></td>
                  <td><StatusChip value={r?.pintura} /></td>
                  <td><StatusChip value={r?.inyeccion} /></td>
                  <td><StatusChip value={r?.despacho} /></td>
                  <td title={toStr(r?.observaciones)} style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>
                    {toStr(r?.observaciones)}
                  </td>
                </tr>
              );
            })}

            {!loading && (!rows || !rows.length) && (
              <tr>
                <td colSpan={11} style={{ padding: 16, textAlign: 'center', opacity: 0.8 }}>
                  No hay ipanels para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .chip{
          display:inline-block;
          padding:2px 8px;
          border-radius:999px;
          font-size:12px;
          border:1px solid rgba(255,255,255,0.18);
          white-space:nowrap;
        }
        .chip-ok{ }
        .chip-warn{ }
      `}</style>
    </div>
  );
}
