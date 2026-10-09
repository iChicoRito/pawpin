-- PawPin: one report by its id, whatever its status and however far away. The report page uses it
-- when an alert is tapped: that report may be outside the viewer's search distance, or finished.
-- Same columns, in the same order, as nearby_reports (0007), so the app reads both the same way.
-- It runs with the caller's own rights, so the access rules on reports still decide what is seen.

create function public.report_by_id(
  p_id uuid,
  lat double precision default null,
  lng double precision default null
)
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
    -- No place to measure from gives no distance: the point is null, and so is the answer.
    -- PostGIS points are longitude first, then latitude.
    extensions.st_distance(
      r.location,
      extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
    ),
    c.rescuer_id
  from public.reports r
  -- At most one row: claims_one_active_idx allows one active claim per report.
  left join public.claims c on c.report_id = r.id and c.status = 'on_the_way'
  where r.id = p_id;
$$;

-- Signed-out visitors may not read a report.
revoke execute on function public.report_by_id(uuid, double precision, double precision)
  from public, anon;
grant execute on function public.report_by_id(uuid, double precision, double precision)
  to authenticated;
