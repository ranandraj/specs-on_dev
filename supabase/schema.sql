-- Generated from the production data shape. Safe to re-run.
CREATE TABLE IF NOT EXISTS "advance_order_payments" (
  "id" uuid PRIMARY KEY,
  "advance_order_id" uuid,
  "payment_type" text,
  "amount" numeric,
  "payment_method" text,
  "remarks" text,
  "received_by" uuid,
  "received_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "advance_order_timeline" (
  "id" bigint PRIMARY KEY,
  "advance_order_id" uuid,
  "event_type" text,
  "label" text,
  "remarks" text,
  "created_by" uuid,
  "created_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "advance_orders" (
  "id" uuid PRIMARY KEY,
  "deposit_id" text,
  "customer_name" text,
  "phone" text,
  "address" text,
  "product_name" text,
  "products" jsonb,
  "category" text,
  "description" text,
  "total_amount" numeric,
  "deposit_amount" numeric,
  "remaining_balance" numeric,
  "expected_delivery_date" date,
  "status" text,
  "remarks" text,
  "created_by" uuid,
  "created_by_name" text,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "completed_at" timestamptz,
  "completed_order_id" uuid,
  "invoice_number" text,
  "final_payment_method" text,
  "reference_number" text
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" bigint PRIMARY KEY,
  "name_en" text,
  "name_ta" text,
  "is_active" boolean,
  "sort_order" integer,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "is_manual_entry" boolean
);

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" bigint PRIMARY KEY,
  "code" text,
  "percentage" numeric,
  "is_active" boolean,
  "expiry_date" date,
  "usage_limit" integer,
  "usage_count" integer,
  "min_order_value" numeric,
  "created_at" timestamptz,
  "updated_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "expense_categories" (
  "id" bigint PRIMARY KEY,
  "name" text,
  "is_active" boolean,
  "created_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" bigint PRIMARY KEY,
  "category_id" bigint,
  "amount" numeric,
  "expense_date" date,
  "description" text,
  "receipt_url" text,
  "created_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "lens_addons" (
  "id" bigint PRIMARY KEY,
  "name" text,
  "price" numeric,
  "is_active" boolean,
  "created_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" bigint PRIMARY KEY,
  "order_id" uuid,
  "product_id" bigint,
  "variant_id" bigint,
  "product_name" text,
  "name" text,
  "product_tamil_name" text,
  "tamil_name" text,
  "quantity" numeric,
  "unit" text,
  "unit_type" text,
  "base_quantity" numeric,
  "base_price" numeric,
  "line_total" numeric,
  "image_url" text,
  "is_manual" boolean,
  "discount" numeric,
  "gst_amount" numeric,
  "gst_rate" numeric,
  "created_at" timestamptz,
  "variant_name" text,
  "unit_price" numeric,
  "source" text,
  "note" text,
  "category" text
);

CREATE TABLE IF NOT EXISTS "orders" (
  "id" uuid PRIMARY KEY,
  "invoice_no" text,
  "user_id" uuid,
  "customer_name" text,
  "phone" text,
  "address" text,
  "items" jsonb,
  "subtotal" numeric,
  "shipping" numeric,
  "total" numeric,
  "status" text,
  "order_mode" text,
  "order_type" text,
  "delivery_charge" numeric,
  "discount_amount" numeric,
  "manual_discount_amount" numeric,
  "manual_discount_type" text,
  "manual_discount_value" numeric,
  "coupon_code" text,
  "coupon_percentage" numeric,
  "total_gst" numeric,
  "gst_amount" numeric,
  "gst_enabled" boolean,
  "payment_method" text,
  "payment_mode" text,
  "split_details" jsonb,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "remarks" text,
  "reference_number" text,
  "billing_date" timestamptz,
  "eye_prescription" jsonb,
  "invoice_pdf_url" text
);

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" bigint PRIMARY KEY,
  "product_id" bigint,
  "variant_name" text,
  "size_label" text,
  "weight_value" numeric,
  "weight_unit" text,
  "sku" text,
  "barcode" text,
  "purchase_price" numeric,
  "mrp" numeric,
  "price" numeric,
  "stock" numeric,
  "is_default" boolean,
  "sort_order" integer,
  "image_url" text,
  "is_active" boolean,
  "group_name" text
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" bigint PRIMARY KEY,
  "name" text,
  "name_ta" text,
  "tamil_name" text,
  "category" text,
  "category_id" bigint,
  "remedy" jsonb,
  "price" numeric,
  "offer_price" numeric,
  "purchase_price" numeric,
  "mrp" numeric,
  "gst_percent" numeric,
  "unit_type" text,
  "unit_label" text,
  "unit" text,
  "base_quantity" numeric,
  "allow_decimal_quantity" boolean,
  "predefined_options" jsonb,
  "description" text,
  "description_ta" text,
  "benefits" text,
  "benefits_ta" text,
  "image" text,
  "image_url" text,
  "sku" text,
  "barcode" text,
  "brand" text,
  "supplier" text,
  "size" text,
  "color" text,
  "rating" numeric,
  "has_variants" boolean,
  "is_active" boolean,
  "sort_order" integer,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "is_price_editable" boolean,
  "lens_type" text
);

CREATE TABLE IF NOT EXISTS "profiles" (
  "id" uuid PRIMARY KEY,
  "email" text,
  "name" text,
  "mobile" text,
  "role" text,
  "created_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "store_settings" (
  "id" bigint PRIMARY KEY,
  "name" text,
  "owner_name" text,
  "phone" text,
  "email" text,
  "address" text,
  "gst_enabled" boolean,
  "updated_at" timestamptz,
  "gstin" text,
  "advance_gst_rate" numeric
);

-- RLS is left as-is (disabled by default in this project) so the existing
-- frontend can read with its anon key. Add policies if you want to restrict it.
