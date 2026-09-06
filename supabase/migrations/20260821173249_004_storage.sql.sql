/*
# Storage Bucket: worker-photos

## Purpose
Creates a private storage bucket `worker-photos` for uploading worker photos.

## Policies
- Authenticated users can upload, read, update, and delete photos.
- File types validated at the application layer: jpg, jpeg, png, webp.
- Max size 5MB enforced at the application layer.

## Notes
- The bucket is created via insert into storage.buckets.
- Storage policies are created on storage.objects.
*/

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worker-photos',
  'worker-photos',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES: worker-photos
-- ============================================================

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "authenticated_upload_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_upload_worker_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worker-photos');

-- Allow authenticated users to read
DROP POLICY IF EXISTS "authenticated_read_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_read_worker_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'worker-photos');

-- Allow authenticated users to update (replace)
DROP POLICY IF EXISTS "authenticated_update_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_update_worker_photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'worker-photos')
  WITH CHECK (bucket_id = 'worker-photos');

-- Allow authenticated users to delete (remove)
DROP POLICY IF EXISTS "authenticated_delete_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_delete_worker_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'worker-photos');
