import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayPhone, money, shortDate } from '../lib/format';
import type { Quote } from '../lib/types';
import { SortIcon } from './Icons';
import { StatusBadge } from './StatusBadge';

type Key = 'customer_name' | 'job' | 'price_cents' | 'status' | 'created_at' | 'followups_sent';
const STATUS_ORDER = { waiting: 0, booked: 1, declined: 2 } as const;

export function QuoteTable({ quotes, selectedId }: { quotes: Quote[]; selectedId?: string }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'created_at', dir: -1 });

  const sorted = useMemo(() => {
    const val = (q: Quote) =>
      sort.key === 'status' ? STATUS_ORDER[q.status] : sort.key === 'customer_name' || sort.key === 'job' ? q[sort.key].toLowerCase() : q[sort.key];
    return [...quotes].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [quotes, sort]);

  const header = (key: Key, label: string, className = '') => {
    const active = sort.key === key;
    return (
      <th className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          className={`th-btn${active ? ' active' : ''}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'created_at' || key === 'price_cents' ? -1 : 1 }))}
        >
          {label}
          <SortIcon className="sort-icon" />
        </button>
      </th>
    );
  };

  if (!quotes.length) return <p className="empty">No quotes match.</p>;

  return (
    <div className="table-wrap">
      <table className="quote-table">
        <thead>
          <tr>
            {header('customer_name', 'Customer')}
            {header('job', 'Job')}
            {header('price_cents', 'Price', 'num')}
            {header('status', 'Status')}
            {header('followups_sent', 'Follow-ups', 'num')}
            {header('created_at', 'Sent')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((q) => (
            <tr
              key={q.id}
              className={`${q.id === selectedId ? 'selected' : ''}${q.unread ? ' unread' : ''}`}
              onClick={() => navigate(`/quotes/${q.id}`)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/quotes/${q.id}`)}
            >
              <td>
                <div className="cell-name">
                  {q.unread && <span className="dot" aria-label="New activity" />}
                  {q.customer_name}
                </div>
                <div className="muted small">{displayPhone(q.customer_phone)}</div>
              </td>
              <td className="cell-job">{q.job}</td>
              <td className="num strong">{money(q.price_cents)}</td>
              <td><StatusBadge status={q.status} /></td>
              <td className="num">{q.followups_sent}</td>
              <td className="muted">{shortDate(q.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
