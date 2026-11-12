import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { env, withOptOut } from './util.ts';

export interface SmsResult {
  ok: boolean;
  status: string; // 'sent' | 'not_configured' | 'opted_out' | 'failed'
  error?: string;
}

/**
 * Send a text with Twilio. Every message gets the "Reply STOP" line.
 * If Twilio isn't configured yet the message is logged instead (handy while setting up).
 */
export async function sendSms(admin: SupabaseClient, to: string, body: string): Promise<SmsResult> {
  const text = withOptOut(body);

  const { data: optOut } = await admin.from('sms_opt_outs').select('phone').eq('phone', to).maybeSingle();
  if (optOut) return { ok: false, status: 'opted_out', error: 'This number replied STOP' };

  const sid = env('TWILIO_ACCOUNT_SID', false);
  const token = env('TWILIO_AUTH_TOKEN', false);
  const from = env('TWILIO_FROM_NUMBER', false);
  const service = env('TWILIO_MESSAGING_SERVICE_SID', false);

  if (!sid || !token || (!from && !service)) {
    console.log(`[sms:not-configured] to=${to} body=${text}`);
    return { ok: false, status: 'not_configured', error: 'Texting is not set up yet (Twilio keys missing)' };
  }

  const form = new URLSearchParams({ To: to, Body: text });
  if (service) form.set('MessagingServiceSid', service);
  else form.set('From', from);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    if (res.ok) return { ok: true, status: 'sent' };
    const err = await res.json().catch(() => ({}));
    // 21610 = recipient has replied STOP to our number
    if (err?.code === 21610) {
      await admin.from('sms_opt_outs').upsert({ phone: to });
      return { ok: false, status: 'opted_out', error: 'This number replied STOP' };
    }
    console.error('Twilio error', res.status, err);
    return { ok: false, status: 'failed', error: err?.message ?? `Twilio error ${res.status}` };
  } catch (e) {
    console.error('Twilio request failed', e);
    return { ok: false, status: 'failed', error: 'Could not reach the texting service' };
  }
}

/** Twilio signs webhooks: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)). */
export async function validTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): Promise<boolean> {
  const token = env('TWILIO_AUTH_TOKEN', false);
  if (!token || !signature) return false;
  const payload = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Text the business owner (used when a customer answers or replies). */
export async function notifyOwner(admin: SupabaseClient, ownerPhone: string, body: string) {
  if (!ownerPhone) return;
  const res = await sendSms(admin, ownerPhone, body);
  if (!res.ok) console.log('Owner notification not sent:', res.status, res.error);
}
