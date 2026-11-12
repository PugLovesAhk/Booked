import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayPhone, money, shortDate } from '../lib/format';
import type { Quote } from '../lib/types';
import { SortIcon } from './Icons';
import { StatusBadge } from './StatusBadge';

type Key = 'customer_name' | 'job' | 'price_cents' | 'status' | 'followups_sent' | 'created_at';
const STATUS_ORDER = { waiting: 0, booked: 1, declined: 2 } as const;

const COLUMNS: { key: Key; label: string; right?: boolean }[] = [
  { key: 'customer_name', label: 'Customer' },
  { key: 'job', label: 'Job' },
  { key: 'price_cents', label: 'Price', right: true },
  { key: 'status', label: 'Status' },
  { key: 'followups_sent', label: 'Follow-ups', right: true },
  { key: 'created_at', label: 'Sent' },
];

export function QuoteTable({ quotes, selectedId }: { quotes: Quote[]; selectedId?: string }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'created_at', dir: -1 });

  const sorted = useMemo(() => {
    const val = (q: Quote) =>
      sort.key === 'status' ? STATUS_ORDER[q.status] : typeof q[sort.key] === 'string' ? (q[sort.key] as string).toLowerCase() : q[sort.key];
    return [...quotes].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [quotes, sort]);

  const toggle = (key: Key) =>
    setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'created_at' || key === 'price_cents' ? -1 : 1 }));

  return (
    <div className="panel table-panel">
      <table className="qtable">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} className={c.right ? 'r' : ''} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button className="th-sort" data-active={active} onClick={() => toggle(c.key)}>
                    {c.label}
                    <SortIcon />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((q) => (
            <tr
              key={q.id}
              aria-selected={q.id === selectedId}
              tabIndex={0}
              onClick={() => navigate(`/quotes/${q.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/quotes/${q.id}`)}
            >
              <td>
                <div className="cell-customer">
                  {q.unread && <i className="new-dot" aria-label="New activity" />}
                  {q.customer_name}
                </div>
                <div className="cell-sub">{displayPhone(q.customer_phone)}</div>
              </td>
              <td className="cell-job">{q.job}</td>
              <td className="r cell-price">{money(q.price_cents)}</td>
              <td><StatusBadge status={q.status} /></td>
              <td className="r">{q.followups_sent}</td>
              <td className="cell-sub">{shortDate(q.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
