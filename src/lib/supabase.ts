import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'http://localhost:54321';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'missing-key';
export const isConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// Sessions are saved on each device and refreshed automatically, so people stay logged in.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Call one of our Edge Functions and turn errors into a readable message. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let message = 'Something went wrong. Please try again.';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) message = payload.error;
    } else if (!navigator.onLine) {
      message = 'You’re offline. Check your connection and try again.';
    }
    throw new Error(message);
  }
  return data as T;
}
