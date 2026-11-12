import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { hasAccess, normalizePhone, parsePrice, typingPhone } from '../lib/format';
import { useToast } from '../lib/toast';

type FieldName = 'name' | 'phone' | 'job' | 'price';

export function NewQuotePage() {
  const { profile, quotes, createQuote } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [job, setJob] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<{ field: FieldName; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const refs: Record<FieldName, RefObject<HTMLInputElement>> = {
    name: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    job: useRef<HTMLInputElement>(null),
    price: useRef<HTMLInputElement>(null),
  };

  // Jobs this business has quoted before, offered as the user types.
  const recentJobs = useMemo(() => [...new Set(quotes.map((q) => q.job))].slice(0, 30), [quotes]);

  if (profile && !hasAccess(profile)) {
    return (
      <div className="page page-narrow">
        <header className="page-header"><h1 className="page-title">New quote</h1></header>
        <div className="panel empty">
          <p className="empty-title">Your free trial has ended</p>
          <p>Booked is $39/month. Add a payment method to keep sending quotes and follow-ups.</p>
          <Link to="/settings#plan" className="btn btn-primary">Add payment method</Link>
        </div>
      </div>
    );
  }

  const fail = (field: FieldName, text: string) => {
    setError({ field, text });
    refs[field].current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const e164 = normalizePhone(phone);
    const cents = parsePrice(price);
    if (!name.trim()) return fail('name', 'Enter the customer’s name.');
    if (!e164) return fail('phone', 'Enter a 10-digit mobile number.');
    if (!job.trim()) return fail('job', 'Describe the job in a few words.');
    if (cents === null) return fail('price', 'Enter the price in dollars, for example 450 or 1,250.50.');

    setSaving(true);
    try {
      const { quote, sms } = await createQuote({ customer_name: name.trim(), customer_phone: e164, job: job.trim(), price: cents / 100 });
      if (sms.ok) toast(sms.status === 'demo' ? `Quote saved for ${quote.customer_name}` : `Quote sent to ${quote.customer_name}`, 'success');
      else toast(`Quote saved, but the text wasn’t sent: ${sms.error}`, 'error');
      navigate(`/quotes/${quote.id}`, { replace: true });
    } catch (err) {
      setError({ field: 'price', text: (err as Error).message });
      setSaving(false);
    }
  };

  const next = (field: FieldName) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      refs[field].current?.focus();
    }
  };

  const invalid = (f: FieldName) => (error?.field === f ? true : undefined);

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">New quote</h1>
          <p className="page-sub">Your customer gets a text with a link to accept or decline.</p>
        </div>
      </header>

      <form className="panel form" style={{ padding: 20 }} onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Customer name</span>
          <input
            ref={refs.name}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={next('phone')}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={100}
            aria-invalid={invalid('name')}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">Customer mobile</span>
          <input
            ref={refs.phone}
            className="input"
            value={phone}
            onChange={(e) => setPhone(typingPhone(e.target.value))}
            onKeyDown={next('job')}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={invalid('phone')}
          />
        </label>
        <label className="field">
          <span className="field-label">Job</span>
          <input
            ref={refs.job}
            className="input"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            onKeyDown={next('price')}
            list="recent-jobs"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            maxLength={300}
            aria-invalid={invalid('job')}
          />
          <datalist id="recent-jobs">
            {recentJobs.map((j) => <option key={j} value={j} />)}
          </datalist>
        </label>
        <label className="field">
          <span className="field-label">Price</span>
          <span className="affix">
            <span className="affix-text" aria-hidden="true">$</span>
            <input
              ref={refs.price}
              className="input money"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="send"
              aria-invalid={invalid('price')}
            />
          </span>
        </label>

        {error && <p className="form-error" role="alert">{error.text}</p>}

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={saving}>
          {saving ? 'Sending…' : 'Save and send quote'}
        </button>
      </form>
    </div>
  );
}
