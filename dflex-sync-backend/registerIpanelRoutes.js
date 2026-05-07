// registerIpanelRoutes.js
// Precarga para registrar endpoints de ipanel sin modificar server.js.
// Se activa con: node -r ./registerIpanelRoutes.js server.js

require('dotenv').config();

const Module = require('module');
const sql = require('mssql');
const { Pool } = require('pg');

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
  const productoDescripcion = toStr(row.producto_descripcion || row.producto_descripciones || row.descripcion_producto);

  if (cliente || nombre) parts.push(`Cliente: ${[cliente, nombre].filter(Boolean).join(' - ')}`);
  if (direccion || localidad || provincia || cp) {
    const ubicacion = [direccion, localidad, provincia, cp ? `CP ${cp}` : ''].filter(Boolean).join(' | ');
    parts.push(`Direccion: ${ubicacion}`);
  }
  if (cuit) parts.push(`CUIT: ${cuit}`);
  if (vendedor) parts.push(`Vendedor: ${vendedor}`);
  if (operador) parts.push(`Operador: ${operador}`);
  if (productoDescripcion) parts.push(`Producto: ${productoDescripcion}`);
  if (observ) parts.push(`Observ: ${observ}`);
  if (obs) parts.push(`Obs: ${obs}`);
  if (oc) parts.push(`OC: ${oc}`);
  if (idpedido) parts.push(`ID pedido: ${idpedido}`);

  return parts.join('\n') || null;
}

function getProductoDescripcion(row) {
  return toStr(row.producto_descripcion || row.producto_descripciones || row.descripcion_producto) || null;
}

function mapSqlRowToPreproduccionValoresIpanel(row) {
  const partida = toIntOrNull(row.numero);
  if (!partida) return null;

  const fechaNv = toDateOnlyOrNull(row.fecha);
  const fechaPlanEntrega = toDateOnlyOrNull(row.fechaent);
  const productoDescripcion = getProductoDescripcion(row);
  const productoCodigos = toStr(row.producto_codigos) || null;
  const observaciones = buildObservaciones(row);

  return {
    partida,
    nv: partida,
    fecha_nv: fechaNv,
    fecha_plan_entrega: fechaPlanEntrega,
    data: {
      ...row,
      source: 'SQL',
      origen: 'Paneles.dbo.NTASVTAS',
      partida,
      nv: partida,
      fecha_nv: fechaNv,
      fecha_plan_entrega: fechaPlanEntrega,
      producto_codigos: productoCodigos,
      descripcion: productoDescripcion,
      producto_descripcion: productoDescripcion,
      producto_descripciones: productoDescripcion,
      descripcion_producto: productoDescripcion,
      observaciones,
    },
  };
}

