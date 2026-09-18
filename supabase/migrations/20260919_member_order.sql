-- Existing projects: run in the Supabase SQL Editor. Preserves members and answers.
begin;
alter table public.members add column if not exists position bigint not null default 2147483647 check (position >= 0);

create or replace function public.get_futsal_data() returns jsonb
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

commit;
