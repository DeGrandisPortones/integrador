// src/pages/LoginPage.jsx
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function LoginPage() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const showError = !!error && !loading && !success;

  const emailClass = useMemo(() => {
    if (success) return 'login-input login-input--success';
    if (showError) return 'login-input login-input--error';
    return 'login-input';
  }, [success, showError]);

  const passClass = useMemo(() => {
    if (success) return 'login-input login-input--success';
    if (showError) return 'login-input login-input--error';
    return 'login-input';
  }, [success, showError]);

  async function handleSubmit(e) {
    e.preventDefault();

    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await signIn(email.trim(), password);
      // ✅ marcamos success; el delay lo hace AuthProvider.signIn()
      setSuccess(true);
      // luego AuthGate cambia automáticamente a MainApp
    } catch (err) {
      setSuccess(false);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="import-panel login-panel">
        <h2 style={{ marginTop: 0 }}>Ingresar</h2>

        <form onSubmit={handleSubmit} className="field-row login-form">
          <label>
            Email
            <input
              className={emailClass}
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </label>

          <label>
            Contraseña
            <input
              className={passClass}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </label>

          <button type="submit" className="btn-secondary" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {showError && <div className="error">⚠ {error}</div>}
        </form>
      </div>
    </div>
  );
}
