// Twilio "A message comes in" webhook.
// - STOP-type keywords: remember the opt-out and stop all texts to that number.
// - START-type keywords: remove the opt-out.
// - Anything else: it's a reply to the latest quote sent to that number. Stop follow-ups,
//   show it in the app and text the business owner.
import { notifyOwner, validTwilioSignature } from '../_shared/sms.ts';
import { adminClient, env, normalizePhone } from '../_shared/util.ts';

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
const START_WORDS = ['START', 'UNSTOP', 'YES START'];

const twiml = (status = 200) =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // Twilio signs the exact URL configured in its console.
  const webhookUrl =
    env('TWILIO_WEBHOOK_URL', false) || `${env('SUPABASE_URL')}/functions/v1/twilio-inbound`;
  const ok = await validTwilioSignature(webhookUrl, params, req.headers.get('X-Twilio-Signature') ?? '');
  if (!ok) {
    console.warn('Rejected inbound SMS with bad signature');
    return new Response('Forbidden', { status: 403 });
  }

  const from = normalizePhone(params.From ?? '');
  const text = (params.Body ?? '').trim();
  if (!from) return twiml();

  const admin = adminClient();
  const keyword = text.toUpperCase().replace(/[^A-Z ]/g, '').trim();
  const now = new Date().toISOString();

  if (STOP_WORDS.includes(keyword)) {
    await admin.from('sms_opt_outs').upsert({ phone: from });
    await admin
      .from('quotes')
      .update({ opted_out: true, unread: true, last_event: 'Customer replied STOP (no more texts)', last_event_at: now })
      .eq('customer_phone', from)
      .eq('opted_out', false);
    return twiml(); // Twilio sends the carrier-required STOP confirmation itself.
  }

  if (START_WORDS.includes(keyword)) {
    await admin.from('sms_opt_outs').delete().eq('phone', from);
    await admin.from('quotes').update({ opted_out: false }).eq('customer_phone', from);
    return twiml();
  }

  // A normal reply: attach it to the most recent quote sent to this number.
  const { data: quote } = await admin
    .from('quotes')
    .select('id, user_id, customer_name, job, profiles(phone)')
    .eq('customer_phone', from)
    .not('sent_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!quote) return twiml();

  const snippet = text.length > 120 ? `${text.slice(0, 117)}...` : text;

  await admin.from('messages').insert({
    quote_id: quote.id,
    user_id: quote.user_id,
    direction: 'in',
    kind: 'reply',
    body: text || '(empty message)',
    status: 'received',
  });

  // Setting replied_at stops all further follow-ups for this quote.
  const { data: current } = await admin.from('quotes').select('replied_at').eq('id', quote.id).single();
  await admin
    .from('quotes')
    .update({
      replied_at: current?.replied_at ?? now,
      unread: true,
      last_event: `Customer texted: “${snippet}”`,
      last_event_at: now,
    })
    .eq('id', quote.id);

  await notifyOwner(
    admin,
    (quote as any).profiles?.phone ?? '',
    `Booked: ${quote.customer_name} texted back about ${quote.job}: "${snippet}" Reply to them at ${from}.`,
  );

  return twiml();
});
