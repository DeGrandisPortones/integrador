import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchAccounts } from '../api.js';

const MARGEN = 8;

// Selector de cuenta contable con búsqueda (nombre o código) contra Odoo.
//
// El desplegable se renderiza en un portal a document.body, con position:fixed anclado
// a la posición en pantalla del input — NO como hijo posicionado dentro de la fila de
// la tabla. La tabla tiene scroll horizontal (muchas columnas) y el input "Cuenta" es
// la última columna: si el desplegable quedara adentro de ese contenedor con scroll,
// para verlo completo había que seguir scrolleando la tabla, y ese gesto de scroll se
// interpretaba como "click afuera" y lo cerraba antes de poder leerlo o elegir algo.
// Con position:fixed en el body, el desplegable ya aparece completo y legible en su
// posición actual en pantalla, sin depender del scroll de la tabla.
export default function AccountPicker({ value, onChange }) {
  const [query, setQuery] = useState(value ? `${value.code} ${value.name}` : '');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function posicionar() {
    const rect = inputRef.current.getBoundingClientRect();
    const anchoLista = 320;
    const left = Math.min(rect.left, window.innerWidth - anchoLista - MARGEN);
    setCoords({ top: rect.bottom + 4, left: Math.max(MARGEN, left), width: rect.width });
  }

  function handleInput(text) {
    setQuery(text);
    setOpen(true);
    posicionar();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchAccounts(text);
        setOptions(results);
      } catch {
        setOptions([]);
      }
    }, 250);
  }

  function pick(account) {
    setQuery(`${account.code} ${account.name}`);
    setOpen(false);
    onChange(account);
  }

  return (
    <div className="account-picker">
      <input
        ref={inputRef}
        type="text"
        placeholder="Buscar cuenta..."
        value={query}
        onFocus={() => handleInput(query)}
        onChange={(e) => handleInput(e.target.value)}
      />
      {open && options.length > 0 && coords &&
        createPortal(
          <ul
            ref={listRef}
            className="account-picker-list account-picker-list-portal"
            style={{ top: coords.top, left: coords.left, minWidth: coords.width }}
          >
            {options.map((acc) => (
              <li key={acc.id} onMouseDown={() => pick(acc)}>
                <span className="acc-code">{acc.code}</span> {acc.name}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
