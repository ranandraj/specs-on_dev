-- Missing columns and RPC functions used by the current frontend build.
-- Apply to the new Supabase project (xoegzyzdbbpdguzkxcfu).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_pdf_url text;
ALTER TABLE public.advance_orders ADD COLUMN IF NOT EXISTS reference_number text;


-- ---------------------------------------------------------------------------
-- Public invoice lookup (invoice page). The frontend tries this RPC first and
-- falls back to a direct orders query if it returns no rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_invoice_by_number(p_invoice_no text)
RETURNS SETOF public.orders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.*
  FROM public.orders o
  WHERE o.invoice_no = p_invoice_no
     OR o.invoice_no = regexp_replace(COALESCE(p_invoice_no, ''), '^INV', '')
     OR 'INV' || o.invoice_no = p_invoice_no
  LIMIT 1;
$$;


-- ---------------------------------------------------------------------------
-- Append an event to an advance order timeline.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_advance_order_event(
  p_order_id uuid,
  p_event_type text,
  p_label text,
  p_remarks text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.advance_order_timeline
    (advance_order_id, event_type, label, remarks, created_at)
  SELECT p_order_id, p_event_type, p_label, p_remarks, now()
  WHERE EXISTS (SELECT 1 FROM public.advance_orders a WHERE a.id = p_order_id);
END;
$$;


-- ---------------------------------------------------------------------------
-- Create an advance (deposit) order plus its initial timeline and payment rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_advance_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_product_name text,
  p_category text,
  p_description text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_expected_delivery_date text,
  p_remarks text,
  p_payment_method text,
  p_created_by_name text,
  p_products jsonb
)
RETURNS SETOF public.advance_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_deposit_id text;
  v_day text := to_char(now(), 'YYYYMMDD');
  v_seq int;
BEGIN
  SELECT COALESCE(MAX(right(a.deposit_id, 4)::int), 0) + 1
  INTO v_seq
  FROM public.advance_orders a
  WHERE a.deposit_id LIKE 'DEP-' || v_day || '-%'
    AND right(a.deposit_id, 4) ~ '^[0-9]+$';

  v_deposit_id := 'DEP-' || v_day || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.advance_orders (
    id, deposit_id, customer_name, phone, address, product_name, products,
    category, description, total_amount, deposit_amount, remaining_balance,
    expected_delivery_date, status, remarks, reference_number, created_by,
    created_by_name, created_at, updated_at, completed_at, completed_order_id,
    invoice_number, final_payment_method
  ) VALUES (
    v_id, v_deposit_id, p_customer_name, p_phone, p_address, p_product_name,
    COALESCE(p_products, '[]'::jsonb), p_category, p_description,
    COALESCE(p_total_amount, 0), COALESCE(p_deposit_amount, 0),
    GREATEST(0, COALESCE(p_total_amount, 0) - COALESCE(p_deposit_amount, 0)),
    NULLIF(p_expected_delivery_date, '')::date, 'pending_deposit',
    COALESCE(p_remarks, ''), '', NULL, p_created_by_name, now(), now(),
    NULL, NULL, NULL, NULL
  );

  INSERT INTO public.advance_order_timeline
    (advance_order_id, event_type, label, remarks, created_at)
  VALUES
    (v_id, 'created', 'Deposit Created', p_remarks, now()),
    (v_id, 'deposit_received', 'Deposit Received',
     'Received ₹ ' || COALESCE(p_deposit_amount, 0)::text, now());

  INSERT INTO public.advance_order_payments
    (advance_order_id, payment_type, amount, payment_method, remarks, received_at)
  VALUES
    (v_id, 'deposit', COALESCE(p_deposit_amount, 0), p_payment_method, p_remarks, now());

  RETURN QUERY SELECT a.* FROM public.advance_orders a WHERE a.id = v_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- Update an advance order status and record the status-change event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_advance_order_status(
  p_order_id uuid,
  p_status text,
  p_remarks text
)
RETURNS SETOF public.advance_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  v_label := CASE p_status
    WHEN 'ready_for_delivery' THEN 'Ready for Collection'
    WHEN 'waiting_final_payment' THEN 'Customer Contacted'
    WHEN 'cancelled' THEN 'Cancelled'
    WHEN 'pending_deposit' THEN 'Pending Deposit'
    ELSE p_status
  END;

  UPDATE public.advance_orders a
  SET status = p_status,
      remarks = CASE WHEN COALESCE(p_remarks, '') = '' THEN a.remarks ELSE p_remarks END,
      updated_at = now()
  WHERE a.id = p_order_id;

  IF FOUND THEN
    INSERT INTO public.advance_order_timeline
      (advance_order_id, event_type, label, remarks, created_at)
    VALUES (p_order_id, p_status, v_label, p_remarks, now());
  END IF;

  RETURN QUERY SELECT a.* FROM public.advance_orders a WHERE a.id = p_order_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- Complete an advance order: create the final invoice/order, post the
