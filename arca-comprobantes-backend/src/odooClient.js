// Cliente Odoo por JSON-RPC. Mismo patrón probado en Integrador/dflex-sync-backend.
require('dotenv').config();
const axios = require('axios');

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;
const ODOO_COMPANY_ID = process.env.ODOO_COMPANY_ID ? parseInt(process.env.ODOO_COMPANY_ID, 10) : null;

if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
  console.warn('[odooClient] Faltan variables de entorno ODOO_* — revisá tu .env');
}

let cachedUid = null;

async function odooJsonRpc(params) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params,
    id: Math.floor(Math.random() * 1e9),
  };
  const response = await axios.post(`${ODOO_URL}/jsonrpc`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  if (response.data.error) {
    console.error('Error JSON-RPC Odoo:', JSON.stringify(response.data.error));
    const msg =
      response.data.error?.data?.message ||
      response.data.error?.message ||
      'Error desconocido de Odoo';
    throw new Error(msg);
  }
  return response.data.result;
}

async function getOdooUid() {
  if (cachedUid) return cachedUid;
  const result = await odooJsonRpc({
    service: 'common',
    method: 'login',
    args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD],
  });
  if (!result) throw new Error('No se pudo autenticar en Odoo (uid nulo). Revisá usuario/password o API Key.');
  cachedUid = result;
  console.log('Autenticado en Odoo, uid =', cachedUid);
  return cachedUid;
}

async function odooExecuteKw(model, method, args = [], kwargs = {}) {
  const uid = await getOdooUid();

  const baseContext = {};
  if (ODOO_COMPANY_ID) {
    baseContext.company_id = ODOO_COMPANY_ID;
    baseContext.allowed_company_ids = [ODOO_COMPANY_ID];
  }
  const finalKwargs = { ...kwargs, context: { ...baseContext, ...(kwargs.context || {}) } };

  return odooJsonRpc({
    service: 'object',
    method: 'execute_kw',
    args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, finalKwargs],
  });
}

module.exports = { odooJsonRpc, getOdooUid, odooExecuteKw, ODOO_COMPANY_ID };
