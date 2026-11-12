import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import type { NewQuoteInput, ProfilePatch, SmsResult } from './backend';
import { useToast } from './toast';
import type { Message, Profile, Quote, QuoteStatus } from './types';

export interface Summary {
  waiting: number;
  booked: number;
  declined: number;
  bookedThisMonthCents: number;
  bookedThisMonthCount: number;
}

interface DataState {
  demo: boolean;
  profile: Profile | null;
  quotes: Quote[];
  loading: boolean;
  error: string;
  summary: Summary;
  createQuote: (q: NewQuoteInput) => Promise<{ quote: Quote; sms: SmsResult }>;
  resendQuote: (id: string) => Promise<SmsResult>;
  setStatus: (id: string, status: QuoteStatus) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  saveProfile: (patch: ProfilePatch) => Promise<void>;
  loadMessages: (quoteId: string) => Promise<Message[]>;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

function upsert(list: Quote[], q: Quote): Quote[] {
  const i = list.findIndex((x) => x.id === q.id);
  const next = i === -1 ? [q, ...list] : list.map((x) => (x.id === q.id ? q : x));
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, backend } = useAuth();
  const userId = session?.userId;
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [p, q] = await Promise.all([backend.loadProfile(userId), backend.loadQuotes()]);
      setProfile(p);
      setQuotes(q);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, [userId, backend]);

  // Initial load, then live updates from every device.
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    refresh();

    const unsubscribe = backend.subscribe(userId, {
      onQuote: (q) => {
        const before = quotesRef.current.find((x) => x.id === q.id);
        setQuotes((list) => upsert(list, q));
        // Customer activity: tell the owner right away.
        if (q.unread && q.last_event && q.last_event_at !== before?.last_event_at) {
          toast(`${q.customer_name}: ${q.last_event}`, q.status === 'booked' ? 'success' : 'info', () => navigate(`/quotes/${q.id}`));
        }
      },
      onDelete: (id) => setQuotes((list) => list.filter((x) => x.id !== id)),
      onProfile: setProfile,
    });

    // Phones pause background tabs; catch up whenever the app comes back.
    const onWake = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', refresh);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', refresh);
    };
  }, [userId, backend, refresh, toast, navigate]);

  const summary = useMemo<Summary>(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const s: Summary = { waiting: 0, booked: 0, declined: 0, bookedThisMonthCents: 0, bookedThisMonthCount: 0 };
    for (const q of quotes) {
      s[q.status]++;
      if (q.status === 'booked' && q.booked_at && new Date(q.booked_at).getTime() >= monthStart) {
        s.bookedThisMonthCents += q.price_cents;
        s.bookedThisMonthCount++;
      }
    }
    return s;
  }, [quotes]);

  const markRead = useCallback(
    async (id: string) => {
      setQuotes((list) => list.map((q) => (q.id === id ? { ...q, unread: false } : q)));
      await backend.updateQuote(id, { unread: false }).catch(() => {});
    },
    [backend],
  );

  const loadMessages = useCallback((quoteId: string) => backend.loadMessages(quoteId), [backend]);

  const value: DataState = {
    demo: Boolean(session?.demo),
    profile,
    quotes,
    loading,
    error,
    summary,
    refresh,
    markRead,
    loadMessages,
    createQuote: async (input) => {
      const res = await backend.createQuote(input);
      setQuotes((list) => upsert(list, res.quote));
      return res;
    },
    resendQuote: async (id) => {
      const res = await backend.resendQuote(id);
      setQuotes((list) => upsert(list, res.quote));
      return res.sms;
    },
    setStatus: async (id, status) => {
      const prev = quotesRef.current;
      setQuotes((list) => list.map((q) => (q.id === id ? { ...q, status } : q)));
      try {
        const q = await backend.updateQuote(id, { status });
        setQuotes((list) => upsert(list, q));
      } catch (e) {
        setQuotes(prev);
        throw e;
      }
    },
    deleteQuote: async (id) => {
      await backend.deleteQuote(id);
      setQuotes((list) => list.filter((q) => q.id !== id));
    },
    saveProfile: async (patch) => {
      if (!userId) return;
      setProfile(await backend.saveProfile(userId, patch));
    },
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
