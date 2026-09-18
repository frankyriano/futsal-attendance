-- Run once in the Supabase SQL Editor. No sample data is inserted.
begin;

create table public.members (
  id uuid primary key,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key,
  date date not null,
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
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.created_at, m.id) from public.members m), '[]'::jsonb),
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
commit;
