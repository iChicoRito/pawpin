-- PawPin: "I'm on my way", giving up, and the outcome.
-- A rescuer does not own the report, so a report's status changes only through the three
-- functions below. They run with the database's rights and check the caller themselves.
-- The app looks for the short messages they raise.

-- One rescuer per report at a time.
create unique index claims_one_active_idx on public.claims (report_id)
  where status = 'on_the_way';

-- Every change to a report counts as activity. The 72-hour closing rule reads updated_at.
create function public.touch_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger on_report_updated
  before update on public.reports
  for each row execute function public.touch_report();

-- Close the direct routes. A reporter may still edit their report's details, but not its status
-- or when it last changed. Claims are written only by the functions below.
revoke update on public.reports from authenticated;
grant update (
  location, location_accuracy_m, landmark, animal_type, size, color, condition, urgency,
  description, photos
) on public.reports to authenticated;

revoke insert, update on public.claims from authenticated;

-- "I'm on my way". Any Google user may claim a report nobody is on the way to; guests may not.
create function public.claim_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'guest_cannot_claim';
  end if;

  -- The update locks the row, so of two claims sent at the same moment only one finds the report
  -- still 'reported'.
  update public.reports set status = 'responding'
  where id = p_report_id and status = 'reported';
  if not found then
    raise exception 'report_not_open';
  end if;

  insert into public.claims (report_id, rescuer_id)
  values (p_report_id, (select auth.uid()));
end;
$$;

-- "I can't make it". The report is open again for another rescuer.
create function public.cancel_claim(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.claims set status = 'cancelled'
  where report_id = p_report_id
    and rescuer_id = (select auth.uid())
    and status = 'on_the_way';
  if not found then
    raise exception 'no_active_claim';
  end if;

  update public.reports set status = 'reported' where id = p_report_id;
end;
$$;

-- The outcome, recorded by the rescuer who is on the way: rescued or not_found.
create function public.resolve_report(p_report_id uuid, p_outcome public.report_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('rescued', 'not_found') then
    raise exception 'bad_outcome';
  end if;

  update public.claims set status = 'completed'
  where report_id = p_report_id
    and rescuer_id = (select auth.uid())
    and status = 'on_the_way';
  if not found then
    raise exception 'no_active_claim';
  end if;

  update public.reports set status = p_outcome where id = p_report_id;
end;
$$;

-- Signed-out visitors may run none of them.
revoke execute on function public.claim_report(uuid) from public, anon;
grant execute on function public.claim_report(uuid) to authenticated;
revoke execute on function public.cancel_claim(uuid) from public, anon;
grant execute on function public.cancel_claim(uuid) to authenticated;
revoke execute on function public.resolve_report(uuid, public.report_status) from public, anon;
grant execute on function public.resolve_report(uuid, public.report_status) to authenticated;

-- The nearby search, as in 0006, with one more column at the end: who is on the way, if anyone.
-- The app needs it to know whether the viewer is that rescuer. A function's returned columns
-- cannot be changed in place, so it is dropped and made again.
drop function public.nearby_reports(double precision, double precision, integer);

create function public.nearby_reports(lat double precision, lng double precision, radius_m integer)
returns table (
  id uuid,
  reporter_id uuid,
  latitude double precision,
  longitude double precision,
  location_accuracy_m real,
  landmark text,
  animal_type text,
  size text,
  color text,
  condition text,
  urgency public.report_urgency,
  description text,
  photos text[],
  status public.report_status,
  photo_taken_at timestamptz,
  created_at timestamptz,
  distance_m double precision,
  rescuer_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- The stored point reaches the app as hex digits, so it is handed back as two plain numbers.
  select
    r.id,
    r.reporter_id,
    extensions.st_y(r.location::extensions.geometry),
    extensions.st_x(r.location::extensions.geometry),
    r.location_accuracy_m,
    r.landmark,
    r.animal_type,
    r.size,
    r.color,
    r.condition,
    r.urgency,
    r.description,
    r.photos,
    r.status,
    r.photo_taken_at,
    r.created_at,
    extensions.st_distance(r.location, here.point),
    c.rescuer_id
  from public.reports r
  -- PostGIS points are longitude first, then latitude.
  cross join (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
      as point
  ) here
  -- At most one row: claims_one_active_idx allows one active claim per report.
  left join public.claims c on c.report_id = r.id and c.status = 'on_the_way'
  -- Active means nobody has finished or closed it. No search reaches past 50 km.
  where r.status in ('reported', 'responding')
    and extensions.st_dwithin(r.location, here.point, least(radius_m, 50000))
  -- Column 17 is distance_m: nearest first.
  order by 17;
$$;

-- Signed-out visitors may not search.
revoke execute on function public.nearby_reports(double precision, double precision, integer)
  from public, anon;
grant execute on function public.nearby_reports(double precision, double precision, integer)
  to authenticated;
