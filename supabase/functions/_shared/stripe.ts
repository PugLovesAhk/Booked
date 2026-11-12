import { env } from './util.ts';
import { timingSafeEqual } from './sms.ts';

type Params = Record<string, string | number | boolean | undefined>;

/** Minimal Stripe REST client (no SDK needed). */
export async function stripe<T = any>(method: 'GET' | 'POST', path: string, params: Params = {}): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && [...body].length ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'POST' ? body : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data as T;
}

/** Verifies the Stripe-Signature header (t=...,v1=...) and returns the parsed event. */
export async function verifyStripeEvent(payload: string, header: string, toleranceSec = 300) {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  ) as Record<string, string>;
  const signatures = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !signatures.length) throw new Error('Bad signature header');
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) throw new Error('Signature too old');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env('STRIPE_WEBHOOK_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!signatures.some((s) => timingSafeEqual(s, expected))) throw new Error('Signature mismatch');
  return JSON.parse(payload);
}
