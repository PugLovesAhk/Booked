import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { displayPhone, hasAccess, normalizePhone, parsePrice, typingPhone } from '../lib/format';
import { useToast } from '../lib/toast';

export function NewQuotePage() {
  const { profile, quotes, createQuote } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [job, setJob] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    job: useRef<HTMLInputElement>(null),
    price: useRef<HTMLInputElement>(null),
  };

  // Suggest jobs this business has quoted before (faster typing in the truck).
  const recentJobs = useMemo(() => [...new Set(quotes.map((q) => q.job))].slice(0, 30), [quotes]);

  if (profile && !hasAccess(profile)) {
    return (
      <div className="page page-narrow">
        <h1 className="page-title">New Quote</h1>
        <div className="card paywall">
          <h2>Your free trial has ended</h2>
          <p>Booked is $39/month. Add a payment method to keep texting quotes and follow-ups.</p>
          <Link to="/settings#billing" className="btn btn-primary btn-lg btn-block">Add payment</Link>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const e164 = normalizePhone(phone);
    const cents = parsePrice(price);
    if (!name.trim()) return fail('Add the customer name.', refs.name);
    if (!e164) return fail('Enter a 10-digit phone number.', refs.phone);
    if (!job.trim()) return fail('Add a short job description.', refs.job);
    if (cents === null) return fail('Enter the price, like 450 or 1,250.', refs.price);

    setSaving(true);
    try {
      const { quote, sms } = await createQuote({ customer_name: name.trim(), customer_phone: e164, job: job.trim(), price: cents / 100 });
      if (sms.ok) toast(`Quote texted to ${quote.customer_name}`, 'success');
      else toast(`Quote saved, but the text wasn’t sent: ${sms.error}`, 'error');
      navigate(`/quotes/${quote.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  function fail(msg: string, ref: RefObject<HTMLInputElement>) {
    setError(msg);
    ref.current?.focus();
  }

  const next = (ref: RefObject<HTMLInputElement>) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ref.current?.focus();
    }
  };

  const cents = parsePrice(price);
  const e164 = normalizePhone(phone);

  return (
    <div className="page page-narrow">
      <h1 className="page-title">New Quote</h1>
      <form className="card form quote-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Customer name</span>
          <input
            ref={refs.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={next(refs.phone)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            placeholder="Maria Lopez"
            autoFocus
            maxLength={100}
          />
        </label>
        <label className="field">
          <span>Customer phone</span>
          <input
            ref={refs.phone}
            value={phone}
            onChange={(e) => setPhone(typingPhone(e.target.value))}
            onKeyDown={next(refs.job)}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="(555) 123-4567"
          />
        </label>
        <label className="field">
          <span>Job</span>
          <input
            ref={refs.job}
            value={job}
            onChange={(e) => setJob(e.target.value)}
            onKeyDown={next(refs.price)}
            list="recent-jobs"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            placeholder="AC tune-up and filter change"
            maxLength={300}
          />
          <datalist id="recent-jobs">
            {recentJobs.map((j) => <option key={j} value={j} />)}
          </datalist>
        </label>
        <label className="field">
          <span>Price</span>
          <div className="input-prefix">
            <span aria-hidden="true">$</span>
            <input
              ref={refs.price}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="send"
              placeholder="450"
            />
          </div>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="btn btn-primary btn-lg btn-block btn-save" type="submit" disabled={saving}>
          {saving ? 'Sending…' : 'Save & Text Quote'}
        </button>

        <p className="sms-preview">
          <strong>Text to {e164 ? displayPhone(e164) : 'customer'}:</strong> Hi {name.trim().split(/\s+/)[0] || '[name]'}, here’s your quote from{' '}
          {profile?.business_name || '[business]'} for {job.trim() || '[job]'}: {cents !== null ? `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '$[price]'}. Tap to view: [link] Reply STOP to stop texts.
        </p>
      </form>
    </div>
  );
}
