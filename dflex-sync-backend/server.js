// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sql = require('mssql');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// =====================
// CONFIGURACIÓN
// =====================

const PORT = process.env.PORT || 4000;

// --- SQL Server ---
const sqlServerRaw = process.env.SQL_SERVER || 'localhost';
let sqlHost = sqlServerRaw;
let sqlPort = 1433;

if (sqlServerRaw.includes(',')) {
  const [hostPart, portPart] = sqlServerRaw.split(',');
  sqlHost = hostPart;
  const parsedPort = parseInt(portPart, 10);
  if (!Number.isNaN(parsedPort)) {
    sqlPort = parsedPort;
  }
}

const sqlConfig = {
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

// --- Odoo ---
const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;
const ODOO_COMPANY_ID = process.env.ODOO_COMPANY_ID ? parseInt(process.env.ODOO_COMPANY_ID, 10) : null;

// --- Supabase (Postgres) ---
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || null;
let supabasePool = null;

if (SUPABASE_DB_URL) {
  supabasePool = new Pool({ connectionString: SUPABASE_DB_URL });
  console.log('Pool de Supabase inicializado.');
} else {
  console.warn('ATENCIÓN: SUPABASE_DB_URL no está configurado. API de fórmulas / valores no funcionará.');
}

if (supabasePool) {
  supabasePool.on('error', (err) => {
    console.error('Error en pool de Supabase:', err);
  });
}

// --- Supabase Admin (Auth verify) ---
const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

if (!supabaseAdmin) {
  console.warn('ATENCIÓN: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados. Auth/roles no funcionarán.');
}

// =====================
// AUTH / ROLES
// =====================

async function requireAuth(req, res, next) {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin no configurado' });
    }

    const hdr = req.headers.authorization || '';
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Falta token Bearer' });

    const token = m[1];
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.user = data.user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'No autorizado', details: e.message || String(e) });
  }
}

async function attachRole(req, _res, next) {
  try {
    req.role = 'viewer';
    if (!supabasePool || !req.user?.id) return next();

    const r = await supabasePool.query('SELECT role FROM app_users WHERE user_id = $1 LIMIT 1', [req.user.id]);
    req.role = r?.rows?.[0]?.role || 'viewer';
    next();
  } catch {
    req.role = 'viewer';
    next();
  }
}

function requireRole(allowedRoles) {
  const allowed = new Set(allowedRoles || []);
  return (req, res, next) => {
    const role = req.role || 'viewer';
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'No tenés permisos', role });
    }
    next();
  };
}

// =====================
// NV TERMINADOS (texto)
// =====================

let nvTerminadosCache = null;

function loadNvTerminados() {
  if (nvTerminadosCache !== null) {
    return nvTerminadosCache;
  }

  try {
    const filePath = path.join(__dirname, 'nv_terminados.txt');
    const content = fs.readFileSync(filePath, 'utf8');
    const set = new Set();
    content.split(/\r?\n/).forEach((line) => {
      const v = line.trim();
      if (v) set.add(v);
    });
    nvTerminadosCache = set;
    console.log(`NV terminados cargados: ${set.size}`);
  } catch (err) {
    console.warn('No se pudo leer nv_terminados.txt. Se asume que no hay NV terminados.', err.message);
    nvTerminadosCache = new Set();
  }

  return nvTerminadosCache;
}

// =====================
// CONEXIÓN SQL SERVER
// =====================

let poolPromise = null;

async function getSqlPool() {
  if (!poolPromise) {
    console.log('Conectando a SQL Server...', sqlHost + ':' + sqlPort);
    poolPromise = sql.connect(sqlConfig);
  }
  return poolPromise;
}

// ---------------------
// NTASVTAS / INTASVTAS
// ---------------------

async function getNtavHeader(idpedido) {
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .input('idpedido', sql.VarChar, idpedido)
    .query(`
      SELECT
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
        obs AS obs2,
        oc,
        idpedido,
        condicion,
        factura,
        remito
      FROM Portones.dbo.NTASVTAS
      WHERE idpedido = @idpedido
    `);

  if (!result.recordset.length) {
    return null;
  }
  return result.recordset[0];
}

