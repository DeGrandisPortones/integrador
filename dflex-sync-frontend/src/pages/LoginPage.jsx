// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // el AuthProvider actualizará session automáticamente
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="import-panel" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h2>Ingresar</h2>

        <form onSubmit={handleSubmit} className="field-row" style={{ flexDirection: 'column', gap: 10 }}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn-secondary" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {error && <div className="error">⚠ {error}</div>}
        </form>
      </div>
    </div>
  );
}
