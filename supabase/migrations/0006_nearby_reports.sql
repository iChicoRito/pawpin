-- PawPin: the nearby search. Hands back the active reports within a distance of a place, nearest
-- first. The Map and the List both read from this.
-- It runs with the caller's own rights, so the access rules on reports still decide what is seen.

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
  distance_m double precision
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
    extensions.st_distance(r.location, here.point)
  from public.reports r
  -- PostGIS points are longitude first, then latitude.
  cross join (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
      as point
  ) here
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