async function getNtavLinesFromHeader(header) {
  const pool = await getSqlPool();

  const result = await pool
    .request()
    .input('tipo', sql.VarChar, header.tipo)
    .input('sucursal', sql.Int, header.sucursal)
    .input('numero', sql.Int, header.numero)
    .input('deposito', sql.Int, header.deposito)
    .query(`
      SELECT
        l.producto,
        p.descripcion,
        l.cantidad,
        l.precio,
        l.bonific,
        l.preneto,
        l.prelista
      FROM Portones.dbo.INTASVTAS AS l
      LEFT JOIN Portones.dbo.PRODUCTOS AS p
        ON p.codigo = l.producto
      WHERE
        l.tipo = @tipo
        AND l.sucursal = @sucursal
        AND l.numero = @numero
        AND l.deposito = @deposito
    `);

  return result.recordset;
}

// ---------------------
// Pre_Produccion (SQL)
// ---------------------

async function getPreProduccionRows(nv) {
  const pool = await getSqlPool();

  let query = `
    SELECT TOP (1000) *
    FROM WebApp.dbo.Pre_Produccion
  `;

  const request = pool.request();

  if (nv) {
    query += ' WHERE NV = @nv';
    request.input('nv', sql.Int, parseInt(nv, 10));
  }

  query += ' ORDER BY ID DESC';

  const result = await request.query(query);
  const allRows = result.recordset || [];

  const nvTerminados = loadNvTerminados();
  const filtered = allRows.filter((row) => {
    const nvVal = row.NV !== null && row.NV !== undefined ? String(row.NV).trim() : '';
    if (nvTerminados.has(nvVal)) {
      row.Estado = 'TERMINADO';
      return false;
    }
    return true;
  });

  return filtered;
}

// =====================
// FORMULAS EN SUPABASE
// =====================

async function getAllColumnFormulas() {
  if (!supabasePool) throw new Error('SUPABASE_DB_URL no está configurado');
  const { rows } = await supabasePool.query(
    'SELECT column_name, expression FROM preproduccion_formulas ORDER BY column_name'
  );
  return rows;
}

async function upsertColumnFormula(columnName, expression) {
  if (!supabasePool) throw new Error('SUPABASE_DB_URL no está configurado');
  const { rows } = await supabasePool.query(
    `
      INSERT INTO preproduccion_formulas (column_name, expression)
      VALUES ($1, $2)
      ON CONFLICT (column_name)
      DO UPDATE SET expression = EXCLUDED.expression, updated_at = now()
      RETURNING column_name, expression
    `,
    [columnName, expression]
  );
  return rows[0];
}

async function getCompiledFormulasFromDb() {
  const formulas = await getAllColumnFormulas();
  const compiled = {};

  for (const f of formulas) {
    const col = f.column_name;
    const expr = (f.expression || '').trim();
    if (!expr) continue;

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'row',
        `
          try {
            with (row) {
              return (${expr});
            }
          } catch (e) {
            return undefined;
          }
        `
      );
      compiled[col] = fn;
    } catch (err) {
      console.error(`No se pudo compilar la fórmula para columna ${col}:`, err.message);
    }
  }

  return compiled;
}

// =====================
// PREPRODUCCION_* EN SUPABASE
// =====================

async function upsertPreproduccionSqlRow(rawRow) {
  if (!supabasePool) return;

  const nvVal = rawRow.NV != null ? parseInt(rawRow.NV, 10) : null;
  if (!nvVal || Number.isNaN(nvVal)) return;

  const idVal = rawRow.ID ?? rawRow.Id ?? rawRow.id; // por si cambia el case
  if (idVal == null) {
    console.warn('Fila sin ID en SQL Server para NV', nvVal);
    return;
  }

  await supabasePool.query(
    `
      INSERT INTO preproduccion_sql (id, nv, data)
      VALUES ($1, $2, $3)
      ON CONFLICT (nv)
      DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = now()
    `,
    [idVal, nvVal, rawRow]
  );
}

