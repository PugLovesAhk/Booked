import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckIcon, LogoMark } from '../components/Icons';
import { useAuth } from '../lib/auth';
import { normalizePhone, typingPhone } from '../lib/format';
import { isConfigured, supabase } from '../lib/supabase';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="brand">
          <LogoMark size={32} />
          <span className="brand-name">Booked</span>
        </div>
        <div>
          <h2>Turn quotes into booked jobs.</h2>
          <ul>
            <li><CheckIcon /> Text a quote from the truck in under 20 seconds.</li>
            <li><CheckIcon /> Automatic follow-ups until the customer answers.</li>
            <li><CheckIcon /> Know the moment a job is booked, on any device.</li>
          </ul>
        </div>
        <small>For HVAC, plumbing, landscaping and other trades.</small>
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-brand">
          <LogoMark size={32} />
          Booked
        </div>
        <div className="auth-box">{children}</div>
      </main>
    </div>
  );
}

function friendly(message: string): string {
  if (/already registered/i.test(message)) return 'That email already has an account. Log in instead.';
  if (/password should be/i.test(message)) return 'Use a password with at least 8 characters.';
  if (/fetch|network/i.test(message)) return 'Can’t reach the server. Check your connection and try again.';
  return message;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(identifier, password);
      navigate('/quotes', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1>Log in</h1>
      <p className="auth-lede">Welcome back.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Email or username</span>
          <input className="input" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <Link to="/reset" className="forgot">Forgot password?</Link>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="auth-alt">New to Booked? <Link to="/signup">Start a free trial</Link></p>
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
    if (!business.trim()) return setError('Enter your business name.');
    if (!e164) return setError('Enter a 10-digit mobile number.');
    if (password.length < 8) return setError('Use a password with at least 8 characters.');
    if (!isConfigured) return setError('Sign-up isn’t connected yet. Use the admin login for now.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { business_name: business.trim(), phone: e164 }, emailRedirectTo: `${window.location.origin}/quotes` },
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    if (data.session) navigate('/new', { replace: true });
    else setCheckEmail(true);
  };

  if (checkEmail) {
    return (
      <AuthLayout>
        <h1>Check your email</h1>
        <p className="auth-lede">We sent a confirmation link to <strong>{email}</strong>. Open it on this device to finish setting up.</p>
        <Link to="/login" className="btn btn-secondary btn-block">Back to log in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1>Start your free trial</h1>
      <p className="auth-lede">30 days free, then $39/month. No card needed to start.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Business name</span>
          <input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} autoComplete="organization" autoCapitalize="words" required />
        </label>
        <label className="field">
          <span className="field-label">Your mobile number</span>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(typingPhone(e.target.value))} required />
          <span className="field-hint">We text you when a customer answers a quote.</span>
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          <span className="field-hint">At least 8 characters.</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="auth-alt">Already have an account? <Link to="/login">Log in</Link></p>
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
    if (!isConfigured) return setError('Password reset isn’t connected yet.');
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
    <AuthLayout>
      <h1>{recovering ? 'Choose a new password' : 'Reset your password'}</h1>
      <p className="auth-lede">{recovering ? 'You’ll stay logged in on this device.' : 'We’ll email you a link to set a new one.'}</p>
      {recovering ? (
        <form className="form" onSubmit={setNew}>
          <label className="field">
            <span className="field-label">New password</span>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Save password</button>
        </form>
      ) : message ? (
        <p>{message}</p>
      ) : (
        <form className="form" onSubmit={sendLink}>
          <label className="field">
            <span className="field-label">Email</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Send reset link</button>
        </form>
      )}
      <p className="auth-alt"><Link to="/login">Back to log in</Link></p>
    </AuthLayout>
  );
}
