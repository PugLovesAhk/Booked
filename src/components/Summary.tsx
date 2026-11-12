import { useData } from '../lib/data';
import { money } from '../lib/format';
import type { QuoteStatus } from '../lib/types';
import { CheckIcon, ClockIcon, DollarIcon, XIcon } from './Icons';

export type Filter = 'all' | QuoteStatus;

export function Summary({ filter, onFilter, compact = false }: { filter: Filter; onFilter: (f: Filter) => void; compact?: boolean }) {
  const { summary } = useData();
  const month = new Date().toLocaleDateString('en-US', { month: 'long' });
  const toggle = (f: Filter) => onFilter(filter === f ? 'all' : f);

  return (
    <div className={`summary${compact ? ' summary-compact' : ''}`}>
      <button className={`stat stat-waiting${filter === 'waiting' ? ' active' : ''}`} onClick={() => toggle('waiting')} aria-pressed={filter === 'waiting'}>
        <span className="stat-label"><ClockIcon /> Waiting</span>
        <span className="stat-value">{summary.waiting}</span>
      </button>
      <button className={`stat stat-booked${filter === 'booked' ? ' active' : ''}`} onClick={() => toggle('booked')} aria-pressed={filter === 'booked'}>
        <span className="stat-label"><CheckIcon /> Booked</span>
        <span className="stat-value">{summary.booked}</span>
      </button>
      <button className={`stat stat-declined${filter === 'declined' ? ' active' : ''}`} onClick={() => toggle('declined')} aria-pressed={filter === 'declined'}>
        <span className="stat-label"><XIcon /> Declined</span>
        <span className="stat-value">{summary.declined}</span>
      </button>
      <div className="stat stat-money">
        <span className="stat-label"><DollarIcon /> Booked in {month}</span>
        <span className="stat-value">{money(summary.bookedThisMonthCents, { compact })}</span>
      </div>
    </div>
  );
}
