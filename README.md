# Booked

**Turn quotes into booked jobs.**

Booked is for small contractors (HVAC, plumbing, landscaping). It texts each price quote to the customer, follows up automatically, and tells the owner the moment the customer answers. It's one web app that works on phones, tablets and computers, and you can install it to a home screen.

| Device | Layout |
| --- | --- |
| Phone (in the truck) | One column, big buttons, bottom tab bar: **Quotes · New Quote · Settings** |
| Tablet (on the job site) | Two columns: quote list on the left, selected quote on the right (portrait and landscape) |
| Computer (office) | Sidebar menu, summary boxes (Waiting, Booked, Declined, $ booked this month), and a sortable, searchable table |

The layout is chosen by screen width **and** input type. A touch tablet in landscape keeps the tablet layout; a laptop with a mouse gets the computer layout.

## How it works

1. **Signup.** The owner enters business name, cell phone, email and password. The 30-day free trial starts right away, with no card needed. Each device stays logged in.
2. **New Quote.** The owner enters customer name, phone, job and price, then taps **Save & Text Quote**.
3. **Text to the customer:** `Hi Maria, here's your quote from Cool Breeze HVAC for AC tune-up: $189. Tap to view: https://…/q/abc123 Reply STOP to stop texts.`
4. **Customer page** at `/q/<token>`. No login needed. It shows the business name, job, price, and two big buttons: **Yes, book it** and **No thanks**.
5. **Follow-ups** go out on day 2, 5 and 10. Owners can change the days and the wording in Settings. They stop as soon as the customer taps a button, texts back, or replies STOP.
6. **Owner alerts.** When the customer taps Yes or No, or texts back, the owner gets a text plus a live pop-up in the app, and the quote is marked with a green dot.
7. **Live dashboard.** Changes show up on every signed-in device right away (Supabase Realtime).
8. **Billing.** $39/month through Stripe Checkout. Any trial days left carry over into Stripe. When the trial ends without payment, the app stops sending quotes and follow-ups until the owner subscribes.

Every text ends with "Reply STOP to stop texts." STOP replies are recorded, and that number gets no more texts.

## Tech

- **Frontend:** React + Vite (TypeScript), hosted on **Cloudflare Pages**. It's an installable PWA (manifest + service worker).
- **Backend:** **Supabase**
  - Postgres stores users (`profiles`), `quotes`, `messages` (text history) and `sms_opt_outs`. Row Level Security limits each owner to their own data.
  - Auth handles email and password.
  - Realtime pushes live updates to every device.
  - Edge Functions (`supabase/functions/`):

    | Function | Called by | What it does |
    | --- | --- | --- |
    | `create-quote` | the app | Checks the trial or subscription, saves the quote, texts the customer |
    | `quote-public` | customer page | Shows the quote and records Yes/No, then alerts the owner |
    | `twilio-inbound` | Twilio webhook | Handles customer replies and STOP/START. Checks Twilio's signature |
    | `send-followups` | pg_cron, every 15 min | Sends follow-ups that are due |
    | `billing` | the app | Opens Stripe Checkout or the billing portal |
    | `stripe-webhook` | Stripe webhook | Keeps the subscription status in sync. Checks Stripe's signature |
  - pg_cron + pg_net run the follow-up job.
- **Texts:** Twilio. **Payments:** Stripe.

```
src/                      React app
  pages/                  AppShell (phone/tablet/desktop), Quotes, New Quote, Settings, Auth, PublicQuote
  components/             QuoteList (cards), QuoteTable (desktop), QuoteDetail, Summary, icons
  lib/                    supabase client, live data + realtime, layout detection, formatting
public/                   manifest, service worker, icons, Cloudflare _redirects/_headers
supabase/migrations/      database schema, security rules, follow-up cron job
supabase/functions/       Edge Functions (Deno)
```

## Setup

You need accounts with **Supabase**, **Cloudflare**, **Twilio** and **Stripe**, plus Node 20+ and the [Supabase CLI](https://supabase.com/docs/guides/cli).

### 1. Supabase

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push                       # creates tables, security rules, cron job
```

In the Supabase SQL editor, store the two values the follow-up cron job needs:

```sql
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('PICK-A-LONG-RANDOM-STRING', 'cron_secret');
```

Set the Edge Function secrets and deploy:

```bash
supabase secrets set \
  APP_URL=https://booked.example.com \
  CRON_SECRET=PICK-A-LONG-RANDOM-STRING \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_FROM_NUMBER=+15125550000 \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_PRICE_ID=price_... \
  STRIPE_WEBHOOK_SECRET=whsec_...

supabase functions deploy            # deploys all six (settings in supabase/config.toml)
```

You can use `TWILIO_MESSAGING_SERVICE_SID=MG...` instead of `TWILIO_FROM_NUMBER`.

Until the Twilio keys are set, quotes still save. Texts are logged instead of sent, and the app shows "Text not sent".

Under **Authentication → URL Configuration**, set **Site URL** to your app URL. Add `https://YOUR-APP/quotes` and `https://YOUR-APP/reset` to the redirect URLs.

### 2. Twilio

- Buy a phone number. For US texting, complete **A2P 10DLC registration** or carriers will block your messages.
- Under the number's **Messaging → A message comes in**, set a webhook (HTTP POST) to
  `https://YOUR-PROJECT-REF.supabase.co/functions/v1/twilio-inbound`
  If you enter a different URL in Twilio, set `TWILIO_WEBHOOK_URL` to that exact URL so the signature check passes.

### 3. Stripe

- Create a product **Booked** with a recurring price of **$39/month**. Put its `price_…` ID in `STRIPE_PRICE_ID`. The 30-day trial is handled by the app, so don't add a trial to the price.
- Add a webhook endpoint `https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook` with these events:
  `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
  Its signing secret goes in `STRIPE_WEBHOOK_SECRET`.
- Turn on the **Customer portal** (Settings → Billing → Customer portal) so owners can update a card or cancel.

### 4. Cloudflare Pages

Connect this repository in Cloudflare Pages:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API; a publishable key works) |

`public/_redirects` sends every route to the app, and `public/_headers` keeps the service worker fresh. Add your custom domain, and set `APP_URL` to the same address so links in texts point to it.

## Local development

```bash
cp .env.example .env.local      # fill in your Supabase URL + key
npm install
npm run dev
```

Checks:

```bash
npm run build                                     # type-check + production build
cd supabase/functions && deno test --config deno.test.json --no-lock --allow-env _shared/
  # ^ phone/price/template helpers, Twilio + Stripe signature checks
```

## Installing on a phone or tablet

- **iPhone / iPad:** open the app in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** tap **Install app** in Settings, or use the browser menu.
- **Computer:** use it in any browser, or install it from Chrome/Edge's address bar.
