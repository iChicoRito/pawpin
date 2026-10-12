-- Retained from rollback-only 12,000-row plans; see phase-8-query-plans.json.
-- Prepare only. Apply each index with an approved low-impact deployment window.
create index reports_reporter_history_idx on public.reports (reporter_id, created_at desc, id desc);
create index flags_user_created_idx on public.flags (flagged_by, created_at);
create index claims_completed_rescuer_idx on public.claims (rescuer_id, report_id) where status = 'completed';
-- profiles(push_token) was not used on either fixture; no speculative index retained.
