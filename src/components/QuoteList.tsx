import { Link } from 'react-router-dom';
import { displayPhone, money, relativeTime } from '../lib/format';
import type { Quote } from '../lib/types';
import { SearchIcon } from './Icons';
import { StatusBadge } from './StatusBadge';
import type { Filter } from './Summary';

export function matches(q: Quote, search: string, filter: Filter): boolean {
  if (filter !== 'all' && q.status !== filter) return false;
  const s = search.trim().toLowerCase();
  if (!s) return true;
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
      <span className="search-label">Search</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Search by name, job or phone" />
    </label>
  );
}

export function QuoteList({ quotes, selectedId }: { quotes: Quote[]; selectedId?: string }) {
  return (
    <ul className="panel qlist">
      {quotes.map((q) => (
        <li key={q.id}>
          <Link to={`/quotes/${q.id}`} className="qrow" aria-current={q.id === selectedId ? 'true' : undefined}>
            <span className="qrow-name">
              {q.unread && <i className="new-dot" aria-label="New activity" />}
              <span>{q.customer_name}</span>
            </span>
            <span className="qrow-price">{money(q.price_cents)}</span>
            <span className="qrow-job">{q.job}</span>
            <span className="qrow-foot">
              <StatusBadge status={q.status} />
              {q.unread && q.last_event ? (
                <span className="qrow-meta fresh">{q.last_event}</span>
              ) : (
                <span className="qrow-meta">{displayPhone(q.customer_phone)} · Sent {relativeTime(q.created_at)}</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
