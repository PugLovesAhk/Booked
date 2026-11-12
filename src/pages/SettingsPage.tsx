import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { LogoutIcon } from '../components/Icons';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { displayPhone, hasAccess, isSubscribed, normalizePhone, shortDate, trialDaysLeft, typingPhone } from '../lib/format';
import { useInstallPrompt } from '../lib/install';
import { callFunction, supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

const DEFAULT_TEMPLATE = 'Hi {name}, just checking in on your quote from {business} for {job}: ${price}. Tap to view: {link}';

function BusinessCard() {
  const { profile, saveProfile } = useData();
  const toast = useToast();
  const [name, setName] = useState(profile?.business_name ?? '');
  const [phone, setPhone] = useState(profile ? displayPhone(profile.phone) : '');
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const e164 = normalizePhone(phone);
    if (!name.trim()) return toast('Add your business name.', 'error');
    if (!e164) return toast('Enter a 10-digit phone number.', 'error');
    setSaving(true);
    try {
      await saveProfile({ business_name: name.trim(), phone: e164 });
      toast('Business info saved', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    setSaving(false);
  };

  return (
    <form className="card form" onSubmit={save}>
      <h2>Business</h2>
      <label className="field">
        <span>Business name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" maxLength={80} />
      </label>
      <label className="field">
        <span>Your cell phone <small>(we text you when customers answer)</small></span>
        <input value={phone} onChange={(e) => setPhone(typingPhone(e.target.value))} type="tel" inputMode="tel" />
      </label>
      <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    </form>
  );
}

function FollowupCard() {
  const { profile, saveProfile } = useData();
  const toast = useToast();
  const [template, setTemplate] = useState(profile?.followup_template ?? DEFAULT_TEMPLATE);
  const initialDays = profile?.followup_days ?? [2, 5, 10];
  const [days, setDays] = useState<string[]>([0, 1, 2].map((i) => (initialDays[i] ? String(initialDays[i]) : '')));
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const nums = days.filter((d) => d.trim()).map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 60)) return toast('Days must be whole numbers from 1 to 60.', 'error');
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    if (!template.trim()) return toast('The follow-up message can’t be empty.', 'error');
    if (!template.includes('{link}')) return toast('Keep {link} in the message so customers can answer.', 'error');
    setSaving(true);
    try {
      await saveProfile({ followup_template: template.trim(), followup_days: sorted });
      setDays([0, 1, 2].map((i) => (sorted[i] ? String(sorted[i]) : '')));
      toast('Follow-up settings saved', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    setSaving(false);
  };

  return (
    <form className="card form" onSubmit={save}>
      <h2>Follow-up texts</h2>
      <p className="muted">Sent only while the customer hasn’t answered or texted back. Leave a day blank to skip it.</p>
      <div className="days">
        {['1st', '2nd', '3rd'].map((label, i) => (
          <label className="field" key={label}>
            <span>{label} follow-up</span>
            <div className="input-suffix">
              <input
                value={days[i]}
                onChange={(e) => setDays((d) => d.map((x, j) => (j === i ? e.target.value.replace(/\D/g, '').slice(0, 2) : x)))}
                inputMode="numeric"
                placeholder="—"
                aria-label={`${label} follow-up, days after quote`}
              />
              <span>days</span>
            </div>
          </label>
        ))}
      </div>
      <label className="field">
        <span>Message</span>
        <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={4} maxLength={500} />
      </label>
      <p className="muted small">
        Fill-ins: <code>{'{name}'}</code> <code>{'{business}'}</code> <code>{'{job}'}</code> <code>{'{price}'}</code> <code>{'{link}'}</code>. “Reply STOP to stop texts.” is added to every text automatically.
      </p>
      <div className="row">
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>Reset wording</button>
      </div>
    </form>
  );
}

function BillingCard() {
  const { profile } = useData();
  const toast = useToast();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('billing') === 'success') toast('Payment set up. Thank you!', 'success');
  }, [location.search, toast]);

  if (!profile) return null;
  const subscribed = isSubscribed(profile);
  const days = trialDaysLeft(profile);

  const go = async (action: 'checkout' | 'portal') => {
    setBusy(true);
    try {
      const { url } = await callFunction<{ url: string }>('billing', { action });
      window.location.href = url;
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };

  let status: string;
  if (subscribed) status = profile.subscription_status === 'past_due' ? 'Payment failed. Please update your card.' : 'Active: $39/month';
  else if (hasAccess(profile)) status = `Free trial: ${days} day${days === 1 ? '' : 's'} left (ends ${shortDate(profile.trial_ends_at)})`;
  else status = 'Free trial ended';

  return (
    <section className="card" id="billing">
      <h2>Plan</h2>
      <p className="plan-status"><strong>{status}</strong></p>
      <p className="muted">Booked is $39/month after your 30-day free trial. Cancel anytime.</p>
      {subscribed ? (
        <button className="btn btn-outline" onClick={() => go('portal')} disabled={busy}>Manage billing</button>
      ) : (
        <button className="btn btn-primary" onClick={() => go('checkout')} disabled={busy}>
          {busy ? 'Opening…' : hasAccess(profile) ? 'Add payment (billed after trial)' : 'Subscribe: $39/month'}
        </button>
      )}
    </section>
  );
}

function InstallCard() {
  const { canPrompt, prompt, installed, isIos } = useInstallPrompt();
  if (installed) return null;
  return (
    <section className="card">
      <h2>Add Booked to your home screen</h2>
      {canPrompt ? (
        <>
          <p className="muted">Open Booked like a normal app, right from your home screen.</p>
          <button className="btn btn-outline" onClick={prompt}>Install app</button>
        </>
      ) : isIos ? (
        <p className="muted">On iPhone or iPad: tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>.</p>
      ) : (
        <p className="muted">In your browser menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On a computer, just bookmark this page.</p>
      )}
    </section>
  );
}

export function SettingsPage() {
  const { session } = useAuth();
  const { profile } = useData();
  const { hash } = useLocation();

  useEffect(() => {
    if (hash && profile) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
  }, [hash, profile]);

  if (!profile) return <div className="loading">Loading…</div>;

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Settings</h1>
      <div className="settings-grid">
        <BusinessCard />
        <FollowupCard />
        <BillingCard />
        <InstallCard />
        <section className="card">
          <h2>Account</h2>
          <p className="muted">Signed in as {session?.user.email}</p>
          <button className="btn btn-outline" onClick={() => supabase.auth.signOut()}>
            <LogoutIcon /> Log out
          </button>
        </section>
      </div>
    </div>
  );
}
