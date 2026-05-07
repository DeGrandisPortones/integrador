// registerIpanelRoutes.js
// Precarga para registrar endpoints de ipanel sin modificar server.js.
// Se activa con: node -r ./registerIpanelRoutes.js server.js

require('dotenv').config();

const Module = require('module');
const sql = require('mssql');
const { Pool } = require('pg');

const IPANEL_STATUS_VALUES = new Set(['Pendiente', 'En Proceso', 'Finalizado']);

function toStr(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toIntOrNull(value) {
  const raw = toStr(value);
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateOnlyOrNull(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const raw = toStr(value);
  if (!raw) return null;

  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeStatus(value) {
  const raw = toStr(value);
  return IPANEL_STATUS_VALUES.has(raw) ? raw : 'Pendiente';
}

function buildSqlConfig() {
  const sqlServerRaw = process.env.SQL_SERVER || 'localhost';
  let sqlHost = sqlServerRaw;
  let sqlPort = 1433;

  if (sqlServerRaw.includes(',')) {
    const [hostPart, portPart] = sqlServerRaw.split(',');
    sqlHost = hostPart;
    const parsedPort = parseInt(portPart, 10);
    if (!Number.isNaN(parsedPort)) sqlPort = parsedPort;
  }

  return {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: sqlHost,
    port: sqlPort,
    database: process.env.SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };
}

let ipanelSqlPoolPromise = null;
function getIpanelSqlPool() {
  if (!ipanelSqlPoolPromise) {
    ipanelSqlPoolPromise = new sql.ConnectionPool(buildSqlConfig()).connect();
  }
  return ipanelSqlPoolPromise;
}

let ipanelPgPool = null;
function getIpanelPgPool() {
  if (!ipanelPgPool) {
    const dbUrl = process.env.SUPABASE_DB_URL || null;
    if (!dbUrl) throw new Error('SUPABASE_DB_URL no esta configurado');
    ipanelPgPool = new Pool({ connectionString: dbUrl });
    ipanelPgPool.on('error', (err) => {
      console.error('[ipanel] Error en pool de Supabase:', err);
    });
  }
  return ipanelPgPool;
}

function buildObservaciones(row) {
  const parts = [];

  const cliente = toStr(row.cliente);
  const nombre = toStr(row.nombre);
  const direccion = toStr(row.direccion);
  const localidad = toStr(row.localidad);
  const provincia = toStr(row.provincia);
  const cp = toStr(row.cp);
  const cuit = toStr(row.cuit);
  const observ = toStr(row.observ);
  const obs = toStr(row.obs);
  const oc = toStr(row.oc);
  const idpedido = toStr(row.idpedido);
  const vendedor = toStr(row.vendedor);
  const operador = toStr(row.operador);

  if (cliente || nombre) parts.push(`Cliente: ${[cliente, nombre].filter(Boolean).join(' - ')}`);
  if (direccion || localidad || provincia || cp) {
    const ubicacion = [direccion, localidad, provincia, cp ? `CP ${cp}` : ''].filter(Boolean).join(' | ');
    parts.push(`Direccion: ${ubicacion}`);
  }
  if (cuit) parts.push(`CUIT: ${cuit}`);
  if (vendedor) parts.push(`Vendedor: ${vendedor}`);
  if (operador) parts.push(`Operador: ${operador}`);
  if (observ) parts.push(`Observ: ${observ}`);
  if (obs) parts.push(`Obs: ${obs}`);
  if (oc) parts.push(`OC: ${oc}`);
  if (idpedido) parts.push(`ID pedido: ${idpedido}`);

  return parts.join('\n') || null;
}

function mapSqlRowToIpanel(row) {
  const partida = toIntOrNull(row.numero);
  if (!partida) return null;

  return {
    partida,
    nv: partida,
    fecha_nv: toDateOnlyOrNull(row.fecha),
    fecha_plan_entrega: toDateOnlyOrNull(row.fechaent),
    observaciones: buildObservaciones(row),
  };
}

async function fetchSqlIpanelRows({ partida, nv, limit } = {}) {
  const pool = await getIpanelSqlPool();
  const request = pool.request();

  const limitValue = Math.max(1, Math.min(toIntOrNull(limit) || 10000, 10000));
  request.input('limit', sql.Int, limitValue);

  const filterValue = toStr(partida || nv);
  let where = '';
  if (filterValue) {
    request.input('numeroStr', sql.VarChar, filterValue);
    where = `
      WHERE LTRIM(RTRIM(CAST(numero AS varchar(50)))) = @numeroStr
    `;
  }

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
    ${where}
    ORDER BY fecha DESC, numero DESC
  `);

  return result.recordset || [];
}

async function upsertIpanelRow(pgPool, mapped) {
  const existing = await pgPool.query(
    `
      SELECT id
      FROM public.ipanel
      WHERE partida = $1
      ORDER BY id ASC
      LIMIT 1
    `,
    [mapped.partida]
  );

  if (existing.rows.length) {
    await pgPool.query(
      `
        UPDATE public.ipanel
        SET
          nv = $2,
          fecha_nv = $3,
          fecha_plan_entrega = $4,
          observaciones = $5,
          updated_at = now()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        mapped.nv,
        mapped.fecha_nv,
        mapped.fecha_plan_entrega,
        mapped.observaciones,
      ]
    );
    return 'updated';
  }

  await pgPool.query(
    `
      INSERT INTO public.ipanel (
        partida,
        nv,
        fecha_nv,
        fecha_plan_entrega,
        observaciones
      ) VALUES ($1, $2, $3, $4, $5)
    `,
    [mapped.partida, mapped.nv, mapped.fecha_nv, mapped.fecha_plan_entrega, mapped.observaciones]
  );
  return 'inserted';
}

