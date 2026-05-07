'use strict';

/**
 * Sync Paneles.dbo.NTASVTAS -> public.ipanel.
 *
 * Importante:
 * - No toca estados ni timestamps de procesos (guillotina, plegado, pintura, inyeccion, despacho, diseno).
 * - Actualiza solo datos provenientes de SQL: nv, fecha_nv, fecha_plan_entrega, observaciones.
 * - Como public.ipanel no tiene constraint unique(partida), hace upsert manual por partida.
 */

const DEFAULT_IPANEL_LIMIT = 10000;

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function toPositiveLimit(value, fallback = DEFAULT_IPANEL_LIMIT) {
  const n = toIntOrNull(value);
  if (!n || n < 1) return fallback;
  return Math.min(n, DEFAULT_IPANEL_LIMIT);
}

function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function buildObservaciones(row) {
  const parts = [];

  const observ = cleanText(row.observ);
  const obs = cleanText(row.obs);
  const oc = cleanText(row.oc);
  const idpedido = cleanText(row.idpedido);
  const cliente = cleanText(row.cliente);
  const nombre = cleanText(row.nombre);
  const direccion = cleanText(row.direccion);
  const localidad = cleanText(row.localidad);
  const provincia = cleanText(row.provincia);
  const dirent = cleanText(row.dirent);

  if (observ) parts.push(`Observ: ${observ}`);
  if (obs) parts.push(`Obs: ${obs}`);
  if (oc) parts.push(`OC: ${oc}`);
  if (idpedido) parts.push(`IdPedido: ${idpedido}`);
  if (cliente || nombre) parts.push(`Cliente: ${[cliente, nombre].filter(Boolean).join(' - ')}`);
  if (direccion || localidad || provincia) {
    parts.push(`Direccion: ${[direccion, localidad, provincia].filter(Boolean).join(', ')}`);
  }
  if (dirent) parts.push(`Entrega: ${dirent}`);

  return parts.length ? parts.join('\n') : null;
}

function mapNtasvtasToIpanel(row) {
  const numero = toIntOrNull(row.numero);

  // Paneles.dbo.NTASVTAS no trae una columna partida en el SELECT informado.
  // Usamos numero como partida para tener una clave estable y trazable.
  const partida = numero;
  if (!partida) return null;

  return {
    partida,
    nv: numero,
    fecha_nv: toDateOnly(row.fecha),
    fecha_plan_entrega: toDateOnly(row.fechaent),
    observaciones: buildObservaciones(row),
  };
}

async function getIpanelRowsFromSql({ getSqlPool, sql, limit = DEFAULT_IPANEL_LIMIT, nv, partida } = {}) {
  const pool = await getSqlPool();
  const request = pool.request();

  const safeLimit = toPositiveLimit(limit);
  request.input('limit', sql.Int, safeLimit);

  const where = [];
  const nvFilter = toIntOrNull(nv ?? partida);
  if (nvFilter) {
    request.input('numero', sql.Int, nvFilter);
    where.push('numero = @numero');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const result = await request.query(`
    SELECT TOP (@limit)
      fecha,
      tipo,
      sucursal,
      numero,
      deposito,
      cliente,
      nombre,
      direccion,
      localidad,
      cp,
      provincia,
      fpago,
      vendedor,
      operador,
      zona,
      iva,
      cuit,
      ibrutos,
      observ,
      retrep,
      fechaent,
      dirent,
      obs,
      oc,
      idpedido,
      condicion,
      factura,
      remito
    FROM Paneles.dbo.NTASVTAS
    ${whereSql}
    ORDER BY fecha DESC, numero DESC
  `);

  return result.recordset || [];
}

async function upsertIpanelRow({ supabasePool, payload }) {
  const existing = await supabasePool.query(
    'SELECT id FROM public.ipanel WHERE partida = $1 ORDER BY id ASC LIMIT 1',
    [payload.partida]
  );

  if (existing.rows.length) {
    const id = existing.rows[0].id;
    const result = await supabasePool.query(
      `
        UPDATE public.ipanel
        SET
          nv = $2,
          fecha_nv = $3,
          fecha_plan_entrega = $4,
          observaciones = $5,
          updated_at = now()
        WHERE id = $1
        RETURNING id, partida, nv
      `,
      [id, payload.nv, payload.fecha_nv, payload.fecha_plan_entrega, payload.observaciones]
    );
    return { action: 'updated', row: result.rows[0] };
  }

  const inserted = await supabasePool.query(
    `
      INSERT INTO public.ipanel (
        partida,
        nv,
        fecha_nv,
        fecha_plan_entrega,
        observaciones
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, partida, nv
    `,
    [payload.partida, payload.nv, payload.fecha_nv, payload.fecha_plan_entrega, payload.observaciones]
  );

  return { action: 'inserted', row: inserted.rows[0] };
}

async function syncIpanelFromSql({ getSqlPool, sql, supabasePool, limit, nv, partida }) {
  if (!supabasePool) throw new Error('SUPABASE_DB_URL no esta configurado');

  const sqlRows = await getIpanelRowsFromSql({ getSqlPool, sql, limit, nv, partida });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const sourceRow of sqlRows) {
    const payload = mapNtasvtasToIpanel(sourceRow);
    if (!payload) {
      skipped += 1;
      continue;
    }

    try {
      const result = await upsertIpanelRow({ supabasePool, payload });
      if (result.action === 'inserted') inserted += 1;
      if (result.action === 'updated') updated += 1;
    } catch (err) {
      errors.push({ partida: payload.partida, error: err.message || String(err) });
    }
  }

  return {
    imported: inserted + updated,
    inserted,
    updated,
    skipped,
    errors,
  };
}

