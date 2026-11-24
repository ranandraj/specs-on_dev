-- Barcode support for inventory items.
-- products.barcode already exists in the schema; this only guarantees that
-- assigned barcodes are unique and non-empty.

create unique index if not exists products_barcode_unique
  on products (barcode)
  where barcode is not null and btrim(barcode) <> '';

notify pgrst, 'reload schema';
