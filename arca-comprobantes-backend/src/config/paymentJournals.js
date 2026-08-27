// Diarios de pago disponibles para DFLEX ARGENTINA S.A.S. (company_id=1), confirmados
// contra Odoo el 2026-08-26. Fijos a propósito (no se traen en vivo) — si se agrega
// o da de baja una tarjeta en Odoo, hay que actualizar esta lista a mano.
//
// "journalName" es el nombre TÉCNICO que devuelve la API (puede no coincidir con el
// label que se ve en la interfaz de Odoo, ej. id 7 se ve como "Efectivo" en pantalla
// pero la API lo devuelve como "Cash" — es el mismo registro).

const PAYMENT_JOURNALS = [
  {
    key: 'efectivo',
    label: 'Efectivo',
    journalId: 7,
    journalName: 'Cash', // se muestra como "Efectivo" en la UI de Odoo
    type: 'cash',
  },
  {
    key: 'efectivo_b',
    label: 'Efectivo B',
    journalId: 55,
    journalName: 'Efectivo B',
    type: 'cash',
  },
  {
    key: 'tarjeta_cordobesa_visa',
    label: 'Tarjeta de crédito Cordobesa VISA',
    journalId: 76,
    journalName: 'Tarjeta de crédito Cordobesa VISA a pagar',
    type: 'credit',
  },
  {
    key: 'tarjeta_visa_santander',
    label: 'Tarjeta de crédito VISA Santander',
    journalId: 77,
    journalName: 'Tarjeta de crédito VISA Santander',
    type: 'credit',
  },
  {
    key: 'tarjeta_pyme_nacion',
    label: 'Tarjeta de crédito PYME Nación',
    journalId: 78,
    journalName: 'Tarjeta de crédito PYME Nación',
    type: 'credit',
  },
  {
    key: 'tarjeta_visa_bna_corporativa',
    label: 'Tarjeta de crédito VISA BNA Corporativa',
    journalId: 79,
    journalName: 'Tarjeta de crédito VISA BNA Corporativa',
    type: 'credit',
  },
  {
    key: 'tarjeta_visa_bbva',
    label: 'Tarjeta de crédito VISA BBVA',
    journalId: 80,
    journalName: 'Tarjeta de crédito VISA BBVA',
    type: 'credit',
  },
];

function getJournalByKey(key) {
  return PAYMENT_JOURNALS.find((j) => j.key === key) || null;
}

module.exports = { PAYMENT_JOURNALS, getJournalByKey };
