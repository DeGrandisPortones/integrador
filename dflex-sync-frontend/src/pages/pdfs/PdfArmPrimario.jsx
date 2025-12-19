// src/pages/pdfs/PdfArmPrimario.jsx
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

// =====================
// Helpers
// =====================
function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(',', '.');
  const m = s.match(/-?\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

// Heurística: si viene en cm (<500), pasar a mm (*10). Si ya es mm, queda igual.
function toMM(n) {
  const v = toNum(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v < 500 ? v * 10 : v;
}

function todayDDMMYY() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(
    d.getFullYear()
  ).slice(-2)}`;
}

// Texto ajustado a ancho (reduce size y/o trunca)
function drawFittedText(page, font, text, x, y, opts = {}) {
  const { size = 9, minSize = 6, maxWidth = null, color = rgb(0, 0, 0) } =
    opts;

  const t = toStr(text);
  if (!t) return;

  if (!maxWidth) {
    page.drawText(t, { x, y, size, font, color });
    return;
  }

  let s = size;
  while (s >= minSize) {
    const w = font.widthOfTextAtSize(t, s);
    if (w <= maxWidth) break;
    s -= 0.5;
  }

  let finalText = t;
  if (font.widthOfTextAtSize(finalText, s) > maxWidth) {
    while (
      finalText.length > 0 &&
      font.widthOfTextAtSize(finalText + '…', s) > maxWidth
    ) {
      finalText = finalText.slice(0, -1);
    }
    finalText = finalText ? finalText + '…' : '';
  }

  page.drawText(finalText, { x, y, size: s, font, color });
}

// =====================
// Posiciones
// =====================
const POS = {
  header: {
    fecha: { x: 112.0, y: 545.0, size: 11, maxWidth: 90 },
    partida: { x: 240.0, y: 545.0, size: 11, maxWidth: 140 },
    cliente: { x: 112.0, y: 528.0, size: 10, maxWidth: 280 },
    nv: { x: 124.0, y: 512.0, size: 10, maxWidth: 120 },
    razsoc: { x: 259.0, y: 512.0, size: 9, maxWidth: 260 },
    revest: { x: 205.0, y: 496.5, size: 9, maxWidth: 220 },
    nsistema: { x: 140.0, y: 496.5, size: 9, maxWidth: 90 },
  },

  scheme: {
    dintelAncho: { x: 192.5, y: 460.0, size: 10, maxWidth: 60 },
    alto: { x: 25.0, y: 345.5, size: 10, maxWidth: 60 },
    // OJO: "altoMenos10" ahora se imprime desde PIERNAS_Altura (ver lógica abajo)
    altoMenos10: { x: 75.0, y: 345.5, size: 10, maxWidth: 60 },
    dintelMenos: { x: 193.0, y: 245.0, size: 10, maxWidth: 60 },
  },

  paso1: {
    piernasTipo: { x: 58.0, y: 196.0, size: 9, maxWidth: 95 },
    piernasAltura: { x: 120.0, y: 196.0, size: 9, maxWidth: 60 },
    dintelTipo: { x: 60.0, y: 184.0, size: 9, maxWidth: 95 },
    dintelAncho: { x: 120.0, y: 184.0, size: 9, maxWidth: 60 },
  },

  paso2: {
    rbjSiNo: { x: 124.0, y: 160.0, size: 9, maxWidth: 50 },
    rbjDesc: { x: 238.0, y: 160.0, size: 9, maxWidth: 60 },
    rebSiNo: { x: 124.0, y: 149.0, size: 9, maxWidth: 50 },
    rebDesc: { x: 238.0, y: 149.0, size: 9, maxWidth: 60 },
  },

  paso3: {
    parCant: { x: 60.0, y: 125.5, size: 9, maxWidth: 30 },
    parDist: { x: 95.0, y: 130.5, size: 8, maxWidth: 120 },
    puerta1: { x: 51.5, y: 115.5, size: 8, maxWidth: 55 },
    puerta2: { x: 105.0, y: 115.5, size: 8, maxWidth: 55 },
  },

  paso4: {
    motorCond: { x: 52, y: 88.5, size: 7, maxWidth: 110 },
    motorPos: { x: 112.0, y: 88.5, size: 7, maxWidth: 110 },
    espada: { x: 60.5, y: 78.5, size: 9, maxWidth: 110 },
    empot: { x: 125.0, y: 78.0, size: 9, maxWidth: 110 },
  },

  motorLabel: {
    y: 365,
    leftX: 425,
    rightX: 670,
    size: 10,
  },

  right: {
    colorSis1: { x: 525.0, y: 244.0, size: 7, maxWidth: 80 },
    colorSis2: { x: 565.0, y: 244.0, size: 7, maxWidth: 120 },
    color1: { x: 525.0, y: 232.5, size: 7, maxWidth: 80 },
    color2: { x: 565.0, y: 232.5, size: 7, maxWidth: 120 },

    liston: { x: 525.0, y: 174.0, size: 9, maxWidth: 120 },
    vidrio: { x: 700.0, y: 174.0, size: 9, maxWidth: 120 },
    lugar: { x: 525.0, y: 121.0, size: 8, maxWidth: 260 },
  },
};

// =====================
// Lógicas de campos
// =====================
function normPiernaTipo(row) {
  const t = toStr(
    row.PIERNAS_Tipo ?? row.PIERNAS_tipo ?? row.PIERNA_Tipo
  ).toUpperCase();
  if (t.includes('ANCHA')) return 'ANCHA';
  if (t.includes('ANGOSTA')) return 'ANGOSTA';
  return t ? 'COMUN' : '';
}

function getDintelTipo(row) {
  return toStr(row.DINTEL_tipo ?? row.DINTEL_Tipo ?? row.Dintel_Tipo);
}

function getDintelAnchoMM(row) {
  return toMM(row.DINTEL_Ancho ?? row.DINTEL_ancho ?? row.Dintel_Ancho);
}

function getAltoMM(row) {
  return toMM(row.Alto ?? row.ALTO ?? row.DATOS_Alto ?? row.DATOS_ALTO);
}

function getPiernasAlturaMM(row) {
  return toMM(
    row.PIERNAS_Altura ??
      row.Piernas_Altura ??
      row.PIERNA_Altura ??
      row.Pierna_Altura ??
      row.PIERNAS_ALTURA ??
      row.piernas_altura
  );
}

function calc244(row) {
  const ancho = getDintelAnchoMM(row);
  if (!ancho) return '';
  const tipo = normPiernaTipo(row);
  const desc = tipo === 'ANCHA' ? 16 : tipo === 'ANGOSTA' ? 8 : 11;

  // ✅ CAMBIO: al resultado final hay que multiplicarlo por 100
  return String(Math.round((ancho - desc) * 100));
}

function splitTwoCells(text) {
  const s = toStr(text);
  if (!s) return ['', ''];
  const parts = s.split(/\s+/);
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts.slice(1).join(' ')];
}

// =====================
// Fetch SIEMPRE desde pre-produccion-valores
// =====================
async function fetchValores({ partida, nv }) {
  const params = new URLSearchParams();
  if (toStr(partida)) params.set('partida', toStr(partida));
  if (toStr(nv)) params.set('nv', toStr(nv));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const url = `${API_BASE_URL}/api/pre-produccion-valores${qs}`;

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} en ${url}${txt ? `: ${txt}` : ''}`);
  }

  const data = await res.json();
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return rows;
}

