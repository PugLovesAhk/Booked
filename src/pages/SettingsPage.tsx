import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckIcon, LogoutIcon } from '../components/Icons';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { displayPhone, hasAccess, isSubscribed, money, normalizePhone, shortDate, trialDaysLeft, typingPhone } from '../lib/format';
import { useInstallPrompt } from '../lib/install';
import { useLayout } from '../lib/layout';
import { useToast } from '../lib/toast';

const DEFAULT_TEMPLATE = 'Hi {name}, just checking in on your quote from {business} for {job}: ${price}. Tap to view: {link}';
const TOKENS = ['{name}', '{business}', '{job}', '{price}', '{link}'];

const SECTIONS = [
  { id: 'business', label: 'Business' },
  { id: 'followups', label: 'Follow-up texts' },
  { id: 'plan', label: 'Plan and billing' },
  { id: 'app', label: 'App' },
  { id: 'account', label: 'Account' },
];

function Section({ id, title, description, children, footer }: { id: string; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section id={id} className="panel settings-section" aria-labelledby={`${id}-title`}>
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="settings-section-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

function SaveBar({ dirty, saving, saved, onReset }: { dirty: boolean; saving: boolean; saved: boolean; onReset: () => void }) {
  return (
    <>
      {saved && !dirty && <span className="saved-note"><CheckIcon /> Saved</span>}
      {dirty && <button type="button" className="btn btn-quiet" onClick={onReset}>Discard</button>}
      <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
    </>
  );
}

function BusinessSection() {
  const { profile, saveProfile } = useData();
  const toast = useToast();
  const initial = { name: profile?.business_name ?? '', phone: profile?.phone ? displayPhone(profile.phone) : '' };
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = name !== initial.name || phone !== initial.phone;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const e164 = phone.trim() ? normalizePhone(phone) : '';
    if (!name.trim()) return toast('Enter your business name.', 'error');
    if (e164 === null) return toast('Enter a 10-digit mobile number.', 'error');
    setSaving(true);
    try {
      await saveProfile({ business_name: name.trim(), phone: e164 });
      setPhone(e164 ? displayPhone(e164) : '');
      setSaved(true);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    setSaving(false);
  };

  return (
    <form onSubmit={save}>
      <Section
        id="business"
        title="Business"
        description="Shown to customers on every quote text and quote page."
        footer={<SaveBar dirty={dirty} saving={saving} saved={saved} onReset={() => { setName(initial.name); setPhone(initial.phone); }} />}
      >
        <div className="two-col">
          <label className="field">
            <span className="field-label">Business name</span>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} autoCapitalize="words" maxLength={80} />
          </label>
          <label className="field">
            <span className="field-label">Your mobile number</span>
            <input className="input" value={phone} onChange={(e) => { setPhone(typingPhone(e.target.value)); setSaved(false); }} type="tel" inputMode="tel" />
            <span className="field-hint">We text you here when a customer answers.</span>
          </label>
        </div>
      </Section>
    </form>
  );
}

function FollowupSection() {
  const { profile, quotes, saveProfile } = useData();
  const toast = useToast();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const initialDays = [0, 1, 2].map((i) => (profile?.followup_days[i] ? String(profile.followup_days[i]) : ''));
  const initialTemplate = profile?.followup_template ?? DEFAULT_TEMPLATE;
  const [days, setDays] = useState<string[]>(initialDays);
  const [template, setTemplate] = useState(initialTemplate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = template !== initialTemplate || days.join() !== initialDays.join();

  const insertToken = (token: string) => {
    const el = textRef.current;
    if (!el) return setTemplate((t) => t + token);
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    setTemplate(template.slice(0, start) + token + template.slice(end));
    setSaved(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const nums = days.filter((d) => d.trim()).map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 60)) return toast('Use whole days from 1 to 60.', 'error');
    if (!template.trim()) return toast('The follow-up message can’t be empty.', 'error');
    if (!template.includes('{link}')) return toast('Keep {link} in the message so customers can answer.', 'error');
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    setSaving(true);
    try {
      await saveProfile({ followup_template: template.trim(), followup_days: sorted });
      setDays([0, 1, 2].map((i) => (sorted[i] ? String(sorted[i]) : '')));
      setTemplate(template.trim());
      setSaved(true);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    setSaving(false);
  };

  // Preview with the most recent real quote, if there is one.
  const sample = quotes[0];
  const preview = sample
    ? template
        .replace(/\{name\}/g, sample.customer_name.split(/\s+/)[0])
        .replace(/\{business\}/g, profile?.business_name || 'your business')
        .replace(/\{job\}/g, sample.job)
        .replace(/\$?\{price\}/g, money(sample.price_cents))
        .replace(/\{link\}/g, `${window.location.origin}/q/${sample.token}`)
        .trim() + ' Reply STOP to stop texts.'
    : null;

  return (
    <form onSubmit={save}>
      <Section
        id="followups"
        title="Follow-up texts"
        description="Sent only while a customer hasn’t answered or replied. They stop as soon as the customer taps a button or texts back."
        footer={<SaveBar dirty={dirty} saving={saving} saved={saved} onReset={() => { setDays(initialDays); setTemplate(initialTemplate); }} />}
      >
        <div className="field">
          <span className="field-label">Schedule</span>
          <div className="days-row">
            {['First', 'Second', 'Third'].map((label, i) => (
              <label className="field" key={label}>
                <span className="field-hint">{label}</span>
                <span className="affix">
                  <input
                    className="input num"
                    value={days[i]}
                    onChange={(e) => { setDays((d) => d.map((x, j) => (j === i ? e.target.value.replace(/\D/g, '').slice(0, 2) : x))); setSaved(false); }}
                    inputMode="numeric"
                    aria-label={`${label} follow-up, days after the quote`}
                  />
                  <span className="affix-text">days</span>
                </span>
              </label>
            ))}
          </div>
          <span className="field-hint">Days after the quote is sent. Leave a box empty to skip that follow-up.</span>
        </div>

        <label className="field">
          <span className="field-label">Message</span>
          <textarea ref={textRef} className="textarea" value={template} onChange={(e) => { setTemplate(e.target.value); setSaved(false); }} rows={3} maxLength={500} />
        </label>
        <div className="token-list">
          <span className="field-hint">Insert:</span>
          {TOKENS.map((t) => (
            <button type="button" key={t} className="token" onClick={() => insertToken(t)}>{t}</button>
          ))}
          <button type="button" className="link-btn small" onClick={() => { setTemplate(DEFAULT_TEMPLATE); setSaved(false); }}>Use default wording</button>
        </div>

        {preview && (
          <div className="preview">
            <span className="preview-label">How it reads for {sample!.customer_name}</span>
            <div className="sms sms-out"><div className="sms-body">{preview}</div></div>
          </div>
        )}
        <p className="field-hint">“Reply STOP to stop texts.” is added to every text automatically.</p>
      </Section>
    </form>
  );
}

function PlanSection() {
  const { profile, demo } = useData();
  const { backend } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('billing') === 'success') toast('Payment method added. Thank you.', 'success');
  }, [location.search, toast]);

  if (!profile) return null;
  const subscribed = isSubscribed(profile);
  const days = trialDaysLeft(profile);

  const go = async (action: 'checkout' | 'portal') => {
    setBusy(true);
    try {
      const { url } = await backend.billing(action);
      window.location.href = url;
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };

  let status: string;
  if (subscribed) status = profile.subscription_status === 'past_due' ? 'Payment failed. Update your card.' : 'Active';
  else if (hasAccess(profile)) status = `Free trial, ${days} day${days === 1 ? '' : 's'} left`;
  else status = 'Trial ended';

  return (
    <Section
      id="plan"
      title="Plan and billing"
      description="30 days free, then billed monthly. Cancel anytime."
      footer={
        demo ? (
          <span className="field-hint">Billing is turned off for the admin demo account.</span>
        ) : subscribed ? (
          <button className="btn btn-secondary" onClick={() => go('portal')} disabled={busy}>Manage billing</button>
        ) : (
          <button className="btn btn-primary" onClick={() => go('checkout')} disabled={busy}>{busy ? 'Opening Stripe…' : 'Add payment method'}</button>
        )
      }
    >
      <div className="plan-line">
        <div>
          <div className="field-label">Booked</div>
          <div className="plan-status">{status}</div>
        </div>
        <div className="plan-price">$39<span>/month</span></div>
      </div>
      {!subscribed && hasAccess(profile) && (
        <p className="field-hint">Your trial ends {shortDate(profile.trial_ends_at)}. Add a card now and you won’t be charged until then.</p>
      )}
    </Section>
  );
}