function decorateSqlIpanelRow(row) {
  const mapped = mapSqlRowToPreproduccionValoresIpanel(row) || {};
  const productoDescripcion = getProductoDescripcion(row);

  return {
    ...row,
    source: 'SQL',
    partida: mapped.partida ?? toIntOrNull(row.numero),
    nv: mapped.nv ?? toIntOrNull(row.numero),
    fecha_nv: mapped.fecha_nv ?? toDateOnlyOrNull(row.fecha),
    fecha_plan_entrega: mapped.fecha_plan_entrega ?? toDateOnlyOrNull(row.fechaent),
    producto_codigos: toStr(row.producto_codigos) || null,
    descripcion: productoDescripcion,
    producto_descripcion: productoDescripcion,
    producto_descripciones: productoDescripcion,
    descripcion_producto: productoDescripcion,
    observaciones: mapped.observaciones ?? buildObservaciones(row),
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
      WHERE LTRIM(RTRIM(CAST(h.numero AS varchar(50)))) = @numeroStr
    `;
  }

  const result = await request.query(`
    SELECT TOP (@limit)
      h.fecha,
      h.tipo,
      h.sucursal,
      h.numero,
      h.deposito,
      h.cliente,
      h.nombre,
      h.direccion,
      h.localidad,
      h.cp,
      h.provincia,
      h.fpago,
      h.vendedor,
      h.operador,
      h.zona,
      h.iva,
      h.cuit,
      h.ibrutos,
      h.observ,
      h.retrep,
      h.fechaent,
      h.dirent,
      h.obs,
      h.oc,
      h.idpedido,
      h.condicion,
      h.factura,
      h.remito,
      STUFF((
        SELECT DISTINCT ', ' + LTRIM(RTRIM(CAST(l.producto AS varchar(100))))
        FROM Paneles.dbo.INTASVTAS AS l
        WHERE LTRIM(RTRIM(CAST(l.numero AS varchar(50)))) = LTRIM(RTRIM(CAST(h.numero AS varchar(50))))
          AND (h.tipo IS NULL OR l.tipo = h.tipo)
          AND (h.sucursal IS NULL OR l.sucursal = h.sucursal)
          AND (h.deposito IS NULL OR l.deposito = h.deposito)
          AND l.producto IS NOT NULL
        FOR XML PATH(''), TYPE
      ).value('.', 'nvarchar(max)'), 1, 2, '') AS producto_codigos,
      STUFF((
        SELECT DISTINCT ' | ' + LTRIM(RTRIM(COALESCE(p.descripcion, '')))
        FROM Paneles.dbo.INTASVTAS AS l
        LEFT JOIN Paneles.dbo.PRODUCTOS AS p
          ON LTRIM(RTRIM(CAST(p.codigo AS varchar(100)))) = LTRIM(RTRIM(CAST(l.producto AS varchar(100))))
        WHERE LTRIM(RTRIM(CAST(l.numero AS varchar(50)))) = LTRIM(RTRIM(CAST(h.numero AS varchar(50))))
          AND (h.tipo IS NULL OR l.tipo = h.tipo)
          AND (h.sucursal IS NULL OR l.sucursal = h.sucursal)
          AND (h.deposito IS NULL OR l.deposito = h.deposito)
          AND NULLIF(LTRIM(RTRIM(COALESCE(p.descripcion, ''))), '') IS NOT NULL
        FOR XML PATH(''), TYPE
      ).value('.', 'nvarchar(max)'), 1, 3, '') AS producto_descripcion
    FROM Paneles.dbo.NTASVTAS AS h
    ${where}
    ORDER BY h.fecha DESC, h.numero DESC
  `);

  return result.recordset || [];
}

async function upsertPreproduccionValoresIpanelRow(pgPool, mapped) {
  const existing = await pgPool.query(
    `
      SELECT id, data
      FROM public.preproduccion_valores_ipanels
      WHERE partida = $1
      ORDER BY id ASC
      LIMIT 1
    `,
    [mapped.partida]
  );

  if (existing.rows.length) {
    const existingData = existing.rows[0]?.data && typeof existing.rows[0].data === 'object' ? existing.rows[0].data : {};
    const mergedData = {
      ...existingData,
      ...(mapped.data || {}),
    };

    // No pisar fechas/datos imputados por logística desde Planificación.
    for (const key of ['fecha_prod', 'inicio_prod_imput', 'fecha_plan_entrega', 'fecha_salida_imput', 'produccion_enviada', 'produccion_enviada_at', 'ipanel_id']) {
      if (existingData[key] !== undefined && existingData[key] !== null && String(existingData[key]).trim() !== '') {
        mergedData[key] = existingData[key];
      }
    }

    await pgPool.query(
      `
        UPDATE public.preproduccion_valores_ipanels
        SET
          nv = $2,
          fecha_nv = $3,
          fecha_plan_entrega = coalesce(fecha_plan_entrega, $4),
          descripcion = $5,
          data = $6::jsonb,
          updated_at = now()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        mapped.nv,
        mapped.fecha_nv,
        mapped.fecha_plan_entrega,
        mapped.data?.descripcion || mapped.data?.producto_descripcion || null,
        JSON.stringify(mergedData),
      ]
    );
    return 'updated';
  }

  await pgPool.query(
    `
      INSERT INTO public.preproduccion_valores_ipanels (
        partida,
        nv,
        fecha_nv,
        fecha_plan_entrega,
        descripcion,
        data
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      mapped.partida,
      mapped.nv,
      mapped.fecha_nv,
      mapped.fecha_plan_entrega,
      mapped.data?.descripcion || mapped.data?.producto_descripcion || null,
      JSON.stringify(mapped.data || {}),
    ]
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
      const mapped = mapSqlRowToPreproduccionValoresIpanel(row);
      if (!mapped) {
        skipped += 1;
        continue;
      }

      const result = await upsertPreproduccionValoresIpanelRow(pgPool, mapped);
      if (result === 'inserted') inserted += 1;
      else if (result === 'updated') updated += 1;
    } catch (err) {
      errors.push({ numero: row?.numero ?? null, error: err?.message || String(err) });
    }
  }

  return {
    ok: errors.length === 0,
    source: 'SQL',
    imported: inserted + updated,
    inserted,
    updated,
    skipped,
    totalSqlRows: sqlRows.length,
    errors,
  };
}

async function getLastIpanelSync() {
  const pgPool = getIpanelPgPool();
  const { rows } = await pgPool.query('SELECT MAX(updated_at) AS last_sync_at FROM public.preproduccion_valores_ipanels');
  return rows?.[0]?.last_sync_at || null;
}

function registerIpanelRoutes(app) {
  if (!app || app.__ipanelRoutesRegistered) return;
  app.__ipanelRoutesRegistered = true;

  // IMPORTANTE: esta ruta muestra lo que viene directo desde SQL Server.
  // No lista Supabase. Supabase solo se usa para guardar/sincronizar en preproduccion_valores_ipanels.
  app.get('/api/ipanel', async (req, res) => {
    try {
      const rawRows = await fetchSqlIpanelRows({
        partida: req.query.partida,
        nv: req.query.nv,
        limit: req.query.limit,
      });
      const rows = rawRows.map(decorateSqlIpanelRow);
      return res.json({ source: 'SQL', rows });
    } catch (err) {
      console.error('[ipanel] Error leyendo desde SQL:', err);
      return res.status(500).json({ error: 'Error leyendo ipanels desde SQL', details: err?.message || String(err) });
    }
  });

  app.get('/api/ipanel/sql', async (req, res) => {
    try {
      const rawRows = await fetchSqlIpanelRows({
        partida: req.query.partida,
        nv: req.query.nv,
        limit: req.query.limit,
      });
      const rows = rawRows.map(decorateSqlIpanelRow);
      return res.json({ source: 'SQL', rows });
    } catch (err) {
      console.error('[ipanel] Error leyendo desde SQL:', err);
      return res.status(500).json({ error: 'Error leyendo ipanels desde SQL', details: err?.message || String(err) });
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

  console.log('[ipanel] Rutas registradas: GET /api/ipanel(SQL + productos), GET /api/ipanel/sql, GET /api/ipanel/last-sync, POST /api/sync/ipanel -> preproduccion_valores_ipanels');
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
