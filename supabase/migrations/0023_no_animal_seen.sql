-- PawPin: the phone's photo check saw no animal in any of this report's photos, and the
-- reporter sent it anyway. Set by the app when the report is sent. Not in the list of columns
-- a reporter may update (0007), so it cannot be changed afterwards. Not secret: any signed-in
-- user may read it. Only the admin's screens show it.
alter table public.reports add column no_animal_seen boolean not null default false;
