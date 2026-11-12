import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { callFunction, supabase } from './supabase';
import { useToast } from './toast';
import type { Profile, Quote, QuoteStatus } from './types';

interface Summary {
  waiting: number;
  booked: number;
  declined: number;
  bookedThisMonthCents: number;
  bookedThisMonthCount: number;
}

interface DataState {
  profile: Profile | null;
  quotes: Quote[];
  loading: boolean;
  summary: Summary;
  createQuote: (q: { customer_name: string; customer_phone: string; job: string; price: number }) => Promise<{ quote: Quote; sms: { ok: boolean; status: string; error?: string } }>;
  resendQuote: (id: string) => Promise<{ ok: boolean; error?: string }>;
  setStatus: (id: string, status: QuoteStatus) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  saveProfile: (patch: Partial<Pick<Profile, 'business_name' | 'phone' | 'followup_template' | 'followup_days'>>) => Promise<void>;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

function upsert(list: Quote[], q: Quote): Quote[] {
  const i = list.findIndex((x) => x.id === q.id);
  const next = i === -1 ? [q, ...list] : list.map((x) => (x.id === q.id ? q : x));
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [p, q] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (p.data) setProfile(p.data as Profile);
    if (q.data) setQuotes(q.data as Quote[]);
    setLoading(false);
  }, [userId]);

  // Initial load + live updates from every device.
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    refresh();

    const channel = supabase
      .channel(`owner-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setQuotes((list) => list.filter((x) => x.id !== (payload.old as Quote).id));
          return;
        }
        const q = payload.new as Quote;
        const before = quotesRef.current.find((x) => x.id === q.id);
        setQuotes((list) => upsert(list, q));
        // Customer activity: tell the owner right away.
        if (q.unread && q.last_event && q.last_event_at !== before?.last_event_at) {
          const kind = q.status === 'booked' ? 'success' : 'info';
          toast(`${q.customer_name}: ${q.last_event}`, kind, () => navigate(`/quotes/${q.id}`));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
        setProfile(payload.new as Profile);
      })
      .subscribe();

    // Phones pause background tabs; catch up whenever the app comes back.
    const onWake = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', refresh);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', refresh);
    };
  }, [userId, refresh, toast, navigate]);

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

  const value: DataState = {
    profile,
    quotes,
    loading,
    summary,
    refresh,
    createQuote: async (input) => {
      const res = await callFunction<{ quote: Quote; sms: { ok: boolean; status: string; error?: string } }>('create-quote', input);
      setQuotes((list) => upsert(list, res.quote));
      return res;
    },
    resendQuote: async (id) => {
      const res = await callFunction<{ quote: Quote; sms: { ok: boolean; error?: string } }>('create-quote', { resend_id: id });
      setQuotes((list) => upsert(list, res.quote));
      return res.sms;
    },
    setStatus: async (id, status) => {
      const prev = quotesRef.current;
      setQuotes((list) => list.map((q) => (q.id === id ? { ...q, status } : q)));
      const { data, error } = await supabase.from('quotes').update({ status }).eq('id', id).select().single();
      if (error) {
        setQuotes(prev);
        throw new Error('Could not update the quote. Check your connection.');
      }
      setQuotes((list) => upsert(list, data as Quote));
    },
    markRead: async (id) => {
      setQuotes((list) => list.map((q) => (q.id === id ? { ...q, unread: false } : q)));
      await supabase.from('quotes').update({ unread: false }).eq('id', id);
    },
    deleteQuote: async (id) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw new Error('Could not delete the quote.');
      setQuotes((list) => list.filter((q) => q.id !== id));
    },
    saveProfile: async (patch) => {
      if (!userId) return;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
      if (error) throw new Error('Could not save. Check your connection and try again.');
      setProfile(data as Profile);
    },
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
