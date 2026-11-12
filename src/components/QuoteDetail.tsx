import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { dateTime, displayPhone, followupNote, money, shortDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Message, Quote, QuoteStatus } from '../lib/types';
import { CheckIcon, ClockIcon, MessageIcon, PhoneIcon, XIcon } from './Icons';
import { StatusBadge } from './StatusBadge';

const KIND_LABEL = { quote: 'Quote', followup: 'Follow-up', reply: 'Customer reply' } as const;
const STATUS_NOTE: Record<string, string> = {
  demo: 'demo, not sent',
  not_configured: 'not sent',
  failed: 'failed',
  opted_out: 'blocked (STOP)',
};

export function QuoteDetail({ quote, onDeleted }: { quote: Quote; onDeleted: () => void }) {
  const { profile, setStatus, markRead, deleteQuote, resendQuote, loadMessages } = useData();
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
    loadMessages(quote.id).then((m) => !cancelled && setMessages(m));
    return () => {
      cancelled = true;
    };
  }, [quote.id, quote.last_event_at, loadMessages]);

  const change = async (status: QuoteStatus) => {
    try {
      await setStatus(quote.id, status);
      toast(status === 'booked' ? 'Marked as booked' : status === 'declined' ? 'Marked as declined' : 'Moved back to waiting', status === 'booked' ? 'success' : 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const sms = await resendQuote(quote.id);
      toast(sms.ok ? 'Quote sent again' : `Text not sent: ${sms.error}`, sms.ok ? 'success' : 'error');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!confirm(`Delete the quote for ${quote.customer_name}? This can’t be undone.`)) return;
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
      <header className="detail-header">
        <div>
          <h2 className="detail-name">{quote.customer_name}</h2>
          <a className="detail-contact" href={`tel:${quote.customer_phone}`}>
            <PhoneIcon /> {displayPhone(quote.customer_phone)}
          </a>
        </div>
        <StatusBadge status={quote.status} large />
      </header>

      <section className="panel estimate" aria-label="Quote">
        <div className="estimate-head">
          <span>Job</span>
          <span>Sent {shortDate(quote.created_at)}</span>
        </div>
        <div className="estimate-line">
          <span>{quote.job}</span>
          <span className="money">{money(quote.price_cents)}</span>
        </div>
        <div className="estimate-total">
          <span>Total</span>
          <strong>{money(quote.price_cents)}</strong>
        </div>
      </section>

      <div className="activity">
        {quote.last_event && (
          <p className={`activity-row strong${quote.status === 'booked' ? ' good' : ''}`}>
            {quote.status === 'booked' ? <CheckIcon /> : <MessageIcon />}
            {quote.last_event}
          </p>
        )}
        <p className="activity-row"><ClockIcon /> {followupNote(quote, profile)}</p>
      </div>

      <div className="detail-actions">
        {quote.status !== 'booked' && (
          <button className="btn btn-primary" onClick={() => change('booked')}><CheckIcon /> Mark booked</button>
        )}
        {quote.status !== 'declined' && (
          <button className="btn btn-secondary" onClick={() => change('declined')}><XIcon /> Mark declined</button>
        )}
        {quote.status !== 'waiting' && (
          <button className="btn btn-secondary" onClick={() => change('waiting')}><ClockIcon /> Back to waiting</button>
        )}
      </div>

      <div className="detail-tools">
        <button className="btn btn-quiet" onClick={() => navigate(`/q/${quote.token}?preview=1`)}>Customer view</button>
        <button className="btn btn-quiet" onClick={copyLink}>Copy link</button>
        <a className="btn btn-quiet" href={`sms:${quote.customer_phone}`}>Text customer</a>
        {!quote.sent_at && !quote.opted_out && (
          <button className="btn btn-quiet" onClick={resend} disabled={busy}>{busy ? 'Sending…' : 'Send again'}</button>
        )}
      </div>

      <section className="history">
        <h3>Text history</h3>
        {messages.length === 0 ? (
          <p className="muted small">No texts yet.</p>
        ) : (
          <ol>
            {messages.map((m) => (
              <li key={m.id} className={`sms sms-${m.direction}`}>
                <div className="sms-meta">
                  {KIND_LABEL[m.kind]} · {dateTime(m.created_at)}
                  {m.direction === 'out' && STATUS_NOTE[m.status] && <span className="warn"> · {STATUS_NOTE[m.status]}</span>}
                </div>
                <div className="sms-body">{m.body}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <button className="btn btn-danger detail-delete" onClick={remove}>Delete quote</button>
    </article>
  );
}
