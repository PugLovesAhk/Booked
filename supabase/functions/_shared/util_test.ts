// Run: deno test supabase/functions/_shared/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { fillTemplate, formatPrice, hasAccess, normalizePhone, withOptOut } from './util.ts';
import { validTwilioSignature } from './sms.ts';
import { verifyStripeEvent } from './stripe.ts';

Deno.test('normalizePhone', () => {
  assertEquals(normalizePhone('(512) 555-0100'), '+15125550100');
  assertEquals(normalizePhone('1-512-555-0100'), '+15125550100');
  assertEquals(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assertEquals(normalizePhone('555-0100'), null);
});

Deno.test('formatPrice', () => {
  assertEquals(formatPrice(125000), '1,250');
  assertEquals(formatPrice(125050), '1,250.50');
  assertEquals(formatPrice(18900), '189');
});

Deno.test('templates always carry the opt-out', () => {
  const t = 'Hi {name}, quote from {business} for {job}: ${price}. Tap to view: {link}';
  const out = withOptOut(fillTemplate(t, { name: 'Maria', business: 'Cool Breeze', job: 'AC tune-up', price: '189', link: 'https://x/q/1' }));
  assertEquals(out, 'Hi Maria, quote from Cool Breeze for AC tune-up: $189. Tap to view: https://x/q/1 Reply STOP to stop texts.');
  assertEquals(withOptOut('Hello. Reply STOP to stop texts.'), 'Hello. Reply STOP to stop texts.');
});

Deno.test('hasAccess: trial or paid', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  assert(hasAccess({ trial_ends_at: future, subscription_status: null }));
  assert(!hasAccess({ trial_ends_at: past, subscription_status: null }));
  assert(!hasAccess({ trial_ends_at: past, subscription_status: 'canceled' }));
  assert(hasAccess({ trial_ends_at: past, subscription_status: 'active' }));
});

Deno.test('Twilio signature (values from the official twilio library)', async () => {
  Deno.env.set('TWILIO_AUTH_TOKEN', '12345');
  const params = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
  assert(await validTwilioSignature(url, params, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='));
  assert(!(await validTwilioSignature(url, { ...params, Digits: '9' }, '0/KCTR6DLpKmkAf8muzZqo1nDgQ=')));
  Deno.env.set('TWILIO_AUTH_TOKEN', 'tok');
  const inbound = { From: '+15125550101', Body: 'Can you come Thursday?', To: '+15125550000', MessageSid: 'SM1' };
  assert(await validTwilioSignature('https://abc.supabase.co/functions/v1/twilio-inbound', inbound, 'vppfRIa0oMHLoRKIupnK/OL2hjI='));
});

Deno.test('Stripe signature', async () => {
  Deno.env.set('STRIPE_WEBHOOK_SECRET', 'whsec_test');
  const payload = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { customer: 'cus_1', status: 'active' } } });
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const sig = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const event = await verifyStripeEvent(payload, `t=${t},v1=${sig}`);
  assertEquals(event.data.object.status, 'active');
  let threw = false;
  try { await verifyStripeEvent(payload.replace('active', 'canceled'), `t=${t},v1=${sig}`); } catch { threw = true; }
  assert(threw);
});
