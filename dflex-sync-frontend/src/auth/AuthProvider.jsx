// src/auth/AuthProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({
  session: null,
  user: null,
  role: 'viewer',
  loading: true,
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

    async function init() {
      try {
        setLoading(true);

        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        const s = data?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);

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

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);

      if (newSession?.access_token) {
        stashToken(newSession.access_token, 'change');
        const r = await fetchRole(newSession.access_token);
        if (alive) setRole(r);
      } else {
        clearToken();
        if (alive) setRole('viewer');
      }
    });

    return () => {
      alive = false;
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

  const value = useMemo(() => ({ session, user, role, loading, signIn, signOut }), [session, user, role, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
