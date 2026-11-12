import type { Profile, Quote } from './types';

export function money(cents: number, opts: { compact?: boolean } = {}): string {
  const dollars = cents / 100;
  if (opts.compact && dollars >= 10000) {
    return '$' + (dollars / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k';
  }
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "1,250.50" or "$1250" -> 125050 cents. Returns null if not a price. */
export function parsePrice(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Math.round(parseFloat(cleaned) * 100);
  return value < 100_000_000 ? value : null;
}

/** US-first normalization to E.164, mirrors the server. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function displayPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Formats as the user types: 5551234567 -> (555) 123-4567 */
export function typingPhone(input: string): string {
  if (input.trim().startsWith('+')) return input;
  let d = input.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return shortDate(iso);
}

export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function statusLabel(s: Quote['status']): string {
  return s === 'waiting' ? 'Waiting' : s === 'booked' ? 'Booked' : 'Declined';
}

/** What happens next with follow-ups, in plain words. */
export function followupNote(q: Quote, p: Profile | null): string {
  if (q.status !== 'waiting') return 'Follow-ups stopped (customer answered)';
  if (q.opted_out) return 'Customer replied STOP. No more texts.';
  if (q.replied_at) return 'Follow-ups stopped (customer texted back)';
  if (!q.sent_at) return 'Quote text not sent yet';
  const days = p?.followup_days ?? [];
  if (q.followups_sent >= days.length) return 'All follow-ups sent';
  const next = new Date(new Date(q.sent_at).getTime() + days[q.followups_sent] * 86400000);
  return `Next follow-up ${next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

export function trialDaysLeft(p: Profile): number {
  return Math.max(0, Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86400000));
}

export function isSubscribed(p: Profile): boolean {
  return ['active', 'trialing', 'past_due'].includes(p.subscription_status ?? '');
}

export function hasAccess(p: Profile): boolean {
  return isSubscribed(p) || new Date(p.trial_ends_at).getTime() > Date.now();
}
