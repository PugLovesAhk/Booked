// Public quote page API (no login; the unguessable token in the link is the key).
// GET  ?t=TOKEN                    -> what the customer sees
// POST { t: TOKEN, answer: 'yes' | 'no' }
import { notifyOwner } from '../_shared/sms.ts';
import { adminClient, corsHeaders, formatPrice, json } from '../_shared/util.ts';

const TOKEN_RE = /^[a-f0-9]{16}$/;

async function load(token: string) {
  const admin = adminClient();
  const { data } = await admin
    .from('quotes')
    .select('id, user_id, customer_name, customer_phone, job, price_cents, status, created_at, profiles(business_name, phone)')
    .eq('token', token)
    .maybeSingle();
  return { admin, quote: data as any };
}

function view(q: any) {
  return {
    business_name: q.profiles?.business_name ?? '',
    business_phone: q.profiles?.phone ?? '',
    customer_name: q.customer_name,
    job: q.job,
    price_cents: q.price_cents,
    status: q.status,
    created_at: q.created_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('t') ?? '';
      if (!TOKEN_RE.test(token)) return json({ error: 'Quote not found' }, 404);
      const { quote } = await load(token);
      if (!quote) return json({ error: 'Quote not found' }, 404);
      return json(view(quote));
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const token = String(body.t ?? '');
      const answer = body.answer;
      if (!TOKEN_RE.test(token) || (answer !== 'yes' && answer !== 'no')) return json({ error: 'Bad request' }, 400);

      const { admin, quote } = await load(token);
      if (!quote) return json({ error: 'Quote not found' }, 404);

      // Already answered (or the owner already closed it): just show the current state.
      if (quote.status !== 'waiting') return json(view(quote));

      const status = answer === 'yes' ? 'booked' : 'declined';
      const now = new Date().toISOString();
      const event = answer === 'yes' ? 'Customer tapped “Yes, book it”' : 'Customer tapped “No thanks”';

      // Only flip it if it's still waiting (protects against double taps).
      const { data: updated } = await admin
        .from('quotes')
        .update({ status, responded_at: now, unread: true, last_event: event, last_event_at: now })
        .eq('id', quote.id)
        .eq('status', 'waiting')
        .select('id')
        .maybeSingle();

      if (updated) {
        const price = `$${formatPrice(quote.price_cents)}`;
        const msg =
          answer === 'yes'
            ? `Booked! ${quote.customer_name} said YES to your quote for ${quote.job} (${price}). Call them: ${quote.customer_phone}`
            : `Booked update: ${quote.customer_name} said no thanks to your quote for ${quote.job} (${price}).`;
        await notifyOwner(admin, quote.profiles?.phone ?? '', msg);
      }

      return json(view({ ...quote, status }));
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
