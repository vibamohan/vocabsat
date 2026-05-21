alter type public.question_type
add value if not exists 'word_recall';

alter type public.question_type
add value if not exists 'definition_recall';

alter table public.study_session_words
add column if not exists satisfied_word_recall boolean not null default false,
add column if not exists satisfied_definition_recall boolean not null default false;

alter table public.study_question_attempts
add column if not exists answer_mode text not null default 'multiple_choice',
add column if not exists typed_answer text;

alter table public.study_question_attempts
alter column selected_vocab_word_id drop not null;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select
      c.conname,
      c.conrelid::regclass::text as table_name
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in (
        'public.study_session_words'::regclass,
        'public.study_question_attempts'::regclass
      )
      and pg_get_constraintdef(c.oid) like '%question_type%'
  loop
    execute format(
      'alter table %s drop constraint %I',
      constraint_record.table_name,
      constraint_record.conname
    );
  end loop;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.study_question_attempts'::regclass
      and conname = 'study_question_attempts_answer_mode_check'
  ) then
    alter table public.study_question_attempts
    add constraint study_question_attempts_answer_mode_check
    check (answer_mode in ('multiple_choice', 'typed'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.study_question_attempts'::regclass
      and conname = 'study_question_attempts_answer_shape_check'
  ) then
    alter table public.study_question_attempts
    add constraint study_question_attempts_answer_shape_check
    check (
      (
        answer_mode = 'multiple_choice' and
        selected_vocab_word_id is not null and
        typed_answer is null
      ) or (
        answer_mode = 'typed' and
        selected_vocab_word_id is null and
        typed_answer is not null
      )
    );
  end if;
end
$$;
