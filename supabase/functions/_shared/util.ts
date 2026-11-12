import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function env(name: string, required = true): string {
  const value = Deno.env.get(name) ?? '';
  if (required && !value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Service-role client: bypasses RLS. Only use after checking who is asking. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Returns the signed-in user for a request, or null. */
export async function getUser(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export interface Profile {
  id: string;
  business_name: string;
  phone: string;
  followup_template: string;
  followup_days: number[];
  trial_ends_at: string;
  stripe_customer_id: string | null;
  subscription_status: string | null;
}

/** Trial still running, or a paid subscription in good standing. */
export function hasAccess(p: Pick<Profile, 'trial_ends_at' | 'subscription_status'>): boolean {
  if (['active', 'trialing', 'past_due'].includes(p.subscription_status ?? '')) return true;
  return new Date(p.trial_ends_at).getTime() > Date.now();
}

/** US-first phone normalization to E.164. Returns null when it can't be a phone number. */
export function normalizePhone(input: string): string | null {
  const raw = (input ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** 125000 -> "1,250"   125050 -> "1,250.50" */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function quoteLink(token: string): string {
  return `${env('APP_URL').replace(/\/$/, '')}/q/${token}`;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

export const OPT_OUT = 'Reply STOP to stop texts.';

/** Every text we send ends with the opt-out line. */
export function withOptOut(body: string): string {
  const trimmed = body.trim();
  return /reply stop/i.test(trimmed) ? trimmed : `${trimmed} ${OPT_OUT}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