function computeFormulaValuesWithDeps(row, compiled) {
  const cache = {};
  const visiting = new Set();

  function evalCol(col) {
    if (Object.prototype.hasOwnProperty.call(cache, col)) return cache[col];

    if (visiting.has(col)) {
      return row[col];
    }
    visiting.add(col);

    const fn = compiled[col];
    if (!fn) {
      cache[col] = row[col];
      visiting.delete(col);
      return cache[col];
    }

    const proxyRow = new Proxy(row, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          if (Object.prototype.hasOwnProperty.call(compiled, prop)) {
            return evalCol(prop);
          }
          if (Object.prototype.hasOwnProperty.call(target, prop)) {
            return target[prop];
          }
        }
        return Reflect.get(target, prop, receiver);
      },
      has(target, prop) {
        if (typeof prop === 'string') {
          if (Object.prototype.hasOwnProperty.call(compiled, prop)) return true;
          if (Object.prototype.hasOwnProperty.call(target, prop)) return true;
        }
        return Reflect.has(target, prop);
      },
    });

    let result;
    try {
      result = fn(proxyRow);
    } catch {
      result = undefined;
    }

    visiting.delete(col);
    cache[col] = result;
    return result;
  }

  const out = {};
  for (const col of Object.keys(compiled)) {
    const v = evalCol(col);
    if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v))) {
      out[col] = v;
    }
  }
  return out;
}

async function upsertPreproduccionValoresFillDerived(rawRow, compiled) {
  if (!supabasePool) return;

  const nvVal = rawRow.NV !== null && rawRow.NV !== undefined ? parseInt(rawRow.NV, 10) : null;
  if (!nvVal || Number.isNaN(nvVal)) return;

  // ✅ mismo enfoque que preproduccion_sql: forzar id
  const idVal = rawRow.ID ?? rawRow.Id ?? rawRow.id;
  if (idVal == null) {
    console.warn('Fila sin ID para preproduccion_valores, NV', nvVal);
    return;
  }

  let baseRow = null;
  try {
    const r = await supabasePool.query('SELECT data FROM preproduccion_sql WHERE nv = $1 LIMIT 1', [nvVal]);
    baseRow = r?.rows?.[0]?.data || null;
  } catch (e) {
    console.warn('No se pudo leer preproduccion_sql para NV', nvVal, e?.message || e);
    baseRow = null;
  }

  if (!baseRow) baseRow = { ...rawRow };

  let existing = {};
  try {
    const r = await supabasePool.query('SELECT data FROM preproduccion_valores WHERE nv = $1 LIMIT 1', [nvVal]);
    existing = r?.rows?.[0]?.data || {};
  } catch {
    existing = {};
  }

  const formulaCols = new Set(Object.keys(compiled || {}));
  formulaCols.add('lado_mas_alto');
  formulaCols.add('calc_espada');

  const manualOverrides = {};
  for (const [k, v] of Object.entries(existing || {})) {
    if (formulaCols.has(k)) continue;
    const baseV = baseRow?.[k];
    if (v !== baseV) {
      manualOverrides[k] = v;
    }
  }

  const effectiveRow = { ...baseRow, ...manualOverrides };
  const computed = compiled ? computeFormulaValuesWithDeps(effectiveRow, compiled) : {};

  if (rawRow && rawRow.lado_mas_alto !== undefined && rawRow.lado_mas_alto !== null) {
    computed.lado_mas_alto = rawRow.lado_mas_alto;
  }
  if (rawRow && rawRow.calc_espada !== undefined && rawRow.calc_espada !== null) {
    computed.calc_espada = rawRow.calc_espada;
  }

  const payload = { ...baseRow, ...manualOverrides, ...computed };

await supabasePool.query(
  `
    INSERT INTO preproduccion_valores (id, nv, data)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (nv)
    DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = now()
  `,
  [idVal, nvVal, JSON.stringify(payload)]
);

}

// =====================
// LECTURA "DEFINITIVA"
// =====================

