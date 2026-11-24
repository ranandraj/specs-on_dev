-- Run this in the Supabase Dashboard -> SQL Editor for the new project.
-- The direct Postgres connection role is not the owner of storage.objects,
-- so these policies can only be created with Dashboard/SQL-Editor privileges.
-- Safe to run more than once.

DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public read invoice files') THEN
    CREATE POLICY "public read invoice files" ON storage.objects
      FOR SELECT TO public USING (bucket_id = 'invoices');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='anon upload invoice files') THEN
    CREATE POLICY "anon upload invoice files" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'invoices');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='anon update invoice files') THEN
    CREATE POLICY "anon update invoice files" ON storage.objects
      FOR UPDATE TO anon, authenticated
      USING (bucket_id = 'invoices') WITH CHECK (bucket_id = 'invoices');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public read product images') THEN
    CREATE POLICY "public read product images" ON storage.objects
      FOR SELECT TO public USING (bucket_id = 'product-images');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='anon upload product images') THEN
    CREATE POLICY "anon upload product images" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'product-images');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='anon update product images') THEN
    CREATE POLICY "anon update product images" ON storage.objects
      FOR UPDATE TO anon, authenticated
      USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');
  END IF;
END
$policy$;
