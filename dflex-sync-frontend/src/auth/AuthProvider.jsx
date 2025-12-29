// src/auth/AuthProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// IMPORTANTE: el default NO es null, así nunca explota la desestructuración
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

    async function init() {
      try {
        setLoading(true);

        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        const s = data?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);

        // DEBUG (solo DEV): loguea token para pegar en Insomnia
        if (import.meta.env.DEV && s?.access_token) {
          const t = s.access_token;
          console.log('[Auth] access_token (short):', `${t.slice(0, 16)}...${t.slice(-8)}`);
          console.log('[Auth] access_token (FULL):', t);
        }

        // Si tenés endpoint /api/me que devuelve role, lo podés usar acá:
        if (s?.access_token) {
          try {
            const res = await fetch(
              `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/me`,
              { headers: { Authorization: `Bearer ${s.access_token}` } }
            );
            if (res.ok) {
              const me = await res.json();
              if (alive && me?.role) setRole(me.role);
            } else {
              if (alive) setRole('viewer');
            }
          } catch {
            if (alive) setRole('viewer');
          }
        } else {
          setRole('viewer');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);

      // DEBUG (solo DEV): loguea token en cada cambio de sesión
      if (import.meta.env.DEV && newSession?.access_token) {
        const t = newSession.access_token;
        console.log('[Auth] access_token (change, short):', `${t.slice(0, 16)}...${t.slice(-8)}`);
        console.log('[Auth] access_token (change, FULL):', t);
      }

      if (newSession?.access_token) {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/me`,
            { headers: { Authorization: `Bearer ${newSession.access_token}` } }
          );
          if (res.ok) {
            const me = await res.json();
            setRole(me?.role || 'viewer');
          } else {
            setRole('viewer');
          }
        } catch {
          setRole('viewer');
        }
      } else {
        setRole('viewer');
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

  const value = useMemo(
    () => ({ session, user, role, loading, signIn, signOut }),
    [session, user, role, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  // como el default ya es objeto, no rompe nunca
  return useContext(AuthContext);
}
