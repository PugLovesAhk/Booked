// Creates a quote and texts it to the customer.
// POST { customer_name, customer_phone, job, price }   -> new quote
// POST { resend_id }                                   -> re-send the first text for an existing quote
import { sendSms } from '../_shared/sms.ts';
import {
  adminClient,
  corsHeaders,
  firstName,
  formatPrice,
  getUser,
  hasAccess,
  json,
  normalizePhone,
  quoteLink,
  type Profile,
  withOptOut,
} from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const admin = adminClient();
    const user = await getUser(req, admin);
    if (!user) return json({ error: 'Please log in again.' }, 401);

    const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single<Profile>();
    if (!profile) return json({ error: 'Account not found.' }, 404);
    if (!hasAccess(profile)) {
      return json({ error: 'Your free trial has ended. Add a payment method in Settings to keep sending quotes.', code: 'payment_required' }, 402);
    }

    const body = await req.json().catch(() => ({}));
    let quote;

    if (body.resend_id) {
      const { data } = await admin.from('quotes').select('*').eq('id', body.resend_id).eq('user_id', user.id).single();
      if (!data) return json({ error: 'Quote not found.' }, 404);
      quote = data;
    } else {
      const customer_name = String(body.customer_name ?? '').trim().slice(0, 100);
      const job = String(body.job ?? '').trim().slice(0, 300);
      const customer_phone = normalizePhone(String(body.customer_phone ?? ''));
      const price = Number(body.price);

      if (!customer_name) return json({ error: 'Add the customer name.' }, 400);
      if (!customer_phone) return json({ error: 'That phone number doesn’t look right.' }, 400);
      if (!job) return json({ error: 'Add a short job description.' }, 400);
      if (!Number.isFinite(price) || price < 0 || price >= 1_000_000) return json({ error: 'Enter a valid price.' }, 400);

      const { data, error } = await admin
        .from('quotes')
        .insert({ user_id: user.id, customer_name, customer_phone, job, price_cents: Math.round(price * 100) })
        .select()
        .single();
      if (error) throw error;
      quote = data;
    }

    const text =
      `Hi ${firstName(quote.customer_name)}, here's your quote from ${profile.business_name || 'us'} ` +
      `for ${quote.job}: $${formatPrice(quote.price_cents)}. Tap to view: ${quoteLink(quote.token)}`;

    const sms = await sendSms(admin, quote.customer_phone, text);
    const now = new Date().toISOString();

    await admin.from('messages').insert({
      quote_id: quote.id,
      user_id: user.id,
      direction: 'out',
      kind: 'quote',
      body: withOptOut(text),
      status: sms.status,
    });

    const patch: Record<string, unknown> = sms.ok
      ? { sent_at: quote.sent_at ?? now, last_event: 'Quote texted to customer', last_event_at: now }
      : {
          last_event: `Text not sent: ${sms.error}`,
          last_event_at: now,
          opted_out: sms.status === 'opted_out',
        };
    const { data: updated } = await admin.from('quotes').update(patch).eq('id', quote.id).select().single();

    return json({ quote: updated ?? quote, sms });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong saving the quote. Please try again.' }, 500);
  }
});
