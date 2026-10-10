-- PawPin: flagging a report. The flags table, who may add to it, and admins-only reading are
-- from 0001. This adds what the app's flag button leans on.

-- One flag per user per report. A second try is refused, and the app says "already flagged".
create unique index flags_one_per_user_idx on public.flags (report_id, flagged_by);

-- A reason is one of the app's short choices, never empty and never an essay.
alter table public.flags
  add constraint flags_reason_check check (char_length(reason) between 1 and 100);

-- Nobody flags their own report. A reporter who thinks it is wrong can close it.
alter policy "Signed-in users can flag a report"
  on public.flags
  with check (
    flagged_by = (select auth.uid())
    and not exists (
      select 1 from public.reports r
      where r.id = report_id and r.reporter_id = (select auth.uid())
    )
  );
