// Crea en Odoo, para un comprobante seleccionado, la factura de compra.
//
// - Si el desglose de IVA del CSV cierra contra el Imp. Total (dentro de la tolerancia):
//   crea la factura, la postea, y registra + concilia el pago con el diario elegido —
//   mismo mecanismo que el botón "Registrar Pago" en la ficha de la factura.
// - Si NO cierra (ej. Facturas B sin discriminar, u otros casos raros del export de
//   ARCA): crea la factura como BORRADOR con una línea adicional "AJUSTE A REVISAR" por
//   la diferencia, para que el total quede correcto, pero no la postea ni la paga —
//   queda para que la revises y corrijas vos a mano en Odoo.
const { odooExecuteKw, ODOO_COMPANY_ID } = require('../odooClient');
const { getJournalByKey } = require('../config/paymentJournals');
const { findPartnerByCuit, findDocumentTypeByCode, formatDocumentNumber } = require('./matcher');
const { validarCierre, construirLineas } = require('./breakdown');

/**
 * @param {object} comprobante - fila normalizada del CSV de ARCA (ver csvParser.js)
 * @param {string} journalKey - key de src/config/paymentJournals.js
 * @param {number} accountId - cuenta contable elegida por el usuario para el neto principal
 */
async function crearFacturaYPago(comprobante, journalKey, accountId) {
  if (!accountId) throw new Error('Falta elegir la cuenta contable para este comprobante.');

  const journal = getJournalByKey(journalKey);
  if (!journal) throw new Error(`Modo de pago desconocido: ${journalKey}`);

  const partner = await findPartnerByCuit(comprobante.cuit);
  if (!partner) {
    throw new Error(`No se encontró en Odoo un proveedor con CUIT ${comprobante.cuit}. Cargalo primero como contacto.`);
  }

  const docType = await findDocumentTypeByCode(comprobante.tipoComprobanteCodigo);
  if (!docType) {
    throw new Error(`Tipo de comprobante ARCA "${comprobante.tipoComprobanteCodigo}" no existe en Odoo.`);
  }

  const documentNumber = formatDocumentNumber(comprobante.puntoVenta, comprobante.numero);
  const cierre = validarCierre(comprobante);
  const lineas = construirLineas(comprobante, accountId);

  if (!cierre.valido) {
    const ajuste = Math.round((comprobante.impTotal - cierre.esperado + Number.EPSILON) * 100) / 100;
    lineas.push({
      name:
        `Comprobante ARCA ${documentNumber} — AJUSTE A REVISAR ` +
        `(el export de ARCA no discrimina $${Math.abs(ajuste).toFixed(2)} de este comprobante; revisar y corregir a mano)`,
      account_id: accountId,
      quantity: 1,
      price_unit: ajuste,
    });
  }

  const invoiceVals = {
    move_type: 'in_invoice',
    company_id: ODOO_COMPANY_ID,
    partner_id: partner.id,
    invoice_date: comprobante.fechaEmision,
    ref: documentNumber,
    l10n_latam_document_type_id: docType.id,
    l10n_latam_document_number: documentNumber,
    invoice_line_ids: lineas.map((linea) => [0, 0, linea]),
  };

  const moveId = await odooExecuteKw('account.move', 'create', [invoiceVals]);

  if (!cierre.valido) {
    // Queda en borrador para revisión manual — no se postea ni se paga.
    return {
      status: 'borrador_revisar',
      moveId,
      documentNumber,
      diferencia: cierre.diferencia,
    };
  }

  await odooExecuteKw('account.move', 'action_post', [[moveId]]);

  const contextPago = {
    active_model: 'account.move',
    active_ids: [moveId],
    company_id: ODOO_COMPANY_ID,
    allowed_company_ids: [ODOO_COMPANY_ID],
  };
  const wizardId = await odooExecuteKw('account.payment.register', 'create', [{
    journal_id: journal.journalId,
    payment_date: comprobante.fechaEmision,
  }], { context: contextPago });

  await odooExecuteKw('account.payment.register', 'action_create_payments', [[wizardId]], { context: contextPago });

  return { status: 'cargado_y_pagado', moveId, documentNumber };
}

module.exports = { crearFacturaYPago };
