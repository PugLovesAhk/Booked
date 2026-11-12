// Stripe billing for the signed-in owner. $39/month, first 30 days free.
// POST { action: 'checkout' } -> { url } Stripe Checkout (card collected, trial carries over)
// POST { action: 'portal' }   -> { url } Stripe customer portal (update card / cancel)
import { stripe } from '../_shared/stripe.ts';
import { adminClient, appUrl as getAppUrl, corsHeaders, env, getUser, json, type Profile } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!env('STRIPE_SECRET_KEY', false) || !env('STRIPE_PRICE_ID', false)) {
    return json({ error: 'Payments aren’t set up yet. Your free trial keeps working in the meantime.' }, 503);
  }

  try {
    const admin = adminClient();
    const user = await getUser(req, admin);
    if (!user) return json({ error: 'Please log in again.' }, 401);

    const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single<Profile>();
    if (!profile) return json({ error: 'Account not found.' }, 404);

    const { action } = await req.json().catch(() => ({}));
    const appUrl = await getAppUrl(admin, req);

    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe('POST', 'customers', {
        email: user.email,
        name: profile.business_name || undefined,
        'metadata[user_id]': user.id,
      });
      customerId = customer.id as string;
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    if (action === 'portal') {
      const session = await stripe('POST', 'billing_portal/sessions', {
        customer: customerId,
        return_url: `${appUrl}/settings`,
      });
      return json({ url: session.url });
    }

    if (action === 'checkout') {
      // Keep whatever is left of the 30-day free trial (Stripe needs at least 48h).
      const trialEnd = Math.floor(new Date(profile.trial_ends_at).getTime() / 1000);
      const useTrial = trialEnd - Date.now() / 1000 > 48 * 3600;

      const session = await stripe('POST', 'checkout/sessions', {
        mode: 'subscription',
        customer: customerId,
        client_reference_id: user.id,
        'line_items[0][price]': env('STRIPE_PRICE_ID'),
        'line_items[0][quantity]': 1,
        'subscription_data[metadata][user_id]': user.id,
        'subscription_data[trial_end]': useTrial ? trialEnd : undefined,
        allow_promotion_codes: true,
        success_url: `${appUrl}/settings?billing=success`,
        cancel_url: `${appUrl}/settings`,
      });
      return json({ url: session.url });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Billing is not available right now. Please try again.' }, 500);
  }
});
