-- Run once in the Supabase SQL Editor. No sample data is inserted.
begin;

create extension if not exists pg_cron;

create table public.members (
  id uuid primary key,
  name text not null check (length(trim(name)) between 1 and 60),
  position bigint not null default 2147483647 check (position >= 0),
  created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key,
  date date not null unique,
  created_at timestamptz not null default now()
);
create table public.answers (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null check (status in ('出席', '欠席', '未回答')),
  include_self boolean not null default true,
  guests text[] not null default '{}',
  note text not null default '' check (length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id),
  check (cardinality(guests) <= 100)
);
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.answers enable row level security;
revoke all on public.members, public.events, public.answers from anon, authenticated;
grant select, insert, update, delete on public.members, public.events, public.answers to service_role;

create function public.get_futsal_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.position, m.created_at, m.id) from public.members m), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'date', e.date,
      'answers', coalesce((select jsonb_object_agg(a.member_id::text, jsonb_build_object(
        'status', a.status, 'includeSelf', a.include_self, 'guests', a.guests,
        'note', a.note, 'updatedAt', a.updated_at
      )) from public.answers a where a.event_id = e.id), '{}'::jsonb)
    ) order by e.date, e.created_at, e.id) from public.events e), '[]'::jsonb)
  );
$$;
revoke all on function public.get_futsal_data() from public, anon, authenticated;
grant execute on function public.get_futsal_data() to service_role;

-- Save the entire order atomically; reject lists made before membership changes.
create or replace function public.reorder_futsal_members(member_ids uuid[]) returns setof uuid
language plpgsql security invoker set search_path = '' as $$
begin
  lock table public.members in share row exclusive mode;
  if member_ids is null or cardinality(member_ids) = 0
    or cardinality(member_ids) <> (select count(*) from public.members)
    or cardinality(member_ids) <> (select count(distinct value) from unnest(member_ids) as value)
    or exists (select 1 from unnest(member_ids) as value where not exists (select 1 from public.members m where m.id = value)) then
    raise exception 'Membership changed' using errcode = '40001';
  end if;
  update public.members m set position = ordered.ordinality - 1
  from unnest(member_ids) with ordinality as ordered(id, ordinality)
  where m.id = ordered.id;
  return query select m.id from public.members m order by m.position;
end;
$$;
revoke all on function public.reorder_futsal_members(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_futsal_members(uuid[]) to service_role;

-- Keep the 30 most recent events before today (Japan time). Older events and
-- their answers are deleted by a database job every three months.
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
commit;
