import { Link } from 'react-router-dom';
import { displayPhone, money, relativeTime } from '../lib/format';
import type { Quote } from '../lib/types';
import { ChevronIcon, SearchIcon } from './Icons';
import { StatusBadge } from './StatusBadge';
import type { Filter } from './Summary';

export function matches(q: Quote, search: string, filter: Filter): boolean {
  if (filter !== 'all' && q.status !== filter) return false;
  if (!search.trim()) return true;
  const s = search.trim().toLowerCase();
  const digits = s.replace(/\D/g, '');
  return (
    q.customer_name.toLowerCase().includes(s) ||
    q.job.toLowerCase().includes(s) ||
    (digits.length >= 3 && q.customer_phone.includes(digits))
  );
}

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="search">
      <SearchIcon />
      <input
        type="search"
        placeholder="Search name, job, or phone"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search quotes"
      />
    </label>
  );
}

export function QuoteList({ quotes, selectedId, emptyText }: { quotes: Quote[]; selectedId?: string; emptyText: string }) {
  if (!quotes.length) return <p className="empty">{emptyText}</p>;
  return (
    <ul className="quote-list">
      {quotes.map((q) => (
        <li key={q.id}>
          <Link
            to={`/quotes/${q.id}`}
            className={`quote-card${q.id === selectedId ? ' selected' : ''}${q.unread ? ' unread' : ''}`}
            aria-current={q.id === selectedId ? 'true' : undefined}
          >
            <div className="quote-card-main">
              <div className="quote-card-top">
                <span className="quote-card-name">
                  {q.unread && <span className="dot" aria-label="New activity" />}
                  {q.customer_name}
                </span>
                <span className="quote-card-price">{money(q.price_cents)}</span>
              </div>
              <div className="quote-card-job">{q.job}</div>
              <div className="quote-card-bottom">
                <StatusBadge status={q.status} />
                <span className="muted small">
                  {q.unread && q.last_event ? q.last_event : `${displayPhone(q.customer_phone)} · ${relativeTime(q.created_at)}`}
                </span>
              </div>
            </div>
            <ChevronIcon className="quote-card-chevron" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