async function getPreProduccionSqlRowsFromSupabase({ nv, partida } = {}) {
  if (!supabasePool) throw new Error('SUPABASE_DB_URL no está configurado');

  let sqlText = 'SELECT nv, data FROM preproduccion_sql';
  const where = [];
  const params = [];

  if (nv) {
    const nvParsed = parseInt(nv, 10);
    if (!Number.isNaN(nvParsed)) {
      params.push(nvParsed);
      where.push(`nv = $${params.length}`);
    }
  }

  if (partida) {
    params.push(String(partida).trim());
    where.push(`COALESCE(data->>'PARTIDA', data->>'Partida', data->>'partida') = $${params.length}`);
  }

  if (where.length) {
    sqlText += ' WHERE ' + where.join(' AND ');
  }

  sqlText += ' ORDER BY nv';

  const { rows } = await supabasePool.query(sqlText, params);

  return (rows || []).map((r) => {
    const obj = r?.data && typeof r.data === 'object' ? r.data : {};
    return { ...obj, NV: r.nv };
  });
}

async function getPreProduccionValoresRows({ nv, partida } = {}) {
  if (!supabasePool) throw new Error('SUPABASE_DB_URL no está configurado');

  const baseRows = await getPreProduccionSqlRowsFromSupabase({ nv, partida });

  let sqlText = 'SELECT nv, data FROM preproduccion_valores';
  const where = [];
  const params = [];

  if (nv) {
    const nvParsed = parseInt(nv, 10);
    if (!Number.isNaN(nvParsed)) {
      params.push(nvParsed);
      where.push(`nv = $${params.length}`);
    }
  }

  if (partida) {
    params.push(String(partida).trim());
    where.push(`COALESCE(data->>'PARTIDA', data->>'Partida', data->>'partida') = $${params.length}`);
  }

  if (where.length) {
    sqlText += ' WHERE ' + where.join(' AND ');
  }
  sqlText += ' ORDER BY nv';

  const { rows: overlayRaw } = await supabasePool.query(sqlText, params);
  const overlayRows = (overlayRaw || []).map((r) => {
    const obj = r?.data && typeof r.data === 'object' ? r.data : {};
    return { ...obj, NV: r.nv };
  });

  const overlayByNv = new Map();
  for (const r of overlayRows) {
    const key = r?.NV !== undefined && r?.NV !== null ? String(r.NV) : undefined;
    if (key) overlayByNv.set(key, r);
  }

  const merged = baseRows.map((base) => {
    const key = base?.NV !== undefined && base?.NV !== null ? String(base.NV) : undefined;
    const over = key ? overlayByNv.get(key) : null;
    return over ? { ...base, ...over } : base;
  });

  for (const over of overlayRows) {
    const key = over?.NV !== undefined && over?.NV !== null ? String(over.NV) : undefined;
    if (!key) continue;
    const hasBase = baseRows.some((b) => b?.NV !== undefined && b?.NV !== null && String(b.NV) === key);
    if (!hasBase) merged.push(over);
  }

  merged.sort((a, b) => {
    const na = parseInt(a?.NV, 10);
    const nb = parseInt(b?.NV, 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a?.NV || '').localeCompare(String(b?.NV || ''));
  });

  return merged;
}

// =====================
// CLIENTE ODOO (JSON-RPC)
// =====================

let cachedUid = null;

async function odooJsonRpc(params) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params,
    id: Date.now(),
  };

  const response = await axios.post(`${ODOO_URL}/jsonrpc`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.data.error) {
    console.error('Error JSON-RPC Odoo:', response.data.error);
    throw new Error(JSON.stringify(response.data.error));
  }

  return response.data.result;
}

async function getOdooUid() {
  if (cachedUid !== null) return cachedUid;

  const result = await odooJsonRpc({
    service: 'common',
    method: 'authenticate',
    args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
  });

  if (!result) throw new Error('No se pudo autenticar en Odoo (uid nulo)');

  cachedUid = result;
  console.log('Autenticado en Odoo, uid =', cachedUid);
  return cachedUid;
}

async function odooExecuteKw(model, method, args = [], kwargs = {}) {
  const uid = await getOdooUid();

  const baseContext = {
    ...(kwargs.context || {}),
  };

  if (ODOO_COMPANY_ID) {
    baseContext.company_id = ODOO_COMPANY_ID;
    baseContext.allowed_company_ids = [ODOO_COMPANY_ID];
  }

  const finalKwargs = {
    ...kwargs,
    context: baseContext,
  };

  const result = await odooJsonRpc({
    service: 'object',
    method: 'execute_kw',
    args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, finalKwargs],
  });

  return result;
}

// =====================
// UTILIDADES
// =====================

