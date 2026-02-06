-- Remove public INSERT policy on bank-layouts bucket
DROP POLICY IF EXISTS "Anyone can upload bank layouts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update bank layouts" ON storage.objects;

-- Keep only the SELECT policy for public read access (if it exists)
-- This allows viewing existing layouts but prevents unauthorized uploads