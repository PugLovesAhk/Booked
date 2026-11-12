-- Server-only app settings + the follow-up job (every 15 minutes).
--
-- After this runs, set two values (SQL editor):
--   update private.app_settings set value = 'https://YOUR-PROJECT-REF.supabase.co' where key = 'project_url';
--   update private.app_settings set value = 'https://your-app-domain' where key = 'app_url';
-- cron_secret is generated automatically.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_settings (
  key   text primary key,
  value text not null
);

insert into private.app_settings (key, value) values
  ('project_url', ''),
  ('app_url', ''),
  ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Edge Functions (service role) read settings through this; nobody else can call it.
create or replace function public.app_setting(setting_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.app_settings where key = setting_key;
$$;
revoke execute on function public.app_setting(text) from public, anon, authenticated;
grant execute on function public.app_setting(text) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'booked-send-followups',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := (select value from private.app_settings where key = 'project_url') || '/functions/v1/send-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from private.app_settings where key = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where (select value from private.app_settings where key = 'project_url') <> '';
  $$
);
