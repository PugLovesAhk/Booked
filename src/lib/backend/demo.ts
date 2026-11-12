import { money } from '../format';
import type { Message, Profile, Quote } from '../types';
import type { Backend, NewQuoteInput, PublicView } from './types';

/**
 * The admin/admin account. Works without any server: data lives in this browser only,
 * no texts are sent and no card is charged. Open tabs stay in sync through storage events.
 */
const KEY = 'booked-demo-data';
export const DEMO_USER_ID = '00000000-0000-4000-8000-00000000ad01';
export const DEMO_EMAIL = 'admin';

interface Store {
  profile: Profile;
  quotes: Quote[];
  messages: Message[];
}

const DEFAULT_TEMPLATE = 'Hi {name}, just checking in on your quote from {business} for {job}: ${price}. Tap to view: {link}';

function fresh(): Store {
  return {
    profile: {
      id: DEMO_USER_ID,
      business_name: 'Admin',
      phone: '',
      followup_template: DEFAULT_TEMPLATE,
      followup_days: [2, 5, 10],
      trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      stripe_customer_id: null,
      subscription_status: null,
    },
    quotes: [],
    messages: [],
  };
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* fall through */
  }
  const s = fresh();
  write(s);
  return s;
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: keep working in memory for this visit */
  }
}

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const withOptOut = (t: string) => (/reply stop/i.test(t) ? t : `${t.trim()} Reply STOP to stop texts.`);

function quoteText(q: Quote, p: Profile) {
  const link = `${window.location.origin}/q/${q.token}`;
  return withOptOut(
    `Hi ${firstName(q.customer_name)}, here's your quote from ${p.business_name || 'us'} for ${q.job}: ${money(q.price_cents)}. Tap to view: ${link}`,
  );
}

function logText(s: Store, q: Quote, body: string) {
  const id = (s.messages[s.messages.length - 1]?.id ?? 0) + 1;
  s.messages.push({ id, quote_id: q.id, direction: 'out', kind: 'quote', body, status: 'demo', created_at: new Date().toISOString() });
}

export const demoBackend: Backend = {
  async loadProfile() {
    return read().profile;
  },
  async loadQuotes() {
    return [...read().quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async loadMessages(quoteId) {
    return read().messages.filter((m) => m.quote_id === quoteId);
  },
  subscribe(_userId, h) {
    let snapshot = read();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const next = read();
      const before = new Map(snapshot.quotes.map((q) => [q.id, q]));
      for (const q of next.quotes) if (JSON.stringify(before.get(q.id)) !== JSON.stringify(q)) h.onQuote(q);
      const ids = new Set(next.quotes.map((q) => q.id));
      for (const q of snapshot.quotes) if (!ids.has(q.id)) h.onDelete(q.id);
      if (JSON.stringify(snapshot.profile) !== JSON.stringify(next.profile)) h.onProfile(next.profile);
      snapshot = next;
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
  async createQuote(input: NewQuoteInput) {
    const s = read();
    const now = new Date().toISOString();
    const q: Quote = {
      id: crypto.randomUUID(),
      user_id: DEMO_USER_ID,
      token: hex(8),
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      job: input.job,
      price_cents: Math.round(input.price * 100),
      status: 'waiting',
      sent_at: now,
      followups_sent: 0,
      last_followup_at: null,
      replied_at: null,
      responded_at: null,
      booked_at: null,
      opted_out: false,
      unread: false,
      last_event: 'Saved. Demo account: no text was sent.',
      last_event_at: now,
      created_at: now,
      updated_at: now,
    };
    s.quotes.unshift(q);
    logText(s, q, quoteText(q, s.profile));
    write(s);
    return { quote: q, sms: { ok: true, status: 'demo' } };
  },
  async resendQuote(id) {
    const s = read();
    const q = s.quotes.find((x) => x.id === id);
    if (!q) throw new Error('Quote not found.');
    logText(s, q, quoteText(q, s.profile));
    write(s);
    return { quote: q, sms: { ok: true, status: 'demo' } };
  },
  async updateQuote(id, patch) {
    const s = read();
    const q = s.quotes.find((x) => x.id === id);
    if (!q) throw new Error('Quote not found.');
    const now = new Date().toISOString();
    if (patch.status && patch.status !== q.status) q.booked_at = patch.status === 'booked' ? now : null;
    Object.assign(q, patch, { updated_at: now });
    write(s);
    return q;
  },
  async deleteQuote(id) {
    const s = read();
    s.quotes = s.quotes.filter((q) => q.id !== id);
    s.messages = s.messages.filter((m) => m.quote_id !== id);
    write(s);
  },
  async saveProfile(_userId, patch) {
    const s = read();
    s.profile = { ...s.profile, ...patch };
    write(s);
    return s.profile;
  },
  async billing() {
    throw new Error('Billing is turned off for the admin demo account.');
  },
  async updatePassword() {
    throw new Error('The admin demo account’s password can’t be changed.');
  },
};

/** Customer page support for quotes created by the demo account (same browser only). */
export function demoPublicQuote(token: string): PublicView | null {
  let s: Store;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    s = JSON.parse(raw);
  } catch {
    return null;
  }
  const q = s.quotes.find((x) => x.token === token);
  if (!q) return null;
  return {
    business_name: s.profile.business_name,
    business_phone: s.profile.phone,
    customer_name: q.customer_name,
    job: q.job,
    price_cents: q.price_cents,
    status: q.status,
    created_at: q.created_at,
  };
}

export function demoAnswer(token: string, answer: 'yes' | 'no'): PublicView | null {
  const s = read();
  const q = s.quotes.find((x) => x.token === token);
  if (!q) return null;
  if (q.status === 'waiting') {
    const now = new Date().toISOString();
    q.status = answer === 'yes' ? 'booked' : 'declined';
    q.booked_at = answer === 'yes' ? now : null;
    q.responded_at = now;
    q.unread = true;
    q.last_event = answer === 'yes' ? 'Customer accepted the quote' : 'Customer declined the quote';
    q.last_event_at = now;
    q.updated_at = now;
    write(s);
  }
  return demoPublicQuote(token);
}
