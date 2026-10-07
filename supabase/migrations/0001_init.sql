-- PawPin Phase 1: the four tables, the profile trigger, and the access rules.
-- Run once in the Supabase SQL Editor.

create extension if not exists postgis with schema extensions;

-- Enums

create type public.user_role as enum ('user', 'rescuer', 'organization', 'admin');
create type public.report_status as enum ('reported', 'responding', 'rescued', 'not_found', 'closed');
create type public.report_urgency as enum ('critical', 'needs_help_soon', 'just_sighted');
create type public.claim_status as enum ('on_the_way', 'arrived', 'cancelled', 'completed');

-- Tables
-- PostGIS points are longitude first, then latitude.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'user',
  notification_radius_m integer not null default 5000,
  last_location extensions.geography(Point, 4326),
  push_token text,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles on delete cascade,
  location extensions.geography(Point, 4326) not null,
  location_accuracy_m real,
  landmark text,
  animal_type text,
  size text,
  color text,
  condition text,
  urgency public.report_urgency not null,
  description text,
  photos text[] not null default '{}',
  status public.report_status not null default 'reported',
  photo_taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_location_idx on public.reports using gist (location);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports on delete cascade,
  rescuer_id uuid not null references public.profiles on delete cascade,
  status public.claim_status not null default 'on_the_way',
  created_at timestamptz not null default now()
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports on delete cascade,
  flagged_by uuid not null references public.profiles on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

-- A profile row for every new login, guest or Google.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Security definer so the flags rule can read the caller's role without recursing into profiles' own rules.

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Grants: signed-out visitors get nothing; signed-in users (guests included) get only what the rules below allow.

revoke all on public.profiles, public.reports, public.claims, public.flags from anon, authenticated;

grant select on public.profiles, public.reports, public.claims, public.flags to authenticated;
grant insert, update on public.reports, public.claims to authenticated;
grant insert on public.flags to authenticated;
-- No update on role: a user must not be able to make themselves an admin.
grant update (display_name, avatar_url, notification_radius_m, last_location, push_token)
  on public.profiles to authenticated;

-- Row Level Security

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.claims enable row level security;
alter table public.flags enable row level security;

create policy "Signed-in users can view profiles"
  on public.profiles for select to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Signed-in users can view reports"
  on public.reports for select to authenticated
  using (true);

create policy "Users can create their own reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Users can update their own reports"
  on public.reports for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create policy "Signed-in users can view claims"
  on public.claims for select to authenticated
  using (true);

-- Guests may not claim (open question Q-05: any Google user may).
create policy "Google users can create their own claims"
  on public.claims for insert to authenticated
  with check (
    rescuer_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy "Google users can update their own claims"
  on public.claims for update to authenticated
  using (
    rescuer_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    rescuer_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy "Signed-in users can flag a report"
  on public.flags for insert to authenticated
  with check (flagged_by = (select auth.uid()));

create policy "Only admins can view flags"
  on public.flags for select to authenticated
  using ((select public.is_admin()));
