-- Run the follow-up sender every 15 minutes.
--
-- Before this works, store two secrets in Supabase Vault (SQL editor):
--   select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
--   select vault.create_secret('the-same-value-as-CRON_SECRET', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'booked-send-followups',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/send-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
