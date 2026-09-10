-- Care Companion: scheduled jobs
--
-- Requires the pg_cron and pg_net extensions (enable them in Dashboard > Database > Extensions
-- or leave these statements in place; they are no-ops if already enabled).
--
-- The nightly summary calls the generate-daily-summary Edge Function. Set these two values
-- once per project in the Vault so the cron job can find and authenticate the function:
--   select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'project_url');
--   select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Safety net: expire requests the agent failed to close.
select cron.schedule(
  'expire-stale-contact-requests',
  '* * * * *',
  $$ select public.expire_stale_contact_requests(); $$
);

-- Nightly summaries at 20:00 Australia/Sydney. pg_cron runs in UTC; 20:00 AEST is 10:00 UTC
-- and 20:00 AEDT is 09:00 UTC. Running at both is safe: the function skips days already summarised.
create or replace function public.invoke_daily_summary()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise notice 'invoke_daily_summary: vault secrets project_url / service_role_key not set; skipping';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/generate-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

select cron.schedule('daily-summary-aest', '0 10 * * *', $$ select public.invoke_daily_summary(); $$);
select cron.schedule('daily-summary-aedt', '0 9 * * *', $$ select public.invoke_daily_summary(); $$);