function formatDateForOdoo(value) {
  if (!value) return null;

  const d = value instanceof Date ? value : new Date(value);

  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function ladoMayorDelCano(perfil) {
  if (!perfil) return null;

  const s = String(perfil).trim();
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;

  const a = parseFloat(m[1].replace(',', '.'));
  const b = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  return Math.max(a, b);
}

function calcularLargoEspada({ DATOS_Brazos } = {}) {
  if (DATOS_Brazos === null || DATOS_Brazos === undefined) return null;

  if (typeof DATOS_Brazos === 'number' && Number.isFinite(DATOS_Brazos)) return DATOS_Brazos;

  if (typeof DATOS_Brazos === 'string') {
    const s = DATOS_Brazos.trim();

    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        const obj = JSON.parse(s);
        const candidates = [
          obj?.espada,
          obj?.ESPADA,
          obj?.largo_espada,
          obj?.LARGO_ESPADA,
          obj?.calc_espada,
          obj?.CALC_ESPADA,
        ].filter((v) => v !== undefined && v !== null);

        for (const v of candidates) {
          const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
          if (typeof n === 'number' && Number.isFinite(n)) return n;
        }
      } catch {
        // sigue abajo
      }
    }

    const m =
      s.match(/espada\s*[:=]\s*(\d+(?:[.,]\d+)?)/i) ||
      s.match(/largo\s*espada\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }

    return null;
  }

  if (typeof DATOS_Brazos === 'object') {
    const candidates = [
      DATOS_Brazos?.espada,
      DATOS_Brazos?.ESPADA,
      DATOS_Brazos?.largo_espada,
      DATOS_Brazos?.LARGO_ESPADA,
      DATOS_Brazos?.calc_espada,
      DATOS_Brazos?.CALC_ESPADA,
    ].filter((v) => v !== undefined && v !== null);

    for (const v of candidates) {
      const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
      if (typeof n === 'number' && Number.isFinite(n)) return n;
    }
  }

  return null;
}

async function getOrCreatePartnerFromHeader(header) {
  const cuit = header.cuit ? String(header.cuit).trim() : null;
  const clienteCode = header.cliente != null ? String(header.cliente).trim() : null;

  const nombre = header.nombre && String(header.nombre).trim() ? String(header.nombre).trim() : 'Cliente sin nombre';

  let domain;

  if (cuit && clienteCode) {
    domain = ['|', ['vat', '=', cuit], ['ref', '=', clienteCode]];
  } else if (cuit) {
    domain = [['vat', '=', cuit]];
  } else if (clienteCode) {
    domain = [['ref', '=', clienteCode]];
  } else {
    domain = [['name', '=', nombre]];
  }

  const foundIds = await odooExecuteKw('res.partner', 'search', [domain], { limit: 1 });

  if (foundIds.length) {
    console.log(`Usando partner existente ${foundIds[0]} para cliente ${nombre}`);
    return foundIds[0];
  }

  const vals = {
    name: nombre,
    customer_rank: 1,
  };

  if (clienteCode) vals.ref = clienteCode;
  if (cuit) vals.vat = cuit;
  if (header.direccion) vals.street = String(header.direccion).trim();
  if (header.localidad) vals.city = String(header.localidad).trim();
  if (header.cp) vals.zip = String(header.cp).trim();
  if (ODOO_COMPANY_ID) vals.company_id = ODOO_COMPANY_ID;

  const newPartnerId = await odooExecuteKw('res.partner', 'create', [vals]);
  console.log(`Creado nuevo partner ${newPartnerId} para cliente ${nombre}`);
  return newPartnerId;
}

async function calculateAndAddProperties(row) {
  try {
    const perfil = row.PARANTES_Descripcion;
    row.lado_mas_alto = ladoMayorDelCano(perfil);

    row.calc_espada = calcularLargoEspada({
      perfil,
      Largo_Parantes: row.Largo_Parantes,
      DATOS_Brazos: row.DATOS_Brazos,
    });

    return row;
  } catch (e) {
    console.warn(`No se pudieron calcular propiedades (NV=${row?.NV}):`, e.message || e);
    return row;
  }
}

