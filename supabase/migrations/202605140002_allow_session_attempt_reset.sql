drop policy if exists "Users can delete own attempts" on public.study_question_attempts;
create policy "Users can delete own attempts"
on public.study_question_attempts
for delete
to authenticated
using (user_id = (select auth.uid()));
