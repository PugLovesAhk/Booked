import { callFunction, supabase } from '../supabase';
import type { Message, Profile, Quote } from '../types';
import type { Backend } from './types';

/** The real backend: Supabase database + Edge Functions. */
export const liveBackend: Backend = {
  async loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    return (data as Profile) ?? null;
  },
  async loadQuotes() {
    const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) throw new Error('Could not load quotes. Check your connection.');
    return data as Quote[];
  },
  async loadMessages(quoteId) {
    const { data } = await supabase.from('messages').select('*').eq('quote_id', quoteId).order('created_at');
    return (data as Message[]) ?? [];
  },
  subscribe(userId, h) {
    const channel = supabase
      .channel(`owner-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === 'DELETE') h.onDelete((payload.old as Quote).id);
        else h.onQuote(payload.new as Quote);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) =>
        h.onProfile(payload.new as Profile),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  },
  createQuote: (input) => callFunction('create-quote', input),
  resendQuote: (id) => callFunction('create-quote', { resend_id: id }),
  async updateQuote(id, patch) {
    const { data, error } = await supabase.from('quotes').update(patch).eq('id', id).select().single();
    if (error) throw new Error('Could not update the quote. Check your connection.');
    return data as Quote;
  },
  async deleteQuote(id) {
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw new Error('Could not delete the quote.');
  },
  async saveProfile(userId, patch) {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
    if (error) throw new Error('Could not save. Check your connection and try again.');
    return data as Profile;
  },
  billing: (action) => callFunction('billing', { action }),
  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },
};