async function listIpanelRows({ supabasePool, nv, partida, limit = DEFAULT_IPANEL_LIMIT }) {
  if (!supabasePool) throw new Error('SUPABASE_DB_URL no esta configurado');

  const params = [];
  const where = [];

  const partidaFilter = toIntOrNull(partida);
  if (partidaFilter) {
    params.push(partidaFilter);
    where.push(`partida = $${params.length}`);
  }

  const nvFilter = toIntOrNull(nv);
  if (nvFilter) {
    params.push(nvFilter);
    where.push(`nv = $${params.length}`);
  }

  params.push(toPositiveLimit(limit));
  const limitParam = params.length;

  const sqlText = `
    SELECT *
    FROM public.ipanel
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY COALESCE(fecha_nv, created_at::date) DESC, partida DESC
    LIMIT $${limitParam}
  `;

  const result = await supabasePool.query(sqlText, params);
  return result.rows || [];
}

function installIpanelSyncRoutes({ app, sql, getSqlPool, supabasePool, requireAuth, attachRole, requireRole }) {
  app.get('/api/ipanel', requireAuth, attachRole, async (req, res) => {
    try {
      const rows = await listIpanelRows({
        supabasePool,
        nv: req.query.nv,
        partida: req.query.partida,
        limit: req.query.limit,
      });
      return res.json({ count: rows.length, rows });
    } catch (err) {
      console.error('Error en /api/ipanel:', err);
      return res.status(500).json({ error: 'Error interno obteniendo ipanel', details: err.message || String(err) });
    }
  });

  app.get('/api/ipanel/last-sync', requireAuth, attachRole, async (_req, res) => {
    try {
      if (!supabasePool) throw new Error('SUPABASE_DB_URL no esta configurado');
      const result = await supabasePool.query('SELECT max(updated_at) AS last_sync_at FROM public.ipanel');
      return res.json({ lastSyncAt: result.rows?.[0]?.last_sync_at || null });
    } catch (err) {
      console.error('Error en /api/ipanel/last-sync:', err);
      return res.status(500).json({ error: 'Error interno obteniendo ultima sync ipanel', details: err.message || String(err) });
    }
  });

  app.post('/api/sync/ipanel', requireAuth, attachRole, requireRole(['admin']), async (req, res) => {
    try {
      const result = await syncIpanelFromSql({
        getSqlPool,
        sql,
        supabasePool,
        limit: req.body?.limit ?? req.query?.limit,
        nv: req.body?.nv ?? req.query?.nv,
        partida: req.body?.partida ?? req.query?.partida,
      });

      const status = result.errors.length ? 207 : 200;
      return res.status(status).json(result);
    } catch (err) {
      console.error('Error en /api/sync/ipanel:', err);
      return res.status(500).json({ error: 'Error interno sincronizando ipanel', details: err.message || String(err) });
    }
  });
}

module.exports = {
  installIpanelSyncRoutes,
  syncIpanelFromSql,
  getIpanelRowsFromSql,
  mapNtasvtasToIpanel,
};
