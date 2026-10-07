-- PawPin: a place for report photos, one folder per user.
-- The bucket is public, so anyone holding a photo's link can open it. Adding and replacing files
-- is limited to the signed-in user's own folder, which is named after their user id.

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true);

create policy "Users can add photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Update and select let a retry send the same file again without making a second copy.
create policy "Users can replace photos in their own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can view photos in their own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
