import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function LoginPage({ forceSuccess = false, locked = false }) {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // idle | success | error
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (forceSuccess) {
      setStatus('success');
      setError('');
      setLoading(true); // lo dejamos “cargando” durante la transición
    }
  }, [forceSuccess]);

  const emailClassName = useMemo(() => {
    if (status === 'error') return 'login-input login-input--error';
    if (status === 'success') return 'login-input login-input--success';
    return 'login-input';
  }, [status]);

  const passClassName = useMemo(() => {
    if (status === 'error') return 'login-input login-input--error';
    if (status === 'success') return 'login-input login-input--success';
    return 'login-input';
  }, [status]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (locked || forceSuccess) return;

    setError('');
    setStatus('idle');
    setLoading(true);

    try {
      await signIn(email.trim(), password);
      // No seteamos success acá; el Gate lo fuerza con postLoginDelay
    } catch (err) {
      setStatus('error');
      setError(err?.message || String(err));
      setLoading(false);
      return;
    } finally {
      // si logueó ok, el componente probablemente siga visible por postLoginDelay y dejamos loading true desde forceSuccess
      if (!forceSuccess) setLoading(false);
    }
  }

  const disabled = loading || locked || forceSuccess;

  return (
    <div className="page">
      <div className="import-panel login-panel">
        <h2>Ingresar</h2>

        <form onSubmit={handleSubmit} className="field-row login-form">
          <label>
            Email
            <input
              type="email"
              className={emailClassName}
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={disabled}
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              className={passClassName}
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={disabled}
            />
          </label>

          <button type="submit" className="btn-secondary" disabled={disabled}>
            {forceSuccess ? 'Entrando...' : loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {error && <div className="error">⚠ {error}</div>}
        </form>
      </div>
    </div>
  );
}
