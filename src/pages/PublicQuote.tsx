import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackIcon, CheckIcon, PhoneIcon, XIcon } from '../components/Icons';
import { displayPhone, money, shortDate } from '../lib/format';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase';

interface PublicView {
  business_name: string;
  business_phone: string;
  customer_name: string;
  job: string;
  price_cents: number;
  status: 'waiting' | 'booked' | 'declined';
  created_at: string;
}

const endpoint = `${SUPABASE_URL}/functions/v1/quote-public`;
const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };

/** The page customers open from the text. No login. */
export function PublicQuote() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const preview = params.get('preview') === '1'; // owner showing the quote on their tablet
  const navigate = useNavigate();
  const [quote, setQuote] = useState<PublicView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [sending, setSending] = useState<'yes' | 'no' | null>(null);
  const [justAnswered, setJustAnswered] = useState(false);

  useEffect(() => {
    fetch(`${endpoint}?t=${encodeURIComponent(token)}`, { headers })
      .then(async (r) => {
        if (r.status === 404) return setState('missing');
        if (!r.ok) throw new Error();
        const data = (await r.json()) as PublicView;
        setQuote(data);
        setState('ready');
        document.title = `Quote from ${data.business_name}`;
      })
      .catch(() => setState('error'));
  }, [token]);

  const answer = async (a: 'yes' | 'no') => {
    if (a === 'no' && !confirm('Decline this quote?')) return;
    setSending(a);
    try {
      const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ t: token, answer: a }) });
      if (!r.ok) throw new Error();
      setQuote((await r.json()) as PublicView);
      setJustAnswered(true);
    } catch {
      alert('Sorry, that didn’t go through. Please check your connection and tap again.');
    }
    setSending(null);
  };

  return (
    <div className="public">
      {preview && (
        <button className="public-preview-bar" onClick={() => navigate(-1)}>
          <BackIcon /> Back to Booked <span>(customer view)</span>
        </button>
      )}
      <header className="public-head">
        <div className="public-business">{quote?.business_name || ' '}</div>
        {quote && <div className="public-sub">Quote for {quote.customer_name} · {shortDate(quote.created_at)}</div>}
      </header>

      <main className="public-main">
        {state === 'loading' && <div className="public-card"><p className="muted center">Loading your quote…</p></div>}
        {state === 'missing' && (
          <div className="public-card"><h1 className="public-title">Quote not found</h1><p className="muted">This link may be mistyped or the quote was removed. Please contact the business that sent it.</p></div>
        )}
        {state === 'error' && (
          <div className="public-card"><h1 className="public-title">Can’t load this quote</h1><p className="muted">Check your connection and refresh the page.</p></div>
        )}

        {quote && (
          <div className="public-card">
            <div className="public-label">Job</div>
            <h1 className="public-job">{quote.job}</h1>
            <div className="public-label">Price</div>
            <div className="public-price">{money(quote.price_cents)}</div>

            {quote.status === 'waiting' ? (
              <div className="public-actions">
                <button className="btn btn-primary btn-xl" onClick={() => answer('yes')} disabled={!!sending}>
                  <CheckIcon /> {sending === 'yes' ? 'Booking…' : 'Yes, book it'}
                </button>
                <button className="btn btn-outline btn-xl" onClick={() => answer('no')} disabled={!!sending}>
                  {sending === 'no' ? 'Sending…' : 'No thanks'}
                </button>
              </div>
            ) : quote.status === 'booked' ? (
              <div className="public-result good">
                <span className="public-result-icon"><CheckIcon /></span>
                <div>
                  <strong>{justAnswered ? 'You’re booked!' : 'This job is booked.'}</strong>
                  <p>{quote.business_name} has been notified and will reach out to schedule.</p>
                </div>
              </div>
            ) : (
              <div className="public-result">
                <span className="public-result-icon"><XIcon /></span>
                <div>
                  <strong>{justAnswered ? 'Thanks for letting us know.' : 'This quote was declined.'}</strong>
                  <p>Changed your mind? Give {quote.business_name} a call.</p>
                </div>
              </div>
            )}

            {quote.business_phone && (
              <a className="public-call" href={`tel:${quote.business_phone}`}>
                <PhoneIcon /> Questions? Call {displayPhone(quote.business_phone)}
              </a>
            )}
          </div>
        )}
      </main>
      <footer className="public-foot">Sent with Booked</footer>
    </div>
  );
}
