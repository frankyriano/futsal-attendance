-- Existing projects: run in the Supabase SQL Editor.
-- Duplicate dates are merged into the earliest-created event. For each member,
-- the most recently updated answer is preserved.
begin;

lock table public.events in share row exclusive mode;
lock table public.answers in share row exclusive mode;

create temporary table event_date_merge on commit drop as
with ranked as (
  select
    id as event_id,
    first_value(id) over (partition by date order by created_at, id) as canonical_id,
    count(*) over (partition by date) as event_count
  from public.events
)
select event_id, canonical_id
from ranked
where event_count > 1;

insert into public.answers (
  event_id, member_id, status, include_self, guests, note, updated_at
)
select distinct on (merge.canonical_id, answer.member_id)
  merge.canonical_id,
  answer.member_id,
  answer.status,
  answer.include_self,
  answer.guests,
  answer.note,
  answer.updated_at
from public.answers answer
join event_date_merge merge on merge.event_id = answer.event_id
order by merge.canonical_id, answer.member_id, answer.updated_at desc, answer.event_id
on conflict (event_id, member_id) do update set
  status = excluded.status,
  include_self = excluded.include_self,
  guests = excluded.guests,
  note = excluded.note,
  updated_at = excluded.updated_at
where excluded.updated_at >= public.answers.updated_at;

delete from public.events event
using event_date_merge merge
where event.id = merge.event_id
  and merge.event_id <> merge.canonical_id;

create unique index if not exists events_date_unique_idx on public.events (date);

commit;
