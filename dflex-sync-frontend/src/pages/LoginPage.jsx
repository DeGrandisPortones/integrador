// src/pages/LoginPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function LoginPage() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // estados para estilos
  const [didSubmit, setDidSubmit] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Si el usuario vuelve a tipear, reseteamos el “success”
  useEffect(() => {
    if (!didSubmit) return;
    setError('');
    setIsSuccess(false);
    // no reseteo didSubmit para poder marcar rojo/verde al volver a enviar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  const inputClassName = useMemo(() => {
    const base = 'login-input';
    if (!didSubmit) return base;

    // si hay error => rojo
    if (error) return `${base} login-input--error`;

    // si está ok => verde
    if (isSuccess) return `${base} login-input--success`;

    return base;
  }, [didSubmit, error, isSuccess]);

  async function handleSubmit(e) {
    e.preventDefault();
    setDidSubmit(true);
    setError('');
    setLoading(true);

    try {
      await signIn(email.trim(), password);

      // marcamos success para que se ponga verde
      setIsSuccess(true);

      // dejamos que se vea el verde un instante y luego el AuthProvider cambia a la app
      // (no redirigimos manualmente: el gate se encarga)
      await new Promise((r) => setTimeout(r, 450));
    } catch (err) {
      setIsSuccess(false);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="login-panel">
        <h2>Ingresar</h2>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              className={inputClassName}
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
              className={inputClassName}
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

          {error && <div className="error">⚠ {error}</div>}
        </form>
      </div>
    </div>
  );
}
