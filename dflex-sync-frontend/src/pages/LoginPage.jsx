// src/pages/LoginPage.jsx
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function LoginPage() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // idle | error | success
  const [statusEmail, setStatusEmail] = useState('idle');
  const [statusPassword, setStatusPassword] = useState('idle');

  const canSubmit = useMemo(() => {
    return !loading && email.trim().length > 0 && password.length > 0;
  }, [loading, email, password]);

  function resetStatusesIfNeeded(field) {
    // si el usuario empieza a corregir, sacamos el rojo/verde
    if (field === 'email' && statusEmail !== 'idle') setStatusEmail('idle');
    if (field === 'password' && statusPassword !== 'idle') setStatusPassword('idle');
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const eMail = email.trim();

    setError('');
    setLoading(true);

    // reset a "neutral" antes de intentar
    setStatusEmail('idle');
    setStatusPassword('idle');

    try {
      await signIn(eMail, password);

      // Success: pintar verde y dejar un instante para que se vea
      setStatusEmail('success');
      setStatusPassword('success');

      // El AuthProvider actualizará session y el AuthGate cambia de pantalla solo.
      setTimeout(() => {
        // no hacemos nada más; solo dejamos que el flujo siga.
      }, 600);
    } catch (err) {
      const msg = err?.message || String(err);
      setError(msg);

      // Error: rojo fuerte en ambos por simplicidad (credenciales)
      setStatusEmail('error');
      setStatusPassword('error');
    } finally {
      setLoading(false);
    }
  }

  const emailClass =
    statusEmail === 'error'
      ? 'login-input login-input--error'
      : statusEmail === 'success'
      ? 'login-input login-input--success'
      : 'login-input';

  const passClass =
    statusPassword === 'error'
      ? 'login-input login-input--error'
      : statusPassword === 'success'
      ? 'login-input login-input--success'
      : 'login-input';

  return (
    <div className="page">
      <div className="import-panel login-panel">
        <h2>Ingresar</h2>

        <form onSubmit={handleSubmit} className="field-row login-form">
          <label>
            Email
            <input
              className={emailClass}
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => {
                setEmail(e.target.value);
                resetStatusesIfNeeded('email');
              }}
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
              onChange={(e) => {
                setPassword(e.target.value);
                resetStatusesIfNeeded('password');
              }}
              required
              disabled={loading}
            />
          </label>

          <button type="submit" className="btn-secondary" disabled={!canSubmit}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {error && <div className="error">⚠ {error}</div>}
        </form>
      </div>
    </div>
  );
}
