import { useEffect, useRef, useState } from 'react';
import { searchAccounts } from '../api.js';

// Selector de cuenta contable con búsqueda (nombre o código) contra Odoo.
export default function AccountPicker({ value, onChange }) {
  const [query, setQuery] = useState(value ? `${value.code} ${value.name}` : '');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleInput(text) {
    setQuery(text);
    setOpen(true);
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
    <div className="account-picker" ref={boxRef}>
      <input
        type="text"
        placeholder="Buscar cuenta..."
        value={query}
        onFocus={() => handleInput(query)}
        onChange={(e) => handleInput(e.target.value)}
      />
      {open && options.length > 0 && (
        <ul className="account-picker-list">
          {options.map((acc) => (
            <li key={acc.id} onMouseDown={() => pick(acc)}>
              <span className="acc-code">{acc.code}</span> {acc.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
