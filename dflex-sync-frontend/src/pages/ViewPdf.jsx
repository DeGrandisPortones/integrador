// src/pages/ViewPdf.jsx
import { useMemo, useState } from 'react';
import PdfPartidaPage from './PdfPartidaPage';
import PdfCortePlegadoPage from './PdfCortePlegadoPage';

// Página “menú” para PDFs: un solo input PARTIDA y botones para generar distintos modelos.
export default function ViewPdf() {
  const [partida, setPartida] = useState('');
  const [activePdf, setActivePdf] = useState('partida'); // 'partida' | 'corte_plegado'

  const canGenerate = useMemo(() => String(partida || '').trim().length > 0, [partida]);

  const cleanPartida = useMemo(() => String(partida || '').trim(), [partida]);

  return (
    <div className="import-panel">
      <h2>Generación de PDFs por PARTIDA</h2>

      <div className="field-row">
        <label>
          PARTIDA:&nbsp;
          <input
            type="text"
            value={partida}
            onChange={(e) => setPartida(e.target.value)}
            placeholder="Ej: 507"
          />
        </label>

        <button
          type="button"
          className={activePdf === 'partida' ? 'btn-secondary' : 'btn-secondary'}
          onClick={() => setActivePdf('partida')}
          disabled={!canGenerate}
          title={!canGenerate ? 'Ingresá una PARTIDA primero' : ''}
        >
          PDF Diseño y Laser
        </button>

        <button
          type="button"
          className={activePdf === 'corte_plegado' ? 'btn-secondary' : 'btn-secondary'}
          onClick={() => setActivePdf('corte_plegado')}
          disabled={!canGenerate}
          title={!canGenerate ? 'Ingresá una PARTIDA primero' : ''}
        >
          PDF Corte y Plegado
        </button>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        Ingresá una PARTIDA y elegí qué PDF querés generar.
      </p>

      {/* Render del generador seleccionado.
          Le pasamos la partida como prop para evitar pedirla de nuevo. */}
      {activePdf === 'partida' && <PdfPartidaPage partida={cleanPartida} embedded />}
      {activePdf === 'corte_plegado' && (
        <PdfCortePlegadoPage partida={cleanPartida} embedded />
      )}
    </div>
  );
}