-- remaining payment, and mark the advance order completed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_advance_order_v2(
  p_order_id uuid,
  p_payment_method text,
  p_final_amount numeric,
  p_coupon_code text,
  p_coupon_percentage numeric,
  p_manual_discount numeric,
  p_remarks text
)
RETURNS TABLE (order_id uuid, invoice_no text, completed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adv public.advance_orders%ROWTYPE;
  v_order_id uuid := gen_random_uuid();
  v_invoice text;
  v_completed_at timestamptz := now();
  v_manual numeric := COALESCE(p_manual_discount, 0);
  v_coupon_amount numeric;
  v_item jsonb;
  v_pid bigint;
  v_vid bigint;
BEGIN
  SELECT * INTO v_adv
  FROM public.advance_orders a
  WHERE a.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order not found: %', p_order_id;
  END IF;

  v_coupon_amount := round(
    COALESCE(v_adv.remaining_balance, 0) * COALESCE(p_coupon_percentage, 0) / 100, 2
  );

  SELECT lpad((COALESCE(MAX(NULLIF(o.invoice_no, '')::numeric), 0) + 1)::text, 8, '0')
  INTO v_invoice
  FROM public.orders o;

  INSERT INTO public.orders (
    id, invoice_no, customer_name, phone, address, items, subtotal, shipping,
    total, status, order_mode, order_type, delivery_charge, discount_amount,
    manual_discount_amount, manual_discount_type, manual_discount_value,
    coupon_code, coupon_percentage, total_gst, gst_amount, gst_enabled,
    payment_method, payment_mode, split_details, created_at, updated_at,
    remarks, reference_number, billing_date
  ) VALUES (
    v_order_id, v_invoice, v_adv.customer_name, v_adv.phone, v_adv.address,
    COALESCE(v_adv.products, '[]'::jsonb), COALESCE(v_adv.total_amount, 0), 0,
    COALESCE(v_adv.total_amount, 0), 'completed', 'offline', 'advance_order',
    0, v_coupon_amount + v_manual, v_manual,
    CASE WHEN p_manual_discount IS NOT NULL AND p_manual_discount > 0
         AND p_coupon_percentage IS NOT NULL AND p_coupon_percentage > 0
         THEN 'coupon+manual' ELSE 'flat' END,
    v_manual, NULLIF(p_coupon_code, ''), COALESCE(p_coupon_percentage, 0),
    0, 0, false, COALESCE(p_payment_method, 'cash'),
    COALESCE(p_payment_method, 'cash'), '{}'::jsonb, v_completed_at,
    v_completed_at, p_remarks, v_adv.reference_number, now()
  );

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_adv.products, '[]'::jsonb))
  LOOP
    v_pid := NULLIF(v_item->>'product_id', '')::bigint;
    v_vid := NULLIF(v_item->>'variant_id', '')::bigint;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, name, tamil_name,
      quantity, unit, unit_type, base_quantity, base_price, line_total,
      image_url, is_manual, discount, gst_amount, gst_rate, created_at,
      variant_name, unit_price, source, note, category
    ) VALUES (
      v_order_id,
      CASE WHEN EXISTS (SELECT 1 FROM public.products p WHERE p.id = v_pid)
           THEN v_pid ELSE NULL END,
      CASE WHEN v_vid IS NOT NULL AND EXISTS
                (SELECT 1 FROM public.product_variants pv WHERE pv.id = v_vid)
           THEN v_vid ELSE NULL END,
      COALESCE(NULLIF(v_item->>'name', ''), 'Product'),
      COALESCE(NULLIF(v_item->>'name', ''), 'Product'),
      NULLIF(v_item->>'tamil_name', ''),
      COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1),
      NULLIF(v_item->>'unit', ''),
      NULLIF(v_item->>'unit_type', ''),
      COALESCE(NULLIF(v_item->>'base_quantity', '')::numeric, 1),
      COALESCE(NULLIF(v_item->>'base_price', '')::numeric, 0),
      COALESCE(NULLIF(v_item->>'line_total', '')::numeric, 0),
      NULLIF(v_item->>'image_url', ''),
      COALESCE((v_item->>'is_manual')::boolean, (v_item->>'source') = 'manual', false),
      COALESCE(NULLIF(v_item->>'discount', '')::numeric, 0),
      COALESCE(NULLIF(v_item->>'gst_amount', '')::numeric, 0),
      COALESCE(NULLIF(v_item->>'gst_rate', '')::numeric, 0),
      v_completed_at,
      NULLIF(v_item->>'variant_name', ''),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric,
               NULLIF(v_item->>'base_price', '')::numeric, 0),
      COALESCE(NULLIF(v_item->>'source', ''), 'advance_order'),
      COALESCE(NULLIF(v_item->>'note', ''), NULLIF(v_item->>'description', '')),
      NULLIF(v_item->>'category', '')
    );
  END LOOP;

  INSERT INTO public.advance_order_payments
    (advance_order_id, payment_type, amount, payment_method, remarks, received_at)
  VALUES
    (v_adv.id, 'remaining', COALESCE(p_final_amount, 0),
     COALESCE(p_payment_method, 'cash'), p_remarks, v_completed_at);

  UPDATE public.advance_orders a
  SET status = 'completed',
      remaining_balance = 0,
      completed_at = v_completed_at,
      completed_order_id = v_order_id,
      invoice_number = v_invoice,
      final_payment_method = p_payment_method,
      remarks = COALESCE(p_remarks, a.remarks),
      updated_at = v_completed_at
  WHERE a.id = v_adv.id;

  INSERT INTO public.advance_order_timeline
    (advance_order_id, event_type, label, remarks, created_at)
  VALUES
    (v_adv.id, 'remaining_payment_received', 'Remaining Payment Received',
     p_remarks, v_completed_at),
    (v_adv.id, 'invoice_generated', 'Invoice Generated',
     'Invoice ' || v_invoice, v_completed_at);

  RETURN QUERY SELECT v_order_id, v_invoice, v_completed_at;
END;
$$;


-- ---------------------------------------------------------------------------
-- Storage buckets used by the frontend (PDF invoices and product images).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', true, 10485760, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-images', 'product-images', true, 10485760)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- NOTE: storage.objects policies must be created from the Supabase SQL Editor
-- (the direct DB role is not the owner of storage.objects). See
-- supabase/storage_policies.sql.

GRANT EXECUTE ON FUNCTION public.get_public_invoice_by_number(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_advance_order_event(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_advance_order(text, text, text, text, text, text, numeric, numeric, text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_advance_order_status(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_advance_order_v2(uuid, text, numeric, text, numeric, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock(text, text, text, jsonb, numeric, text, text, text, numeric, numeric, numeric, text, numeric, text, numeric, numeric, boolean, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_without_stock(text, text, text, jsonb, numeric, text, text, text, numeric, numeric, numeric, text, numeric, text, numeric) TO anon, authenticated;
