import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { dateTime, displayPhone, followupNote, money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import type { Message, Quote, QuoteStatus } from '../lib/types';
import { CheckIcon, ClockIcon, MessageIcon, PhoneIcon, XIcon } from './Icons';
import { StatusBadge } from './StatusBadge';

const KIND_LABEL = { quote: 'Quote text', followup: 'Follow-up', reply: 'Customer reply' } as const;

export function QuoteDetail({ quote, onDeleted }: { quote: Quote; onDeleted: () => void }) {
  const { profile, setStatus, markRead, deleteQuote, resendQuote } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  // Opening a quote clears its "new activity" dot on every device.
  useEffect(() => {
    if (quote.unread) markRead(quote.id);
  }, [quote.id, quote.unread, markRead]);

  // Text history; reloads whenever something new happens on the quote.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('messages')
      .select('*')
      .eq('quote_id', quote.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => !cancelled && data && setMessages(data as Message[]));
    return () => {
      cancelled = true;
    };
  }, [quote.id, quote.last_event_at]);

  const change = async (status: QuoteStatus) => {
    try {
      await setStatus(quote.id, status);
      toast(status === 'booked' ? 'Marked as booked' : status === 'declined' ? 'Marked as declined' : 'Back to waiting', status === 'booked' ? 'success' : 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const sms = await resendQuote(quote.id);
      toast(sms.ok ? 'Quote texted again' : `Text not sent: ${sms.error}`, sms.ok ? 'success' : 'error');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete the quote for ${quote.customer_name}? This can't be undone.`)) return;
    try {
      await deleteQuote(quote.id);
      toast('Quote deleted');
      onDeleted();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const link = `${window.location.origin}/q/${quote.token}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied', 'success');
    } catch {
      prompt('Copy this link:', link);
    }
  };

  return (
    <article className="detail">
      <header className="detail-head">
        <div>
          <h2 className="detail-name">{quote.customer_name}</h2>
          <a className="detail-phone" href={`tel:${quote.customer_phone}`}>
            <PhoneIcon /> {displayPhone(quote.customer_phone)}
          </a>
        </div>
        <StatusBadge status={quote.status} large />
      </header>

      <section className="detail-quote">
        <div className="detail-job">{quote.job}</div>
        <div className="detail-price">{money(quote.price_cents)}</div>
      </section>

      {quote.last_event && (
        <p className={`detail-event${quote.status === 'booked' ? ' good' : ''}`}>
          {quote.last_event}
        </p>
      )}
      <p className="detail-followup"><ClockIcon /> {followupNote(quote, profile)}</p>

      <div className="detail-actions">
        {quote.status !== 'booked' && (
          <button className="btn btn-primary" onClick={() => change('booked')}>
            <CheckIcon /> Mark booked
          </button>
        )}
        {quote.status !== 'declined' && (
          <button className="btn btn-outline" onClick={() => change('declined')}>
            <XIcon /> Mark declined
          </button>
        )}
        {quote.status !== 'waiting' && (
          <button className="btn btn-outline" onClick={() => change('waiting')}>
            <ClockIcon /> Back to waiting
          </button>
        )}
      </div>

      <div className="detail-links">
        <button className="btn btn-ghost" onClick={() => navigate(`/q/${quote.token}?preview=1`)}>Show customer view</button>
        <button className="btn btn-ghost" onClick={copyLink}>Copy link</button>
        {!quote.sent_at && !quote.opted_out && (
          <button className="btn btn-ghost" onClick={resend} disabled={busy}>{busy ? 'Sending…' : 'Send text again'}</button>
        )}
        <a className="btn btn-ghost" href={`sms:${quote.customer_phone}`}><MessageIcon /> Text customer</a>
      </div>

      <section className="timeline">
        <h3>Texts</h3>
        {!messages.length && <p className="muted small">No texts yet.</p>}
        <ol>
          {messages.map((m) => (
            <li key={m.id} className={`bubble bubble-${m.direction}`}>
              <div className="bubble-meta">
                {KIND_LABEL[m.kind]} · {dateTime(m.created_at)}
                {m.direction === 'out' && m.status !== 'sent' && <span className="bubble-warn"> · not sent</span>}
              </div>
              <div className="bubble-body">{m.body}</div>
            </li>
          ))}
        </ol>
      </section>

      <button className="btn btn-danger-link" onClick={remove}>Delete quote</button>
    </article>
  );
}
