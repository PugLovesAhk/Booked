-- Booked: core schema
-- One database for users and quotes, shared by every device.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles (one per business owner account)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  business_name       text not null default '',
  phone               text not null default '',
  followup_template   text not null default
    'Hi {name}, just checking in on your quote from {business} for {job}: ${price}. Tap to view: {link}',
  followup_days       int[] not null default '{2,5,10}',
  trial_ends_at       timestamptz not null default (now() + interval '30 days'),
  stripe_customer_id  text unique,
  subscription_status text,
  created_at          timestamptz not null default now(),
  constraint followup_days_valid check (
    coalesce(array_length(followup_days, 1), 0) <= 5
    and 0 < all (followup_days) and 60 >= all (followup_days)
  ),
  constraint followup_template_len check (char_length(followup_template) between 1 and 600)
);

alter table public.profiles enable row level security;

create policy "Owners read their profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Owners update their profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Owners may only edit these columns; trial and billing fields are server-only.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (business_name, phone, followup_template, followup_days) on public.profiles to authenticated;

-- Create a profile automatically at signup from the signup form's metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, business_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'business_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  token            text not null unique default encode(extensions.gen_random_bytes(8), 'hex'),
  customer_name    text not null check (char_length(customer_name) between 1 and 100),
  customer_phone   text not null check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  job              text not null check (char_length(job) between 1 and 300),
  price_cents      integer not null check (price_cents >= 0 and price_cents < 100000000),
  status           text not null default 'waiting' check (status in ('waiting', 'booked', 'declined')),
  sent_at          timestamptz,          -- first text delivered to Twilio
  followups_sent   integer not null default 0,
  last_followup_at timestamptz,
  replied_at       timestamptz,          -- customer texted back (stops follow-ups)
  responded_at     timestamptz,          -- customer tapped Yes / No
  booked_at        timestamptz,
  opted_out        boolean not null default false,
  unread           boolean not null default false,  -- new customer activity the owner hasn't opened
  last_event       text,
  last_event_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index quotes_user_created_idx on public.quotes (user_id, created_at desc);
create index quotes_phone_idx on public.quotes (customer_phone, created_at desc);
create index quotes_followup_idx on public.quotes (sent_at) where status = 'waiting' and replied_at is null and not opted_out;

alter table public.quotes enable row level security;

create policy "Owners read their quotes" on public.quotes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners update their quotes" on public.quotes
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their quotes" on public.quotes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Quotes are created by the create-quote Edge Function (it checks billing and sends the text).
revoke insert, update, delete, truncate on public.quotes from anon, authenticated;
grant select, delete on public.quotes to authenticated;
grant update (status, unread) on public.quotes to authenticated;

-- Keep booked_at / updated_at correct no matter who changes the status.
create or replace function public.quotes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'booked' and (tg_op = 'INSERT' or old.status is distinct from 'booked') then
    new.booked_at := now();
  elsif new.status <> 'booked' then
    new.booked_at := null;
  end if;
  return new;
end;
$$;

create trigger quotes_touch
  before insert or update on public.quotes
  for each row execute function public.quotes_touch();

-- ---------------------------------------------------------------------------
-- Text message log (shown as a timeline on each quote)
-- ---------------------------------------------------------------------------
create table public.messages (
  id         bigint generated always as identity primary key,
  quote_id   uuid not null references public.quotes (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  direction  text not null check (direction in ('out', 'in')),
  kind       text not null check (kind in ('quote', 'followup', 'reply')),
  body       text not null,
  status     text not null default 'sent',
  created_at timestamptz not null default now()
);

create index messages_quote_idx on public.messages (quote_id, created_at);

alter table public.messages enable row level security;
create policy "Owners read their messages" on public.messages
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Phone numbers that replied STOP. Server-only.
-- ---------------------------------------------------------------------------
create table public.sms_opt_outs (
  phone      text primary key,
  created_at timestamptz not null default now()
);
alter table public.sms_opt_outs enable row level security;
revoke all on public.sms_opt_outs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Follow-ups that are due now (used by the send-followups Edge Function).
-- ---------------------------------------------------------------------------
create or replace function public.due_followups(max_rows integer default 200)
returns table (quote_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id
  from public.quotes q
  join public.profiles p on p.id = q.user_id
  where q.status = 'waiting'
    and q.replied_at is null
    and q.responded_at is null
    and not q.opted_out
    and q.sent_at is not null
    and q.followups_sent < coalesce(array_length(p.followup_days, 1), 0)
    and q.sent_at + make_interval(days => p.followup_days[q.followups_sent + 1]) <= now()
    -- never more than one follow-up per day, even if the owner shortened the schedule
    and (q.last_followup_at is null or q.last_followup_at < now() - interval '20 hours')
  order by q.sent_at
  limit max_rows;
$$;

revoke execute on function public.due_followups(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: changes show up on every device right away.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.quotes, public.messages, public.profiles;
