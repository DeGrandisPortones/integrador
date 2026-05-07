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

function joinObs(row) {
  const parts = [];
  const observ = toStr(row?.observ);
  const obs = toStr(row?.obs);
  const oc = toStr(row?.oc);
  const idpedido = toStr(row?.idpedido);

  if (observ) parts.push(`Observ: ${observ}`);
  if (obs) parts.push(`Obs: ${obs}`);
  if (oc) parts.push(`OC: ${oc}`);
  if (idpedido) parts.push(`ID pedido: ${idpedido}`);

  return parts.join('\n');
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

  async function syncIpanels({ ask = true, nextFilter = filter } = {}) {
    const f = toStr(nextFilter);

    if (ask && !canSyncIpanel) {
      window.alert('No tenes permisos para sincronizar ipanels (solo admin).');
      return null;
    }

    if (ask) {
      const msg = f
        ? `Sincronizar ipanel ${f} desde SQL Server hacia Supabase?`
        : 'Sincronizar ipanels desde SQL Server hacia Supabase?';
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
    // La sincronizacion automatica global se dispara desde App.jsx al entrar al integrador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              loadIpanelsFromSql('');
            }}
            disabled={loading || syncing}
          >
            Limpiar
          </button>
        </form>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="info">Listado directo desde SQL Server</div>

          {lastSyncAt ? (
            <div className="info">Ultima sync Supabase: {formatDateTime(lastSyncAt)}</div>
          ) : (
            <div className="info">Sin sync registrada</div>
          )}

          <button type="button" onClick={handleSync} disabled={!canSyncIpanel || loading || syncing}>
            {syncing ? 'Sincronizando...' : 'Sincronizar ipanels'}
          </button>
        </div>
      </div>

      <div className="info" style={{ marginTop: 8 }}>
        Esta pantalla muestra la data cruda que viene de Paneles.dbo.NTASVTAS. Al entrar al integrador se sincroniza SQL -> Supabase automaticamente.
      </div>

      {!canSyncIpanel && (
        <div className="info" style={{ marginTop: 8 }}>
          Nota: solo admin puede lanzar la sincronizacion manual.
        </div>
      )}

      {syncResult && (
        <div className="info" style={{ marginTop: 8 }}>
          Sync finalizada: filas SQL {syncResult.totalSqlRows ?? 0}, importados {syncResult.imported ?? 0}, nuevos{' '}
          {syncResult.inserted ?? 0}, actualizados {syncResult.updated ?? 0}, omitidos {syncResult.skipped ?? 0}
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
              const key = r?.idpedido
                ? `idpedido-${r.idpedido}`
                : r?.numero
                  ? `numero-${r.numero}-${idx}`
                  : `row-${idx}`;
              const obsText = joinObs(r) || toStr(r?.observaciones);

              return (
                <tr key={key}>
                  <td>{formatDate(r?.fecha)}</td>
                  <td>{toStr(r?.tipo)}</td>
                  <td>{toStr(r?.sucursal)}</td>
                  <td>{toStr(r?.numero ?? r?.partida)}</td>
                  <td>{toStr(r?.deposito)}</td>
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
                  <td title={obsText} style={{ minWidth: 260, maxWidth: 420, whiteSpace: 'pre-wrap' }}>
                    {obsText}
                  </td>
                </tr>
              );
            })}

            {!loading && (!rows || !rows.length) && (
              <tr>
                <td colSpan={19} style={{ padding: 16, textAlign: 'center', opacity: 0.8 }}>
                  No hay ipanels para mostrar desde SQL.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
