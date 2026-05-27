do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_word_status'
  ) then
    alter type public.user_word_status add value if not exists 'known';
  end if;
end
$$;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid = 'public.user_word_mastery'::regclass
      and pg_get_constraintdef(c.oid) like '%status%'
  loop
    execute format(
      'alter table public.user_word_mastery drop constraint %I',
      constraint_record.conname
    );
  end loop;
end
$$;

do $$
declare
  status_type oid;
begin
  select atttypid
  into status_type
  from pg_attribute
  where attrelid = 'public.user_word_mastery'::regclass
    and attname = 'status'
    and not attisdropped;

  if status_type = to_regtype('public.user_word_status')::oid then
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_word_mastery'::regclass
      and conname = 'user_word_mastery_status_check'
  ) then
    alter table public.user_word_mastery
    add constraint user_word_mastery_status_check
    check (status in ('learning', 'weak', 'recall_ready', 'known'));
  end if;
end
$$;
