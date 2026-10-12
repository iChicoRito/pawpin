-- Scalar envelope keeps PostgREST max-rows from silently truncating a page.
-- Separate page calls are not a snapshot; realtime reconciliation belongs to the client.
create function public.nearby_report_pages(
  lat double precision, lng double precision, radius_m integer,
  page_size integer default 200,
  after_distance_m double precision default null, after_id uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  result jsonb;
  bounded_size integer := least(page_size, 200);
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = '42501'; end if;
  if lat is null or not (lat between -90 and 90) or lng is null or not (lng between -180 and 180)
    or radius_m is null or radius_m < 0 or page_size is null or page_size < 1
    or (after_distance_m is null) <> (after_id is null)
    or (after_distance_m is not null and not (after_distance_m between 0 and 50000)) then
    raise exception 'invalid_nearby_page' using errcode = '22023';
  end if;
  with candidates as (
    select r.id, r.reporter_id,
      extensions.st_y(r.location::extensions.geometry) as latitude,
      extensions.st_x(r.location::extensions.geometry) as longitude,
      r.location_accuracy_m, r.landmark, r.animal_type, r.size, r.color, r.condition,
      r.urgency, r.description, r.photos, r.status, r.photo_taken_at, r.created_at,
      extensions.st_distance(r.location, here.point) as distance_m, c.rescuer_id
    from public.reports r
    cross join (select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography as point) here
    left join public.claims c on c.report_id = r.id and c.status = 'on_the_way'
    where r.status in ('reported', 'responding')
      and extensions.st_dwithin(r.location, here.point, least(radius_m, 50000))
  ), bounded as materialized (
    select * from candidates
    where after_id is null or (distance_m, id) > (after_distance_m, after_id)
    order by distance_m, id limit bounded_size + 1
  ), page as (
    select * from bounded order by distance_m, id limit bounded_size
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(p) order by distance_m, id) from page p), '[]'::jsonb),
    'next_cursor', case when (select count(*) from bounded) > bounded_size then
      (select jsonb_build_object('distance_m', distance_m, 'id', id)
        from page order by distance_m desc, id desc limit 1)
      else null end
  ) into result;
  return result;
end;
$$;
revoke all on function public.nearby_report_pages(double precision, double precision, integer, integer, double precision, uuid) from public, anon;
grant execute on function public.nearby_report_pages(double precision, double precision, integer, integer, double precision, uuid) to authenticated;
