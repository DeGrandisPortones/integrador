// Reconstruye las líneas de factura a partir del desglose de IVA del CSV de ARCA,
// y valida que el desglose realmente explique el Imp. Total del comprobante.
// Mapeo de alícuota -> account.tax de compras, confirmado contra Odoo el 2026-08-27.
const TAX_BRACKETS = [
  { netField: 'netoIva0', ivaField: null, taxId: 59, label: 'IVA 0%' }, // "VAT 0%" (gravado a tasa 0, sin monto de IVA propio)
  { netField: 'netoIva25', ivaField: 'ivaMonto25', taxId: 67, label: 'IVA 2,5%' }, // "VAT 2.5%" — archivada en Odoo
  { netField: 'netoIva5', ivaField: 'ivaMonto5', taxId: 69, label: 'IVA 5%' }, // "VAT 5%" — archivada en Odoo
  { netField: 'netoIva105', ivaField: 'ivaMonto105', taxId: 61, label: 'IVA 10,5%' },
  { netField: 'netoIva21', ivaField: 'ivaMonto21', taxId: 63, label: 'IVA 21%' },
  { netField: 'netoIva27', ivaField: 'ivaMonto27', taxId: 65, label: 'IVA 27%' },
];

const TAX_NO_GRAVADO = 55; // "0% NT"
const TAX_EXENTO = 57; // "0% EXEMPT"
const CUENTA_OTROS_TRIBUTOS = 990; // 1.1.4.02.001 "Percepciones iva"

// Producto a usar en las líneas de compra, confirmado con administración el 2026-08-31
// (product.template id 3738 "VIATICOS" -> variante real product.product id 4209, que es
// lo que espera el campo product_id de account.move.line). Se aplica a las líneas que
// representan la compra en sí (los tramos de IVA + no gravado + exento), no a "Otros
// Tributos" ni al ajuste de revisión, que son percepciones/diferencias, no el producto.
const PRODUCTO_ID = 4209;

const TOLERANCIA = 0.02;

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * @param {object} fila - fila normalizada del CSV (ver csvParser.js)
 * @returns {{ valido: boolean, diferencia: number, esperado: number }}
 */
function validarCierre(fila) {
  const reconstruido = round2(
    (fila.impNetoGravadoTotal || 0) +
    (fila.impNetoNoGravado || 0) +
    (fila.impExento || 0) +
    (fila.otrosTributos || 0) +
    (fila.totalIva || 0)
  );
  const diferencia = round2(reconstruido - (fila.impTotal || 0));
  return { valido: Math.abs(diferencia) <= TOLERANCIA, diferencia, esperado: reconstruido };
}

/**
 * @param {object} fila - fila normalizada del CSV
 * @param {number} accountId - cuenta contable elegida por el usuario para el neto principal
 * @returns {Array<object>} invoice_line_ids en formato Odoo (sin el wrapper [0,0,...])
 */
function construirLineas(fila, accountId) {
  const lineas = [];

  for (const bracket of TAX_BRACKETS) {
    const neto = fila[bracket.netField] || 0;
    if (neto === 0) continue;
    lineas.push({
      name: `Comprobante ARCA ${fila.puntoVenta}-${fila.numero} — ${bracket.label}`,
      product_id: PRODUCTO_ID,
      account_id: accountId,
      quantity: 1,
      price_unit: neto,
      tax_ids: [[6, 0, [bracket.taxId]]],
    });
  }

  if (fila.impNetoNoGravado) {
    lineas.push({
      name: `Comprobante ARCA ${fila.puntoVenta}-${fila.numero} — No gravado`,
      product_id: PRODUCTO_ID,
      account_id: accountId,
      quantity: 1,
      price_unit: fila.impNetoNoGravado,
      tax_ids: [[6, 0, [TAX_NO_GRAVADO]]],
    });
  }

  if (fila.impExento) {
    lineas.push({
      name: `Comprobante ARCA ${fila.puntoVenta}-${fila.numero} — Exento`,
      product_id: PRODUCTO_ID,
      account_id: accountId,
      quantity: 1,
      price_unit: fila.impExento,
      tax_ids: [[6, 0, [TAX_EXENTO]]],
    });
  }

  if (fila.otrosTributos) {
    lineas.push({
      name: `Comprobante ARCA ${fila.puntoVenta}-${fila.numero} — Otros tributos`,
      account_id: CUENTA_OTROS_TRIBUTOS,
      quantity: 1,
      price_unit: fila.otrosTributos,
      // Sin tax_ids: el monto ya es el importe final del tributo, no una base a la que aplicar IVA.
    });
  }

  return lineas;
}

module.exports = { validarCierre, construirLineas, TAX_BRACKETS, CUENTA_OTROS_TRIBUTOS, PRODUCTO_ID };
