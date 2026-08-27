// Lógica para decidir si un comprobante del CSV de ARCA ya está cargado en Odoo.
// Criterio: CUIT del proveedor + tipo de comprobante + punto de venta + número
// (formato 0001-00012345, el estándar de la localización argentina de Odoo).
//
// El CSV de "Mis Comprobantes Recibidos" trae en "Tipo de Comprobante" el código
// numérico oficial de ARCA/AFIP (ej. "1", "6", "11"...), que coincide directo con el
// campo `code` de l10n_latam.document.type en Odoo (confirmado contra datos reales el
// 2026-08-27) — no hace falta ninguna tabla de mapeo intermedia.
const { odooExecuteKw, ODOO_COMPANY_ID } = require('../odooClient');

function onlyDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function formatDocumentNumber(puntoVenta, numero) {
  const pv = onlyDigits(puntoVenta).padStart(4, '0');
  const num = onlyDigits(numero).padStart(8, '0');
  return `${pv}-${num}`;
}

function formatCuitWithDashes(cuitDigits) {
  if (cuitDigits.length !== 11) return cuitDigits;
  return `${cuitDigits.slice(0, 2)}-${cuitDigits.slice(2, 10)}-${cuitDigits.slice(10)}`;
}

const partnerCache = new Map();
async function findPartnerByCuit(cuit) {
  const cuitDigits = onlyDigits(cuit);
  if (partnerCache.has(cuitDigits)) return partnerCache.get(cuitDigits);

  // Puede estar cargado en Odoo con o sin guiones ("20-12345678-9" o "20123456789").
  const partners = await odooExecuteKw('res.partner', 'search_read', [
    ['|', ['vat', 'ilike', cuitDigits], ['vat', 'ilike', formatCuitWithDashes(cuitDigits)]],
  ], { fields: ['id', 'name', 'vat'], limit: 5 });

  const found = partners.find((p) => onlyDigits(p.vat) === cuitDigits) || null;
  partnerCache.set(cuitDigits, found);
  return found;
}

const docTypeCache = new Map();
async function findDocumentTypeByCode(code) {
  const codeStr = String(code || '').trim();
  if (!codeStr) return null;
  if (docTypeCache.has(codeStr)) return docTypeCache.get(codeStr);
  const types = await odooExecuteKw('l10n_latam.document.type', 'search_read', [
    [['code', '=', codeStr]],
  ], { fields: ['id', 'name', 'code'], limit: 1 });
  const found = types[0] || null;
  docTypeCache.set(codeStr, found);
  return found;
}

/**
 * Determina si un comprobante recibido ya existe en Odoo.
 * @param {{ cuit: string, tipoComprobanteCodigo: string, puntoVenta: string|number, numero: string|number }} comprobante
 */
async function isComprobanteLoaded(comprobante) {
  const { cuit, tipoComprobanteCodigo, puntoVenta, numero } = comprobante;

  const partner = await findPartnerByCuit(cuit);
  if (!partner) {
    return { loaded: false, reason: 'proveedor_no_encontrado' };
  }

  const docType = await findDocumentTypeByCode(tipoComprobanteCodigo);
  if (!docType) {
    return { loaded: false, reason: 'tipo_documento_no_existe_en_odoo' };
  }

  const documentNumber = formatDocumentNumber(puntoVenta, numero);

  const moves = await odooExecuteKw('account.move', 'search_read', [
    [
      ['move_type', 'in', ['in_invoice', 'in_refund']],
      ['company_id', '=', ODOO_COMPANY_ID],
      ['partner_id', '=', partner.id],
      ['l10n_latam_document_type_id', '=', docType.id],
      ['l10n_latam_document_number', '=', documentNumber],
    ],
  ], { fields: ['id', 'state'], limit: 1 });

  if (moves.length > 0) {
    return { loaded: true, moveId: moves[0].id, partnerId: partner.id, documentTypeId: docType.id };
  }
  return { loaded: false, partnerId: partner.id, documentTypeId: docType.id };
}

module.exports = {
  isComprobanteLoaded,
  findPartnerByCuit,
  findDocumentTypeByCode,
  formatDocumentNumber,
  formatCuitWithDashes,
  onlyDigits,
};