async function syncPreproduccionToSupabaseFromSqlRows(sqlRows) {
  if (!supabasePool || !sqlRows || !sqlRows.length) return;

  const compiled = await getCompiledFormulasFromDb();

  for (const row of sqlRows) {
    const updatedRow = await calculateAndAddProperties(row);
    await upsertPreproduccionSqlRow(updatedRow);
    await upsertPreproduccionValoresFillDerived(updatedRow, compiled);
  }
}

// =====================
// SYNC ASYNC (OPCIÓN A)
// - No bloquea la respuesta de /api/pre-produccion
// - Dedup por NV y cola simple
// =====================

let syncRunning = false;
const syncQueueByNv = new Map(); // nv(string) -> row

function enqueuePreproduccionSync(rows) {
  if (!supabasePool || !Array.isArray(rows) || !rows.length) return;

  for (const r of rows) {
    const nvKey = r?.NV !== null && r?.NV !== undefined ? String(r.NV).trim() : '';
    if (!nvKey) continue;
    syncQueueByNv.set(nvKey, r);
  }

  schedulePreproduccionSyncWorker();
}

function schedulePreproduccionSyncWorker() {
  if (syncRunning) return;

  syncRunning = true;

  setImmediate(async () => {
    try {
      while (syncQueueByNv.size > 0) {
        // Tomamos un batch y vaciamos cola
        const batch = Array.from(syncQueueByNv.values());
        syncQueueByNv.clear();

        try {
          await syncPreproduccionToSupabaseFromSqlRows(batch);
        } catch (e) {
          console.error('Error sincronizando Pre_Produccion con Supabase (async batch):', e?.message || e);
        }
      }
    } finally {
      syncRunning = false;

      // Si entraron cosas mientras corría, reprogramamos
      if (syncQueueByNv.size > 0) {
        schedulePreproduccionSyncWorker();
      }
    }
  });
}

// =====================
// EXPRESS APP
// =====================

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// =====================
// ME (privado)
// =====================
app.get('/api/me', requireAuth, attachRole, (req, res) => {
  return res.json({
    user: { id: req.user.id, email: req.user.email },
    role: req.role || 'viewer',
  });
});

// =====================
// PUBLIC (solo para modo PDF link)
// =====================

// Lectura pública de fórmulas (solo si el PdfLinkView lo requiere)
app.get('/api/public/formulas', async (_req, res) => {
  try {
    const formulas = await getAllColumnFormulas();
    return res.json({ formulas });
  } catch (err) {
    console.error('Error en /api/public/formulas (GET):', err);
    return res.status(500).json({
      error: 'Error obteniendo fórmulas',
      details: err.message || String(err),
    });
  }
});

// Lectura pública de "valores definitivos" (para generar PDF por link)
app.get('/api/public/pre-produccion-valores', async (req, res) => {
  const { nv, partida } = req.query;

  try {
    const rows = await getPreProduccionValoresRows({ nv, partida });
    return res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('Error en /api/public/pre-produccion-valores:', err);
    return res.status(500).json({
      error: 'Error interno obteniendo Pre_Produccion (valores)',
      details: err.message || String(err),
    });
  }
});

