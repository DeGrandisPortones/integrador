import { useState } from 'react';
import { setStoredAuth } from './auth.js';
import { verificarCredenciales } from './api.js';

export default function Login({ onSuccess, theme, onToggleTheme }) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [verificando, setVerificando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setVerificando(true);
    try {
      const ok = await verificarCredenciales(user, password);
      if (!ok) {
        setError('Usuario o contraseña incorrectos.');
        return;
      }
      setStoredAuth(user, password);
      onSuccess();
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="login-screen">
      <button type="button" className="theme-toggle" onClick={onToggleTheme}>
        {theme === 'dark' ? '☀ Claro' : '🌙 Oscuro'}
      </button>
      <form className="login-box" onSubmit={handleSubmit}>
        <h1>Comprobantes ARCA → Odoo</h1>
        <p className="subtitle">Ingresá para continuar.</p>
        <label>
          Usuario
          <input type="text" value={user} onChange={(e) => setUser(e.target.value)} autoFocus required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="banner banner-error">{error}</div>}
        <button type="submit" disabled={verificando}>
          {verificando ? 'Verificando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