// =====================
// Builder principal (recibe rows YA calculados)
// =====================
export async function generatePdfArmadoPrimario(partida, rows) {
  const base = import.meta.env.BASE_URL || '/';
  const templateUrl = `${base}pdf_modelo_armPrimario.pdf`;

  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) {
    throw new Error(
      `No se pudo cargar la plantilla ${templateUrl} (status ${templateRes.status}). Revisá /public/pdf_modelo_armPrimario.pdf`
    );
  }

  const templateBytes = await templateRes.arrayBuffer();
  const templateDoc = await PDFDocument.load(templateBytes);

  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const items = [...(rows || [])].sort((a, b) => toNum(a.NV) - toNum(b.NV));

  for (const r of items) {
    const [page] = await outDoc.copyPages(templateDoc, [0]);
    outDoc.addPage(page);

    // -------- Header
    drawFittedText(page, font, todayDDMMYY(), POS.header.fecha.x, POS.header.fecha.y, {
      size: POS.header.fecha.size,
      maxWidth: POS.header.fecha.maxWidth,
    });

    drawFittedText(page, font, toStr(partida ?? r.PARTIDA), POS.header.partida.x, POS.header.partida.y, {
      size: POS.header.partida.size,
      maxWidth: POS.header.partida.maxWidth,
    });

    drawFittedText(page, font, toStr(r.Nombre ?? r.NOMBRE), POS.header.cliente.x, POS.header.cliente.y, {
      size: POS.header.cliente.size,
      maxWidth: POS.header.cliente.maxWidth,
    });

    drawFittedText(page, font, toStr(r.NV), POS.header.nv.x, POS.header.nv.y, {
      size: POS.header.nv.size,
      maxWidth: POS.header.nv.maxWidth,
    });

    drawFittedText(page, font, toStr(r.RazSoc), POS.header.razsoc.x, POS.header.razsoc.y, {
      size: POS.header.razsoc.size,
      maxWidth: POS.header.razsoc.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, toStr(r.Revestimiento), POS.header.revest.x, POS.header.revest.y, {
      size: POS.header.revest.size,
      maxWidth: POS.header.revest.maxWidth,
      minSize: 6,
    });

    // -------- Esquema (medidas)
    const dintelAncho = getDintelAnchoMM(r);
    const alto = getAltoMM(r);

    // ESTE ES TU CAMBIO: altoMenos10 = PIERNAS_Altura (no alto-10)
    const piernasAltura = getPiernasAlturaMM(r);

    drawFittedText(
      page,
      font,
      dintelAncho ? String(Math.round(dintelAncho)) : '',
      POS.scheme.dintelAncho.x,
      POS.scheme.dintelAncho.y,
      { size: POS.scheme.dintelAncho.size, maxWidth: POS.scheme.dintelAncho.maxWidth }
    );

    drawFittedText(page, font, alto ? String(Math.round(alto)) : '', POS.scheme.alto.x, POS.scheme.alto.y, {
      size: POS.scheme.alto.size,
      maxWidth: POS.scheme.alto.maxWidth,
    });

    drawFittedText(
      page,
      font,
      piernasAltura ? String(Math.round(piernasAltura)) : '',
      POS.scheme.altoMenos10.x,
      POS.scheme.altoMenos10.y,
      { size: POS.scheme.altoMenos10.size, maxWidth: POS.scheme.altoMenos10.maxWidth }
    );

    drawFittedText(page, font, calc244(r), POS.scheme.dintelMenos.x, POS.scheme.dintelMenos.y, {
      size: POS.scheme.dintelMenos.size,
      maxWidth: POS.scheme.dintelMenos.maxWidth,
    });

    // MOTOR en esquema derecho
    const motorCond = toStr(r.MOTOR_Condicion).toUpperCase();
    const motorPos = toStr(r.MOTOR_Posicion).toUpperCase();
    if (motorCond && motorCond !== 'NO' && motorCond !== '0') {
      const x = motorPos === 'DERECHA' ? POS.motorLabel.rightX : POS.motorLabel.leftX;
      drawFittedText(page, font, 'MOTOR', x, POS.motorLabel.y, { size: POS.motorLabel.size, maxWidth: 90 });
    }

    // -------- PASO 1
    drawFittedText(page, font, normPiernaTipo(r), POS.paso1.piernasTipo.x, POS.paso1.piernasTipo.y, {
      size: POS.paso1.piernasTipo.size,
      maxWidth: POS.paso1.piernasTipo.maxWidth,
    });

    drawFittedText(
      page,
      font,
      piernasAltura ? String(Math.round(piernasAltura)) : '',
      POS.paso1.piernasAltura.x,
      POS.paso1.piernasAltura.y,
      { size: POS.paso1.piernasAltura.size, maxWidth: POS.paso1.piernasAltura.maxWidth }
    );

    drawFittedText(page, font, getDintelTipo(r), POS.paso1.dintelTipo.x, POS.paso1.dintelTipo.y, {
      size: POS.paso1.dintelTipo.size,
      maxWidth: POS.paso1.dintelTipo.maxWidth,
    });

    drawFittedText(
      page,
      font,
      dintelAncho ? String(Math.round(dintelAncho)) : '',
      POS.paso1.dintelAncho.x,
      POS.paso1.dintelAncho.y,
      { size: POS.paso1.dintelAncho.size, maxWidth: POS.paso1.dintelAncho.maxWidth }
    );

    // -------- PASO 2
    const rbjAncho = toMM(r.RBJ_Ancho ?? r.RBJ_ancho);
    const rbjSiNo = rbjAncho ? 'SI' : 'NO';

    drawFittedText(page, font, rbjSiNo, POS.paso2.rbjSiNo.x, POS.paso2.rbjSiNo.y, {
      size: POS.paso2.rbjSiNo.size,
      maxWidth: POS.paso2.rbjSiNo.maxWidth,
    });

    drawFittedText(page, font, rbjAncho ? String(Math.round(rbjAncho)) : '0', POS.paso2.rbjDesc.x, POS.paso2.rbjDesc.y, {
      size: POS.paso2.rbjDesc.size,
      maxWidth: POS.paso2.rbjDesc.maxWidth,
    });

    drawFittedText(page, font, toStr(r.REBAJE_SINO), POS.paso2.rebSiNo.x, POS.paso2.rebSiNo.y, {
      size: POS.paso2.rebSiNo.size,
      maxWidth: POS.paso2.rebSiNo.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, toStr(r.REBAJE_Descuento), POS.paso2.rebDesc.x, POS.paso2.rebDesc.y, {
      size: POS.paso2.rebDesc.size,
      maxWidth: POS.paso2.rebDesc.maxWidth,
      minSize: 6,
    });

    // -------- PASO 3
    drawFittedText(page, font, toStr(r.PARANTES_Cantidad), POS.paso3.parCant.x, POS.paso3.parCant.y, {
      size: POS.paso3.parCant.size,
      maxWidth: POS.paso3.parCant.maxWidth,
    });

    drawFittedText(page, font, toStr(r.PARANTES_Distribucion), POS.paso3.parDist.x, POS.paso3.parDist.y, {
      size: POS.paso3.parDist.size,
      maxWidth: POS.paso3.parDist.maxWidth,
      minSize: 6,
    });

    const puertaPos = toStr(r.PUERTA_Posicion);
    drawFittedText(page, font, puertaPos, POS.paso3.puerta1.x, POS.paso3.puerta1.y, {
      size: POS.paso3.puerta1.size,
      maxWidth: POS.paso3.puerta1.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, puertaPos, POS.paso3.puerta2.x, POS.paso3.puerta2.y, {
      size: POS.paso3.puerta2.size,
      maxWidth: POS.paso3.puerta2.maxWidth,
      minSize: 6,
    });

    // -------- PASO 4
    drawFittedText(page, font, toStr(r.MOTOR_Condicion), POS.paso4.motorCond.x, POS.paso4.motorCond.y, {
      size: POS.paso4.motorCond.size,
      maxWidth: POS.paso4.motorCond.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, toStr(r.MOTOR_Posicion), POS.paso4.motorPos.x, POS.paso4.motorPos.y, {
      size: POS.paso4.motorPos.size,
      maxWidth: POS.paso4.motorPos.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, toStr(r.Tipo_Espada), POS.paso4.espada.x, POS.paso4.espada.y, {
      size: POS.paso4.espada.size,
      maxWidth: POS.paso4.espada.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, toStr(r.INSTALACION_Empotraduras), POS.paso4.empot.x, POS.paso4.empot.y, {
      size: POS.paso4.empot.size,
      maxWidth: POS.paso4.empot.maxWidth,
      minSize: 6,
    });

    // -------- Derecha PASO 5
    const [cs1, cs2] = splitTwoCells(r.Color_Sistema);
    drawFittedText(page, font, cs1, POS.right.colorSis1.x, POS.right.colorSis1.y, {
      size: POS.right.colorSis1.size,
      maxWidth: POS.right.colorSis1.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, cs2, POS.right.colorSis2.x, POS.right.colorSis2.y, {
      size: POS.right.colorSis2.size,
      maxWidth: POS.right.colorSis2.maxWidth,
      minSize: 6,
    });

    const [c1, c2] = splitTwoCells(r.Color);
    drawFittedText(page, font, c1, POS.right.color1.x, POS.right.color1.y, {
      size: POS.right.color1.size,
      maxWidth: POS.right.color1.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, c2, POS.right.color2.x, POS.right.color2.y, {
      size: POS.right.color2.size,
      maxWidth: POS.right.color2.maxWidth,
      minSize: 6,
    });

    // -------- Derecha PASO 6
    drawFittedText(page, font, toStr(r.Liston), POS.right.liston.x, POS.right.liston.y, {
      size: POS.right.liston.size,
      maxWidth: POS.right.liston.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, toStr(r.Lucera), POS.right.vidrio.x, POS.right.vidrio.y, {
      size: POS.right.vidrio.size,
      maxWidth: POS.right.vidrio.maxWidth,
      minSize: 6,
    });

    drawFittedText(page, font, toStr(r.Revestimiento), POS.right.lugar.x, POS.right.lugar.y, {
      size: POS.right.lugar.size,
      maxWidth: POS.right.lugar.maxWidth,
      minSize: 6,
    });
  }

  const bytes = await outDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

// =====================
// Wrappers que usa ViewPdf (SIEMPRE desde valores)
// =====================
export async function generatePdfArmPrimarioByPartida(partida) {
  const p = toStr(partida);
  if (!p) throw new Error('Partida vacía');
  const rows = await fetchValores({ partida: p });
  if (!rows.length) {
    throw new Error(
      `No hay filas en pre-produccion-valores para PARTIDA=${p}`
    );
  }
  return generatePdfArmadoPrimario(p, rows);
}

export async function generatePdfArmPrimarioByNv(nv) {
  const n = toStr(nv);
  if (!n) throw new Error('NV vacío');
  const rows = await fetchValores({ nv: n });
  if (!rows.length) {
    throw new Error(`No hay filas en pre-produccion-valores para NV=${n}`);
  }
  const p = toStr(rows[0]?.PARTIDA);
  return generatePdfArmadoPrimario(p || undefined, rows);
}

// Default export flexible (por si querés importarlo como objeto)
export default {
  generatePdfArmadoPrimario,
  generatePdfArmPrimarioByPartida,
  generatePdfArmPrimarioByNv,
};
