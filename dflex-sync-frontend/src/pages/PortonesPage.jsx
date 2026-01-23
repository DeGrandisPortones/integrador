// src/pages/PortonesPage.jsx
import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export default function PortonesPage({ authHeader, canSyncOdoo }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nvFilter, setNvFilter] = useState('');

  const [sendingByNv, setSendingByNv] = useState(() => ({})); // { [NV]: 'idle'|'sending'|'ok'|'err' }
  const [resultByNv, setResultByNv] = useState(() => ({})); // { [NV]: { order_id, amount_total } }
  const [errorByNv, setErrorByNv] = useState(() => ({})); // { [NV]: '...' }

  const headers = useMemo(() => authHeader || {}, [authHeader]);

  async function loadPortones(nv) {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams();
      if (nv) params.set('nv', nv);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_BASE_URL}/api/portones${qs}`, { headers });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }

      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error cargando portones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEnviarOdoo(row) {
    const nv = row?.NV;
    if (!nv) return;

    if (!canSyncOdoo) {
      window.alert('No tenés permisos para enviar a Odoo (solo admin).');
      return;
    }

    const ok = window.confirm(`¿Enviar NV ${nv} a Odoo para generar cotización?`);
    if (!ok) return;

    setSendingByNv((m) => ({ ...m, [nv]: 'sending' }));
    setErrorByNv((m) => ({ ...m, [nv]: '' }));
    setResultByNv((m) => ({ ...m, [nv]: null }));

    try {
      const res = await fetch(`${API_BASE_URL}/api/sync/order-from-nv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ nv }),
      });

      const payloadText = await res.text();
      let payload = null;
      try {
        payload = payloadText ? JSON.parse(payloadText) : null;
      } catch {
        payload = { raw: payloadText };
      }

      if (!res.ok) {
        const msg = payload?.error || payload?.details || payloadText || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setSendingByNv((m) => ({ ...m, [nv]: 'ok' }));
      setResultByNv((m) => ({
        ...m,
        [nv]: {
          order_id: payload?.order_id,
          amount_total: payload?.amount_total,
          created_lines: payload?.created_lines,
        },
      }));
    } catch (e) {
      console.error(e);
      setSendingByNv((m) => ({ ...m, [nv]: 'err' }));
      setErrorByNv((m) => ({ ...m, [nv]: e.message || 'Error enviando a Odoo' }));
    }
  }

  function statusChip(nv) {
    const st = sendingByNv[nv] || '';
    if (!st) return null;

    if (st === 'sending') return <span className="chip chip-warn">Enviando…</span>;
    if (st === 'ok') return <span className="chip chip-ok">OK</span>;
    if (st === 'err') return <span className="chip chip-err">Error</span>;
    return null;
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Filtrar por NV</div>
          <input
            type="text"
            value={nvFilter}
            onChange={(e) => setNvFilter(e.target.value)}
            placeholder="Ej: 1019"
            style={{ minWidth: 180 }}
          />
        </div>

        <button type="button" onClick={() => loadPortones(nvFilter.trim())} disabled={loading}>
          {loading ? 'Cargando…' : 'Buscar'}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setNvFilter('');
            loadPortones();
          }}
          disabled={loading}
        >
          Limpiar
        </button>

        {!canSyncOdoo && (
          <div className="info" style={{ marginLeft: 8 }}>
            Nota: solo admin puede enviar a Odoo.
          </div>
        )}
      </div>

      {error && <div className="error">⚠ {error}</div>}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>NV</th>
              <th>Nombre</th>
              <th>RazSoc</th>
              <th style={{ width: 220 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, idx) => {
              const nv = r?.NV ?? r?.nv ?? '';
              const nombre = toStr(r?.Nombre ?? r?.nombre);
              const razsoc = toStr(r?.RazSoc ?? r?.razsoc);

              const res = resultByNv[nv];
              const err = errorByNv[nv];

              return (
                <tr key={nv ? `nv-${nv}` : `row-${idx}`}>
                  <td>{toStr(nv)}</td>
                  <td>{nombre}</td>
                  <td>{razsoc}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleEnviarOdoo(r)}
                        disabled={!canSyncOdoo || loading || sendingByNv[nv] === 'sending'}
                      >
                        Enviar a Odoo
                      </button>

                      {statusChip(nv)}

                      {res?.order_id ? (
                        <span className="info">
                          SO #{res.order_id}
                          {res.amount_total !== undefined && res.amount_total !== null ? ` · $${res.amount_total}` : ''}
                        </span>
                      ) : null}

                      {err ? <span className="error" style={{ marginLeft: 6 }}>{err}</span> : null}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && (!rows || !rows.length) && (
              <tr>
                <td colSpan={4} style={{ padding: 16, textAlign: 'center', opacity: 0.8 }}>
                  No hay portones para mostrar.
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
        .chip-err{ }
      `}</style>
    </div>
  );
}
