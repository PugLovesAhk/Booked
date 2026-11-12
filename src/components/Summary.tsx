import { useData } from '../lib/data';
import { money } from '../lib/format';
import type { QuoteStatus } from '../lib/types';
import { CheckIcon, ClockIcon, XIcon } from './Icons';

export type Filter = 'all' | QuoteStatus;

/** Waiting · Booked · Declined · $ booked this month. Status cells filter the list. */
export function Summary({ filter, onFilter, compact = false }: { filter: Filter; onFilter: (f: Filter) => void; compact?: boolean }) {
  const { summary } = useData();
  const month = new Date().toLocaleDateString('en-US', { month: 'long' });
  const cell = (key: QuoteStatus, label: string, Icon: typeof CheckIcon) => (
    <button
      className={`stat stat-${key}`}
      aria-pressed={filter === key}
      onClick={() => onFilter(filter === key ? 'all' : key)}
      title={filter === key ? 'Show all quotes' : `Show ${label.toLowerCase()} quotes`}
    >
      <span className="stat-label"><Icon /> {label}</span>
      <span className="stat-value">{summary[key]}</span>
    </button>
  );

  return (
    <div className={`panel stats${compact ? ' stats-compact' : ''}`}>
      {cell('waiting', 'Waiting', ClockIcon)}
      {cell('booked', 'Booked', CheckIcon)}
      {cell('declined', 'Declined', XIcon)}
      <div className="stat stat-static stat-money">
        <span className="stat-label">Booked in {month}</span>
        <span className="stat-value">{money(summary.bookedThisMonthCents)}</span>
        {!compact && (
          <span className="stat-note">
            {summary.bookedThisMonthCount} job{summary.bookedThisMonthCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}

export function StatusFilter({ filter, onFilter }: { filter: Filter; onFilter: (f: Filter) => void }) {
  const items: [Filter, string][] = [['all', 'All'], ['waiting', 'Waiting'], ['booked', 'Booked'], ['declined', 'Declined']];
  return (
    <div className="segmented" role="group" aria-label="Filter by status">
      {items.map(([f, label]) => (
        <button key={f} aria-pressed={filter === f} onClick={() => onFilter(f)}>
          {label}
        </button>
      ))}
    </div>
  );
}