// ---------------------
// API Sincronización Odoo (privada)
// ---------------------
app.post('/api/sync/order-from-sql', requireAuth, attachRole, requireRole(['admin']), async (req, res) => {
  const { idpedido, partner_id } = req.body;

  if (!idpedido) {
    return res.status(400).json({ error: 'Falta parámetro: idpedido es requerido' });
  }

  try {
    const header = await getNtavHeader(idpedido);
    if (!header) {
      return res.status(404).json({ error: `No se encontró NTASVTAS.idpedido = ${idpedido}` });
    }

    let partnerIdFinal = partner_id;
    if (!partnerIdFinal) {
      partnerIdFinal = await getOrCreatePartnerFromHeader(header);
    }

    const lines = await getNtavLinesFromHeader(header);
    if (!lines.length) {
      return res.status(404).json({
        error: `No se encontraron líneas en INTASVTAS para la nota (tipo=${header.tipo}, sucursal=${header.sucursal}, numero=${header.numero}, deposito=${header.deposito})`,
      });
    }

    const clientOrderRefParts = [header.tipo || '', header.sucursal || '', header.numero || ''].filter((p) => p !== '');
    const clientOrderRef = clientOrderRefParts.join('-');

    const orderVals = {
      partner_id: partnerIdFinal,
      origin: `NTASVTAS ${idpedido}`,
    };

    if (ODOO_COMPANY_ID) orderVals.company_id = ODOO_COMPANY_ID;

    const odooDate = formatDateForOdoo(header.fecha);
    if (odooDate) orderVals.date_order = odooDate;
    if (clientOrderRef) orderVals.client_order_ref = clientOrderRef;

    const orderId = await odooExecuteKw('sale.order', 'create', [orderVals]);
    console.log('Creado sale.order ID', orderId);

    let createdLines = 0;
    const missingProducts = [];

    for (const line of lines) {
      const rawCode = line.producto || '';
      const rawDesc = line.descripcion || '';

      const productoCodigo = rawCode.trim();
      const descripcion = rawDesc.trim();

      let productId = null;

      if (productoCodigo) {
        const idsByCode = await odooExecuteKw('product.product', 'search', [[['default_code', '=', productoCodigo]]], {
          limit: 1,
        });
        if (idsByCode.length) productId = idsByCode[0];
      }

      if (!productId && descripcion) {
        const idsByName = await odooExecuteKw('product.product', 'search', [[['name', 'ilike', descripcion]]], {
          limit: 1,
        });
        if (idsByName.length) productId = idsByName[0];
      }

      if (!productId) {
        console.warn(`Producto no encontrado en Odoo, se salta la línea. COD=${productoCodigo}, DESC=${descripcion}`);
        missingProducts.push({ codigo: productoCodigo, descripcion });
        continue;
      }

      const priceUnit = (line.preneto && line.preneto !== 0 ? line.preneto : line.precio) || 0;
      const discount = line.bonific || 0;
      const qty = line.cantidad || 0;

      const lineVals = {
        order_id: orderId,
        product_id: productId,
        name: descripcion || productoCodigo,
        product_uom_qty: qty,
        price_unit: priceUnit,
        discount,
      };

      await odooExecuteKw('sale.order.line', 'create', [lineVals]);
      createdLines += 1;
    }

    const orders = await odooExecuteKw('sale.order', 'read', [[orderId], ['amount_total']]);
    const amountTotal = orders[0]?.amount_total || 0;

    const numero = header.numero;
    if (numero != null) {
      const portonDomain = [['x_nota_de_venta', '=', numero]];
      const portonIds = await odooExecuteKw('x_dflex.porton', 'search', [portonDomain], { limit: 1 });

      if (portonIds.length) {
        await odooExecuteKw('x_dflex.porton', 'write', [
          portonIds,
          {
            x_studio_sale_order_id: orderId,
            x_base_value: amountTotal,
          },
        ]);
        console.log(`Portón ${portonIds[0]} vinculado al pedido ${orderId}`);
      } else {
        console.log(`No se encontró x_dflex.porton con x_nota_de_venta = ${numero} (no se vincula)`);
      }
    }

    return res.json({
      success: true,
      order_id: orderId,
      amount_total: amountTotal,
      lines_read: lines.length,
      lines_created: createdLines,
      missing_products: missingProducts,
      partner_id: partnerIdFinal,
    });
  } catch (err) {
    console.error('Error en /api/sync/order-from-sql:', err);
    return res.status(500).json({
      error: 'Error interno sincronizando con Odoo',
      details: err.message || String(err),
    });
  }
});

// ---------------------
// API Pre_Produccion (privada)
// ---------------------
app.get('/api/pre-produccion', requireAuth, attachRole, async (req, res) => {
  const { nv } = req.query;

  try {
    const rows = await getPreProduccionRows(nv);

    // ✅ OPCIÓN A: NO BLOQUEAR RESPUESTA CON SYNC
    try {
      if (rows.length && supabasePool) {
        enqueuePreproduccionSync(rows);
      }
    } catch (syncErr) {
      console.error('Error encolando sync Pre_Produccion (async):', syncErr?.message || syncErr);
    }

    return res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('Error en /api/pre-produccion:', err);
    return res.status(500).json({
      error: 'Error interno obteniendo Pre_Produccion',
      details: err.message || String(err),
    });
  }
});

