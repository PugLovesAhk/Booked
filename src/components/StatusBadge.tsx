import { statusLabel } from '../lib/format';
import type { QuoteStatus } from '../lib/types';
import { CheckIcon, ClockIcon, XIcon } from './Icons';

export function StatusBadge({ status, large = false }: { status: QuoteStatus; large?: boolean }) {
  const Icon = status === 'booked' ? CheckIcon : status === 'declined' ? XIcon : ClockIcon;
  return (
    <span className={`badge badge-${status}${large ? ' badge-lg' : ''}`}>
      <Icon />
      {statusLabel(status)}
    </span>
  );
}
