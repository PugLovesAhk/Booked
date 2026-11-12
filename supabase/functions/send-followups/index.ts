// Sends the day-2 / day-5 / day-10 (configurable) follow-up texts.
// Called every 15 minutes by pg_cron with the x-cron-secret header.
import { sendSms, timingSafeEqual } from '../_shared/sms.ts';
import {
  adminClient,
  fillTemplate,
  firstName,
  formatPrice,
  hasAccess,
  json,
  quoteLink,
  appUrl,
  setting,
  type Profile,
  withOptOut,
} from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = adminClient();
  const secret = await setting(admin, 'CRON_SECRET', 'cron_secret');
  if (!secret || !timingSafeEqual(req.headers.get('x-cron-secret') ?? '', secret)) {
    return json({ error: 'Forbidden' }, 403);
  }
  let base: string;
  try {
    base = await appUrl(admin);
  } catch {
    // Links in follow-ups need the app's address; wait until it's configured.
    return json({ skipped: 'app_url not set in private.app_settings' });
  }
  const { data: due, error } = await admin.rpc('due_followups', { max_rows: 200 });
  if (error) {
    console.error(error);
    return json({ error: error.message }, 500);
  }

  let sent = 0;
  let skipped = 0;
  const profiles = new Map<string, Profile>();

  for (const { quote_id } of (due ?? []) as { quote_id: string }[]) {
    const { data: q } = await admin.from('quotes').select('*').eq('id', quote_id).single();
    if (!q) continue;

    let profile = profiles.get(q.user_id);
    if (!profile) {
      const { data } = await admin.from('profiles').select('*').eq('id', q.user_id).single<Profile>();
      if (!data) continue;
      profile = data;
      profiles.set(q.user_id, data);
    }
    if (!hasAccess(profile)) {
      skipped++;
      continue;
    }

    // Claim this follow-up atomically so overlapping runs can't double-send.
    const now = new Date().toISOString();
    const { data: claimed } = await admin
      .from('quotes')
      .update({ followups_sent: q.followups_sent + 1, last_followup_at: now })
      .eq('id', q.id)
      .eq('followups_sent', q.followups_sent)
      .eq('status', 'waiting')
      .is('replied_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    const text = fillTemplate(profile.followup_template, {
      name: firstName(q.customer_name),
      business: profile.business_name || 'us',
      job: q.job,
      price: formatPrice(q.price_cents),
      link: quoteLink(base, q.token),
    });
    const sms = await sendSms(admin, q.customer_phone, text);

    await admin.from('messages').insert({
      quote_id: q.id,
      user_id: q.user_id,
      direction: 'out',
      kind: 'followup',
      body: withOptOut(text),
      status: sms.status,
    });
    await admin
      .from('quotes')
      .update({
        last_event: sms.ok ? `Follow-up #${q.followups_sent + 1} sent` : `Follow-up not sent: ${sms.error}`,
        last_event_at: now,
        ...(sms.status === 'opted_out' ? { opted_out: true } : {}),
      })
      .eq('id', q.id);

    if (sms.ok) sent++;
    else skipped++;
  }

  return json({ due: due?.length ?? 0, sent, skipped });
});
