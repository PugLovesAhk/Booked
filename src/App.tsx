import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LogoMark } from './components/Icons';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import { supabase } from './lib/supabase';
import { ToastProvider } from './lib/toast';
import { AppShell } from './pages/AppShell';
import { LoginPage, ResetPage, SignupPage } from './pages/AuthPages';
import { NewQuotePage } from './pages/NewQuotePage';
import { PublicQuote } from './pages/PublicQuote';
import { QuotesPage } from './pages/QuotesPage';
import { SettingsPage } from './pages/SettingsPage';

function Splash() {
  return (
    <div className="splash" aria-busy="true">
      <LogoMark size={64} />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  if (session) return <Navigate to="/quotes" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const navigate = useNavigate();
  const [recovering, setRecovering] = useState(false);

  // Password reset links sign the user in with a "recovery" event; send them to pick a new password.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
        navigate('/reset', { replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <Routes>
      <Route path="/q/:token" element={<PublicQuote />} />
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
      <Route path="/reset" element={<ResetPage recovering={recovering} />} />
      <Route
        element={
          <RequireAuth>
            <DataProvider>
              <AppShell />
            </DataProvider>
          </RequireAuth>
        }
      >
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/quotes/:id" element={<QuotesPage />} />
        <Route path="/new" element={<NewQuotePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/quotes" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
