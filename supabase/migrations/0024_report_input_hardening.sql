begin;

create function public.validate_report_input()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  end if;

  -- Validate only changed fields on updates so old reports can still be rescued or closed.
  if tg_op = 'INSERT' or new.animal_type is distinct from old.animal_type then
    if new.animal_type is null or btrim(new.animal_type) = '' or char_length(new.animal_type) > 40 then
      raise exception using errcode = '23514', message = 'invalid_report_animal';
    end if;
  end if;
  if tg_op = 'INSERT' or new.color is distinct from old.color then
    if char_length(new.color) > 40 then
      raise exception using errcode = '23514', message = 'invalid_report_color';
    end if;
  end if;
  if tg_op = 'INSERT' or new.landmark is distinct from old.landmark then
    if char_length(new.landmark) > 120 then
      raise exception using errcode = '23514', message = 'invalid_report_landmark';
    end if;
  end if;
  if tg_op = 'INSERT' or new.size is distinct from old.size then
    if new.size is not null and new.size not in ('small', 'medium', 'large') then
      raise exception using errcode = '23514', message = 'invalid_report_size';
    end if;
  end if;
  if tg_op = 'INSERT' or new.condition is distinct from old.condition then
    if new.condition is not null and new.condition not in ('injured', 'sick', 'healthy') then
      raise exception using errcode = '23514', message = 'invalid_report_condition';
    end if;
  end if;
  if tg_op = 'INSERT' or new.photos is distinct from old.photos then
    if new.photos is null or cardinality(new.photos) not between 1 and 3
      or array_ndims(new.photos) <> 1 or exists (
        select 1 from unnest(new.photos) photo where photo is null or btrim(photo) = ''
      ) then
      raise exception using errcode = '23514', message = 'invalid_report_photos';
    end if;
  end if;
  if tg_op = 'INSERT' or new.location_accuracy_m is distinct from old.location_accuracy_m then
    if new.location_accuracy_m is not null and not (
      new.location_accuracy_m >= 0 and new.location_accuracy_m < 'Infinity'::real
    ) then
      raise exception using errcode = '23514', message = 'invalid_report_accuracy';
    end if;
  end if;
  if tg_op = 'INSERT' or new.location is distinct from old.location then
    if new.location is null or extensions.st_isempty(new.location::extensions.geometry)
      or not (extensions.st_x(new.location::extensions.geometry) between -180 and 180)
      or not (extensions.st_y(new.location::extensions.geometry) between -90 and 90) then
      raise exception using errcode = '23514', message = 'invalid_report_location';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_report_input() from public, anon, authenticated;
create trigger on_report_input
before insert or update on public.reports
for each row execute function public.validate_report_input();

commit;
