// Stripe webhook: keeps profiles.subscription_status in sync.
// Events: checkout.session.completed, customer.subscription.created/updated/deleted
import { stripe, verifyStripeEvent } from '../_shared/stripe.ts';
import { adminClient, json } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const payload = await req.text();
  let event;
  try {
    event = await verifyStripeEvent(payload, req.headers.get('Stripe-Signature') ?? '');
  } catch (e) {
    console.warn('Stripe webhook rejected:', (e as Error).message);
    return json({ error: 'Invalid signature' }, 400);
  }

  const admin = adminClient();
  const obj = event.data?.object ?? {};

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription' || !obj.client_reference_id) break;
        const sub = obj.subscription ? await stripe('GET', `subscriptions/${obj.subscription}`) : null;
        await admin
          .from('profiles')
          .update({ stripe_customer_id: obj.customer, subscription_status: sub?.status ?? 'active' })
          .eq('id', obj.client_reference_id);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
        await admin.from('profiles').update({ subscription_status: status }).eq('stripe_customer_id', obj.customer);
        break;
      }
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'Webhook handler failed' }, 500);
  }

  return json({ received: true });
});
