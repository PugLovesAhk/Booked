import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackIcon, CheckIcon, PhoneIcon, XIcon } from '../components/Icons';
import { demoAnswer, demoPublicQuote, type PublicView } from '../lib/backend';
import { displayPhone, money, shortDate } from '../lib/format';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase';

const endpoint = `${SUPABASE_URL}/functions/v1/quote-public`;
const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };

/** The page customers open from the text. No login. */
export function PublicQuote() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const preview = params.get('preview') === '1'; // the owner showing the quote on their own screen
  const navigate = useNavigate();
  const [quote, setQuote] = useState<PublicView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [sending, setSending] = useState<'yes' | 'no' | null>(null);
  const [justAnswered, setJustAnswered] = useState(false);
  const local = demoPublicQuote(token) !== null;

  useEffect(() => {
    const show = (data: PublicView) => {
      setQuote(data);
      setState('ready');
      document.title = data.business_name ? `Quote from ${data.business_name}` : 'Your quote';
    };
    const demo = demoPublicQuote(token);
    if (demo) return show(demo);
    fetch(`${endpoint}?t=${encodeURIComponent(token)}`, { headers })
      .then(async (r) => {
        if (r.status === 404) return setState('missing');
        if (!r.ok) throw new Error();
        show((await r.json()) as PublicView);
      })
      .catch(() => setState('error'));
  }, [token]);

  const answer = async (a: 'yes' | 'no') => {
    if (a === 'no' && !confirm('Decline this quote?')) return;
    setSending(a);
    try {
      if (local) {
        setQuote(demoAnswer(token, a));
      } else {
        const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ t: token, answer: a }) });
        if (!r.ok) throw new Error();
        setQuote((await r.json()) as PublicView);
      }
      setJustAnswered(true);
    } catch {
      alert('That didn’t go through. Check your connection and tap again.');
    }
    setSending(null);
  };

  const business = quote?.business_name || 'Your contractor';

  return (
    <div className="public">
      {preview && (
        <button className="public-preview" onClick={() => navigate(-1)}>
          <BackIcon /> <strong>Back to Booked</strong> <span className="public-preview-note">· This is what your customer sees</span>
        </button>
      )}
      <header className="public-bar">
        <div className="public-bar-inner">
          <span className="public-business">{quote ? business : ''}</span>
          {quote?.business_phone && (
            <a href={`tel:${quote.business_phone}`}><PhoneIcon /> {displayPhone(quote.business_phone)}</a>
          )}
        </div>
      </header>

      <main className="public-main">
        <article className="panel sheet">
          {state === 'loading' && <div className="sheet-message"><p>Loading your quote…</p></div>}
          {state === 'missing' && (
            <div className="sheet-message">
              <h1>We couldn’t find this quote</h1>
              <p>The link may be incomplete, or the quote was removed. Contact the business that sent it.</p>
            </div>
          )}
          {state === 'error' && (
            <div className="sheet-message">
              <h1>This quote didn’t load</h1>
              <p>Check your connection, then refresh the page.</p>
            </div>
          )}

          {quote && (
            <>
              <div className="sheet-head">
                <h1>Quote for {quote.customer_name}</h1>
                <p>{shortDate(quote.created_at)}</p>
              </div>
              <div className="sheet-cols"><span>Job</span><span>Amount</span></div>
              <div className="sheet-line">
                <span>{quote.job}</span>
                <span className="money">{money(quote.price_cents)}</span>
              </div>
              <div className="sheet-total">
                <span>Total</span>
                <strong>{money(quote.price_cents)}</strong>
              </div>

              {quote.status === 'waiting' ? (
                <div className="sheet-actions">
                  <button className="btn btn-primary" onClick={() => answer('yes')} disabled={!!sending}>
                    <CheckIcon /> {sending === 'yes' ? 'Booking…' : 'Yes, book it'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => answer('no')} disabled={!!sending}>
                    {sending === 'no' ? 'Sending…' : 'No thanks'}
                  </button>
                </div>
              ) : quote.status === 'booked' ? (
                <div className="sheet-result good" role="status">
                  <span className="sheet-result-icon"><CheckIcon /></span>
                  <div>
                    <strong>{justAnswered ? 'You’re booked.' : 'This job is booked.'}</strong>
                    <p>{business} has been notified and will contact you to schedule.</p>
                  </div>
                </div>
              ) : (
                <div className="sheet-result" role="status">
                  <span className="sheet-result-icon"><XIcon /></span>
                  <div>
                    <strong>{justAnswered ? 'Thanks for letting us know.' : 'This quote was declined.'}</strong>
                    <p>Changed your mind? Call {business}{quote.business_phone ? ` at ${displayPhone(quote.business_phone)}` : ''}.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </article>
      </main>
      <footer className="public-foot">Sent with Booked</footer>
    </div>
  );
}
