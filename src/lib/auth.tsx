import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminLoginEnabled, demoBackend, DEMO_USER_ID, liveBackend, type Backend, type SessionInfo } from './backend';
import { isConfigured, supabase } from './supabase';

const DEMO_SESSION_KEY = 'booked-demo-session';

interface AuthState {
  session: SessionInfo | null;
  loading: boolean;
  backend: Backend;
  /** Email + password, or admin / admin for the demo account. Throws a readable error. */
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function readDemoSession(): boolean {
  try {
    return adminLoginEnabled && localStorage.getItem(DEMO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

const demoSession: SessionInfo = { userId: DEMO_USER_ID, email: 'admin', demo: true };

function friendly(message: string): string {
  if (/invalid login/i.test(message)) return 'That email and password don’t match.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first. The link is in your inbox.';
  if (/fetch|network/i.test(message)) return 'Can’t reach the server. Check your connection and try again.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(readDemoSession);
  const [live, setLive] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(!readDemoSession() && isConfigured);

  // Live sessions persist on each device and refresh automatically.
  useEffect(() => {
    if (!isConfigured) return;
    const toInfo = (s: { user: { id: string; email?: string } } | null): SessionInfo | null =>
      s ? { userId: s.user.id, email: s.user.email ?? '', demo: false } : null;
    supabase.auth.getSession().then(({ data }) => {
      setLive(toInfo(data.session));
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setLive(toInfo(s)));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session: demo ? demoSession : live,
      loading,
      backend: demo ? demoBackend : liveBackend,
      async signIn(identifier, password) {
        if (adminLoginEnabled && identifier.trim().toLowerCase() === 'admin' && password === 'admin') {
          try {
            localStorage.setItem(DEMO_SESSION_KEY, '1');
          } catch {
            /* still signed in for this visit */
          }
          setDemo(true);
          return;
        }
        if (!isConfigured) throw new Error('Accounts aren’t connected yet. Use the admin login for now.');
        const { error } = await supabase.auth.signInWithPassword({ email: identifier.trim(), password });
        if (error) throw new Error(friendly(error.message));
      },
      async signOut() {
        if (demo) {
          try {
            localStorage.removeItem(DEMO_SESSION_KEY);
          } catch {
            /* ignore */
          }
          setDemo(false);
          return;
        }
        await supabase.auth.signOut();
      },
    }),
    [demo, live, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
