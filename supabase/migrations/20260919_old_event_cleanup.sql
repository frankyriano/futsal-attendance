-- Existing projects: run once in the Supabase SQL Editor.
-- This immediately removes old events beyond the newest 30 past events, then
-- repeats the cleanup every three months at 03:00 Asia/Tokyo.
begin;

create extension if not exists pg_cron;

create or replace function public.cleanup_old_futsal_events() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  deleted_count integer;
begin
  delete from public.events event
  where event.id in (
    select old_event.id
    from public.events old_event
    where old_event.date < (pg_catalog.now() at time zone 'Asia/Tokyo')::date
    order by old_event.date desc, old_event.created_at desc, old_event.id desc
    offset 30
  );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_old_futsal_events() from public, anon, authenticated;

-- pg_cron uses UTC. Two schedules cover the different month-end dates so the
-- cleanup runs at 03:00 JST on January, April, July, and October 1.
-- Running this migration again updates the jobs with the same names.
select cron.schedule(
  'cleanup-old-futsal-events',
  '0 18 31 3,12 *',
  $cron$select public.cleanup_old_futsal_events();$cron$
);
select cron.schedule(
  'cleanup-old-futsal-events-june-september',
  '0 18 30 6,9 *',
  $cron$select public.cleanup_old_futsal_events();$cron$
);

-- Apply the retention rule immediately instead of waiting for the first run.
select public.cleanup_old_futsal_events();

commit;