function AppSection() {
  const { canPrompt, prompt, installed, isIos } = useInstallPrompt();
  return (
    <Section id="app" title="App" description="Open Booked from your home screen like any other app. Same account on every device.">
      {installed ? (
        <p className="plan-status"><CheckIcon /> Installed on this device</p>
      ) : canPrompt ? (
        <div><button className="btn btn-secondary" onClick={prompt}>Install Booked on this device</button></div>
      ) : isIos ? (
        <ol className="steps">
          <li>Open Booked in Safari.</li>
          <li>Tap the Share button.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
        </ol>
      ) : (
        <p className="field-hint">In your browser menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On a computer you can also just bookmark this page.</p>
      )}
    </Section>
  );
}

function AccountSection() {
  const { session, signOut, backend } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  const demo = Boolean(session?.demo);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast('Use at least 8 characters.', 'error');
    setSaving(true);
    try {
      await backend.updatePassword(pw);
      setPw('');
      toast('Password changed', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    setSaving(false);
  };

  return (
    <Section
      id="account"
      title="Account"
      footer={<button className="btn btn-secondary" onClick={signOut}><LogoutIcon /> Log out</button>}
    >
      <dl className="kv">
        <dt>Signed in as</dt>
        <dd>{session?.email}</dd>
        {demo && (
          <>
            <dt>Data</dt>
            <dd>Admin demo data is saved in this browser only. Texts and billing are turned off.</dd>
          </>
        )}
      </dl>
      {!demo && (
        <form className="field" onSubmit={changePassword}>
          <span className="field-label">New password</span>
          <div className="toolbar" style={{ margin: 0 }}>
            <input className="input" style={{ flex: '1 1 220px' }} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
            <button className="btn btn-secondary" disabled={!pw || saving}>{saving ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>
      )}
    </Section>
  );
}

export function SettingsPage() {
  const { profile } = useData();
  const { hash } = useLocation();
  const layout = useLayout();
  const [current, setCurrent] = useState(SECTIONS[0].id);

  useEffect(() => {
    if (hash && profile) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, profile]);

  // Highlight the section in view.
  useEffect(() => {
    if (!profile) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [profile]);

  if (!profile) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <header className="page-header"><h1 className="page-title">Settings</h1></header>
      <div className="settings">
        {layout !== 'phone' && (
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                aria-current={current === s.id ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setCurrent(s.id);
                }}
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}
        <div className="settings-body">
          <BusinessSection />
          <FollowupSection />
          <PlanSection />
          <AppSection />
          <AccountSection />
        </div>
      </div>
    </div>
  );
}
