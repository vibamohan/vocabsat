alter type public.question_type
add value if not exists 'typed_reverse_recall';

alter table public.study_session_words
add column if not exists satisfied_typed_reverse_recall boolean not null default false;

update public.study_session_words
set satisfied_typed_reverse_recall = true
where status = 'recall_ready'
  and satisfied_typed_reverse_recall = false;
