import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogoMark } from '../components/Icons';
import { normalizePhone, typingPhone } from '../lib/format';
import { isConfigured, supabase } from '../lib/supabase';

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-hero">
        <LogoMark size={56} />
        <div className="auth-brand">Booked</div>
        <p className="auth-tagline">Turn quotes into booked jobs.</p>
      </div>
      <div className="auth-card card">
        <h1>{title}</h1>
        {!isConfigured && (
          <p className="form-error">Setup needed: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.</p>
        )}
        {children}
      </div>
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  );
}

function friendly(message: string): string {
  if (/invalid login/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Check your inbox for the link.';
  if (/already registered/i.test(message)) return 'That email already has an account. Try logging in.';
  if (/password should be/i.test(message)) return 'Use a password with at least 8 characters.';
  if (/fetch/i.test(message)) return 'Can’t connect. Check your internet and try again.';
  return message;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(friendly(error.message));
    else navigate('/quotes', { replace: true });
  };

  return (
    <AuthLayout
      title="Log in"
      footer={<>New to Booked? <Link to="/signup">Start your 30-day free trial</Link></>}
    >
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <Link to="/reset" className="link-center">Forgot password?</Link>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const e164 = normalizePhone(phone);
    if (!business.trim()) return setError('Add your business name.');
    if (!e164) return setError('Enter a 10-digit phone number.');
    if (password.length < 8) return setError('Use a password with at least 8 characters.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { business_name: business.trim(), phone: e164 },
        emailRedirectTo: `${window.location.origin}/quotes`,
      },
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    if (data.session) navigate('/new', { replace: true });
    else setCheckEmail(true);
  };

  if (checkEmail) {
    return (
      <AuthLayout title="Check your email" footer={<Link to="/login">Back to log in</Link>}>
        <p>We sent a link to <strong>{email}</strong>. Tap it to finish setting up your account.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Start your free trial"
      footer={<>Already have an account? <Link to="/login">Log in</Link></>}
    >
      <p className="muted">30 days free, then $39/month. No card needed to start.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Business name</span>
          <input value={business} onChange={(e) => setBusiness(e.target.value)} autoComplete="organization" autoCapitalize="words" required />
        </label>
        <label className="field">
          <span>Your cell phone</span>
          <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(typingPhone(e.target.value))} placeholder="(555) 123-4567" required />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthLayout>
  );
}

/** Ask for a reset link, or (after tapping the link) set a new password. */
export function ResetPage({ recovering }: { recovering: boolean }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
    setBusy(false);
    if (error) setError(friendly(error.message));
    else setMessage(`If ${email} has an account, a reset link is on its way.`);
  };

  const setNew = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use a password with at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(friendly(error.message));
    else navigate('/quotes', { replace: true });
  };

  return (
    <AuthLayout title={recovering ? 'Choose a new password' : 'Reset password'} footer={<Link to="/login">Back to log in</Link>}>
      {recovering ? (
        <form className="form" onSubmit={setNew}>
          <label className="field">
            <span>New password</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Save password</button>
        </form>
      ) : message ? (
        <p>{message}</p>
      ) : (
        <form className="form" onSubmit={sendLink}>
          <label className="field">
            <span>Email</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Send reset link</button>
        </form>
      )}
    </AuthLayout>
  );
}