app.get('/api/pre-produccion-valores', requireAuth, attachRole, async (req, res) => {
  const { nv, partida } = req.query;

  try {
    const rows = await getPreProduccionValoresRows({ nv, partida });
    return res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('Error en /api/pre-produccion-valores:', err);
    return res.status(500).json({
      error: 'Error interno obteniendo Pre_Produccion (valores)',
      details: err.message || String(err),
    });
  }
});

// ---------------------
// API Fórmulas (privada)
// ---------------------
app.get('/api/formulas', requireAuth, attachRole, async (_req, res) => {
  try {
    const formulas = await getAllColumnFormulas();
    return res.json({ formulas });
  } catch (err) {
    console.error('Error en /api/formulas (GET):', err);
    return res.status(500).json({
      error: 'Error obteniendo fórmulas',
      details: err.message || String(err),
    });
  }
});

app.post('/api/formulas', requireAuth, attachRole, requireRole(['admin', 'formula_editor']), async (req, res) => {
  const { column_name, expression } = req.body || {};
  if (!column_name) return res.status(400).json({ error: 'Falta column_name' });

  try {
    const row = await upsertColumnFormula(column_name, expression || '');
    return res.json({ formula: row });
  } catch (err) {
    console.error('Error en /api/formulas (POST):', err);
    return res.status(500).json({
      error: 'Error guardando fórmula',
      details: err.message || String(err),
    });
  }
});

// ---------------------
// Bulk Update (privado)
// ---------------------
app.post(
  '/api/pre-produccion-valores/bulk-update',
  requireAuth,
  attachRole,
  requireRole(['admin', 'data_editor']),
  async (req, res) => {
    if (!supabasePool) {
      return res.status(500).json({ error: 'SUPABASE_DB_URL no está configurado' });
    }

    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) {
      return res.status(400).json({ error: 'Falta updates[] en el body' });
    }

    function sanitizeChanges(changes) {
      const out = {};
      if (!changes || typeof changes !== 'object') return out;

      for (const [k, v] of Object.entries(changes)) {
        if (!k || typeof k !== 'string') continue;
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (k.length > 200) continue;
        out[k] = v;
      }
      return out;
    }

    const client = await supabasePool.connect();

    try {
      await client.query('BEGIN');

      let applied = 0;
      let skipped = 0;

      for (const u of updates) {
        const nvParsed = parseInt(u?.nv, 10);
        if (!Number.isFinite(nvParsed)) {
          skipped += 1;
          continue;
        }

        const changes = sanitizeChanges(u?.changes);
        if (!Object.keys(changes).length) {
          skipped += 1;
          continue;
        }

        // ✅ mismo criterio: necesitamos id para no violar NOT NULL
        const idVal = u?.id ?? u?.ID ?? null;

        // Si el front no manda id, lo buscamos por nv en preproduccion_sql
        let effectiveId = idVal;
        if (effectiveId == null) {
          const r = await client.query('SELECT id FROM preproduccion_sql WHERE nv = $1 LIMIT 1', [nvParsed]);
          effectiveId = r?.rows?.[0]?.id ?? null;
        }

        if (effectiveId == null) {
          skipped += 1;
          console.warn('bulk-update: no se encontró id para NV', nvParsed, '(se saltea)');
          continue;
        }

        await client.query(
          `
            INSERT INTO preproduccion_valores (id, nv, data)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (nv)
            DO UPDATE SET
              data = COALESCE(preproduccion_valores.data, '{}'::jsonb) || EXCLUDED.data,
              updated_at = now()
          `,
          [effectiveId, nvParsed, JSON.stringify(changes)]
        );

        applied += 1;
      }

      await client.query('COMMIT');

      return res.json({ success: true, applied, skipped });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }

      console.error('Error en /api/pre-produccion-valores/bulk-update:', err);
      return res.status(500).json({
        error: 'Error interno guardando cambios',
        details: err.message || String(err),
      });
    } finally {
      client.release();
    }
  }
);

// =====================
// ARRANCAR SERVIDOR
// =====================
app.listen(PORT, () => {
  console.log(`Dflex sync backend escuchando en puerto ${PORT}`);
});
