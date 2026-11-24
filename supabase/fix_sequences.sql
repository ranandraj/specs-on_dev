-- Fix ID sequences after importing data with explicit IDs.
-- Without this, new rows try id=1 and fail with a duplicate-key (409) error.
-- Safe to run repeatedly; it sets each sequence to the current max(id).
--
-- Run in Supabase Dashboard -> SQL Editor (or via any Postgres client).

SELECT setval(pg_get_serial_sequence('public.products','id'), (SELECT max(id) FROM public.products), true)
WHERE pg_get_serial_sequence('public.products','id') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.categories','id'), (SELECT max(id) FROM public.categories), true)
WHERE pg_get_serial_sequence('public.categories','id') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.lens_addons','id'), (SELECT max(id) FROM public.lens_addons), true)
WHERE pg_get_serial_sequence('public.lens_addons','id') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.coupons','id'), (SELECT max(id) FROM public.coupons), true)
WHERE pg_get_serial_sequence('public.coupons','id') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.expenses','id'), (SELECT max(id) FROM public.expenses), true)
WHERE pg_get_serial_sequence('public.expenses','id') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.expense_categories','id'), (SELECT max(id) FROM public.expense_categories), true)
WHERE pg_get_serial_sequence('public.expense_categories','id') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.store_settings','id'), (SELECT max(id) FROM public.store_settings), true)
WHERE pg_get_serial_sequence('public.store_settings','id') IS NOT NULL;