async function syncIpanels({ partida, nv, limit } = {}) {
  const pgPool = getIpanelPgPool();
  const sqlRows = await fetchSqlIpanelRows({ partida, nv, limit });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const row of sqlRows) {
    try {
      const mapped = mapSqlRowToIpanel(row);
      if (!mapped) {
        skipped += 1;
        continue;
      }

      const result = await upsertIpanelRow(pgPool, mapped);
      if (result === 'inserted') inserted += 1;
      else if (result === 'updated') updated += 1;
    } catch (err) {
      errors.push({ numero: row?.numero ?? null, error: err?.message || String(err) });
    }
  }

  return {
    ok: errors.length === 0,
    imported: inserted + updated,
    inserted,
    updated,
    skipped,
    errors,
  };
}

async function listIpanels({ partida, nv, limit } = {}) {
  const pgPool = getIpanelPgPool();
  const params = [];
  const where = [];

  const filterValue = toIntOrNull(partida || nv);
  if (filterValue) {
    params.push(filterValue);
    where.push(`(partida = $${params.length} OR nv = $${params.length})`);
  }

  const limitValue = Math.max(1, Math.min(toIntOrNull(limit) || 1000, 5000));
  params.push(limitValue);

  const sqlText = `
    SELECT
      id,
      partida,
      created_at,
      updated_at,
      guillotina,
      guillotina_inicio,
      guillotina_fin,
      plegado,
      plegado_inicio,
      plegado_fin,
      pintura,
      pintura_inicio,
      pintura_fin,
      inyeccion,
      inyeccion_inicio,
      inyeccion_fin,
      nv,
      despacho,
      despacho_inicio,
      despacho_fin,
      fecha_plan,
      diseno,
      diseno_inicio,
      diseno_fin,
      fecha_nv,
      fecha_plan_entrega,
      observaciones,
      fecha_med,
      fecha_prod
    FROM public.ipanel
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY COALESCE(fecha_nv, created_at::date) DESC, partida DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pgPool.query(sqlText, params);

  return (rows || []).map((row) => ({
    ...row,
    guillotina: normalizeStatus(row.guillotina),
    plegado: normalizeStatus(row.plegado),
    pintura: normalizeStatus(row.pintura),
    inyeccion: normalizeStatus(row.inyeccion),
    despacho: normalizeStatus(row.despacho),
    diseno: normalizeStatus(row.diseno),
  }));
}

async function getLastIpanelSync() {
  const pgPool = getIpanelPgPool();
  const { rows } = await pgPool.query('SELECT MAX(updated_at) AS last_sync_at FROM public.ipanel');
  return rows?.[0]?.last_sync_at || null;
}

function registerIpanelRoutes(app) {
  if (!app || app.__ipanelRoutesRegistered) return;
  app.__ipanelRoutesRegistered = true;

  app.get('/api/ipanel', async (req, res) => {
    try {
      const rows = await listIpanels({
        partida: req.query.partida,
        nv: req.query.nv,
        limit: req.query.limit,
      });
      return res.json({ rows });
    } catch (err) {
      console.error('[ipanel] Error listando:', err);
      return res.status(500).json({ error: 'Error listando ipanels', details: err?.message || String(err) });
    }
  });

  app.get('/api/ipanel/last-sync', async (_req, res) => {
    try {
      const lastSyncAt = await getLastIpanelSync();
      return res.json({ lastSyncAt });
    } catch (err) {
      console.error('[ipanel] Error leyendo ultima sync:', err);
      return res.status(500).json({ error: 'Error leyendo ultima sync ipanel', details: err?.message || String(err) });
    }
  });

  app.post('/api/sync/ipanel', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await syncIpanels({
        partida: body.partida || req.query.partida,
        nv: body.nv || req.query.nv,
        limit: body.limit || req.query.limit,
      });
      return res.status(result.ok ? 200 : 207).json(result);
    } catch (err) {
      console.error('[ipanel] Error sincronizando:', err);
      return res.status(500).json({ error: 'Error sincronizando ipanels', details: err?.message || String(err) });
    }
  });

  console.log('[ipanel] Rutas registradas: GET /api/ipanel, GET /api/ipanel/last-sync, POST /api/sync/ipanel');
}

function patchExpress() {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const exported = originalLoad.apply(this, arguments);

    if (request !== 'express' || !exported || exported.__ipanelPatched) {
      return exported;
    }

    function wrappedExpress(...args) {
      const app = exported(...args);

      if (app && !app.__ipanelListenPatched) {
        app.__ipanelListenPatched = true;
        const originalListen = app.listen.bind(app);

        app.listen = function patchedListen(...listenArgs) {
          registerIpanelRoutes(app);
          return originalListen(...listenArgs);
        };
      }

      return app;
    }

    Object.assign(wrappedExpress, exported);
    Object.setPrototypeOf(wrappedExpress, Object.getPrototypeOf(exported));
    wrappedExpress.__ipanelPatched = true;

    return wrappedExpress;
  };
}

patchExpress();
