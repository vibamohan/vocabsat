alter table public.study_sessions
add column if not exists session_type text not null default 'daily';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.study_sessions'::regclass
      and conname = 'study_sessions_session_type_check'
  ) then
    alter table public.study_sessions
    add constraint study_sessions_session_type_check
    check (session_type in ('daily', 'forever_review'));
  end if;
end
$$;

do $$
declare
  old_constraint_name text;
begin
  select constraint_name
  into old_constraint_name
  from (
    select
      c.conname as constraint_name,
      array_agg(a.attname::text order by cols.ordinality) as column_names
    from pg_constraint c
    join unnest(c.conkey) with ordinality as cols(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = cols.attnum
    where c.conrelid = 'public.study_sessions'::regclass
      and c.contype = 'u'
    group by c.conname
  ) constraints
  where column_names = array['user_id', 'study_date'];

  if old_constraint_name is not null then
    execute format(
      'alter table public.study_sessions drop constraint %I',
      old_constraint_name
    );
  end if;
end
$$;

create unique index if not exists study_sessions_user_date_type_key
on public.study_sessions (user_id, study_date, session_type);
