// Corre `fn` sobre `items` con un máximo de `limite` en simultáneo, en vez de disparar
// todo con Promise.all sin control — con un CSV de 150-200 filas eso significaba hasta
// ~600 llamadas concurrentes a Odoo (hasta 3 por fila: proveedor, tipo de comprobante,
// factura), lo que hacía fallar un porcentaje de las consultas por sobrecarga y esas
// aparecían como "Pendiente" en la tabla aunque el comprobante sí estuviera cargado.
async function mapWithConcurrency(items, limite, fn) {
  const resultados = new Array(items.length);
  let siguiente = 0;

  async function trabajador() {
    while (true) {
      const i = siguiente++;
      if (i >= items.length) return;
      resultados[i] = await fn(items[i], i);
    }
  }

  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, trabajador);
  await Promise.all(trabajadores);
  return resultados;
}

// Reintenta `fn` una vez más si la primera llamada tira error (red/timeout transitorio
// contra Odoo), antes de darse por vencido.
async function conReintento(fn, intentos = 2, esperaMs = 300) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      if (i < intentos - 1) await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
  throw ultimoError;
}

module.exports = { mapWithConcurrency, conReintento };
