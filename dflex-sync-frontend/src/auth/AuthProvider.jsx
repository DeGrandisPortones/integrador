import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const POST_LOGIN_DELAY_MS = 4000; // <-- ACÁ cambiás el retardo (en ms)

const AuthContext = createContext({
  session: null,
  user: null,
  role: 'viewer',
  loading: true,
  postLoginDelay: false,
  signIn: async () => {
    throw new Error('AuthProvider no inicializado');
  },
  signOut: async () => {
    throw new Error('AuthProvider no inicializado');
  },
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(true);

  // Mientras esto sea true, el Gate mantiene visible el LoginPage (con inputs verdes).
  const [postLoginDelay, setPostLoginDelay] = useState(false);
  const delayTimerRef = useRef(null);

  useEffect(() => {
    let alive = true;

    console.log('[AuthProvider] mounted');

    async function fetchRole(token) {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return 'viewer';
        const me = await res.json();
        return me?.role || 'viewer';
      } catch {
        return 'viewer';
      }
    }

    function stashToken(token, label) {
      try {
        window.__DFLEX_TOKEN__ = token;
      } catch {
        // ignore
      }

      try {
        sessionStorage.setItem('__DFLEX_TOKEN__', token);
      } catch {
        // ignore
      }

      const short = token ? `${token.slice(0, 12)}...${token.slice(-6)}` : '(empty)';
      console.log(`[AuthProvider] token guardado (${label}):`, short);
    }

    function clearToken() {
      try {
        delete window.__DFLEX_TOKEN__;
      } catch {
        // ignore
      }
      try {
        sessionStorage.removeItem('__DFLEX_TOKEN__');
      } catch {
        // ignore
      }
      console.log('[AuthProvider] token limpiado');
    }

    function startPostLoginDelay() {
      // Reinicia el timer si hubiera uno previo
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }

      setPostLoginDelay(true);

      delayTimerRef.current = setTimeout(() => {
        if (!alive) return;
        setPostLoginDelay(false);
      }, POST_LOGIN_DELAY_MS);
    }

    async function init() {
      try {
        setLoading(true);

        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        const s = data?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);

        // En init NO aplicamos delay (si recarga la página ya logueado, no tiene sentido)
        setPostLoginDelay(false);

        if (s?.access_token) {
          stashToken(s.access_token, 'init');
          const r = await fetchRole(s.access_token);
          if (alive) setRole(r);
        } else {
          clearToken();
          if (alive) setRole('viewer');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);

      if (newSession?.access_token) {
        stashToken(newSession.access_token, `change:${event}`);

        // Sólo al hacer SIGNED_IN aplicamos el “delay visual”
        if (event === 'SIGNED_IN') {
          startPostLoginDelay();
        }

        const r = await fetchRole(newSession.access_token);
        if (alive) setRole(r);
      } else {
        clearToken();
        if (alive) setRole('viewer');
        if (alive) setPostLoginDelay(false);
      }
    });

    return () => {
      alive = false;
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  const value = useMemo(
    () => ({ session, user, role, loading, postLoginDelay, signIn, signOut }),
    [session, user, role, loading, postLoginDelay]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
