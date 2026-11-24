-- RPC functions used by the POS frontend when creating an order.
-- Recreated in the new Supabase project because the original project had them.

CREATE OR REPLACE FUNCTION public.create_order_without_stock(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_items jsonb,
  p_shipping numeric,
  p_status text,
  p_order_mode text,
  p_order_type text,
  p_delivery_charge numeric,
  p_discount_amount numeric,
  p_manual_discount_amount numeric,
  p_manual_discount_type text,
  p_manual_discount_value numeric,
  p_coupon_code text,
  p_coupon_percentage numeric
)
RETURNS TABLE (order_id uuid, invoice_no text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_invoice text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_item jsonb;
BEGIN
  SELECT LPAD((COALESCE(MAX(NULLIF(o.invoice_no, '')::numeric), 0) + 1)::text, 8, '0')
  INTO v_invoice
  FROM orders o;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_subtotal := v_subtotal + COALESCE(NULLIF(v_item->>'line_total', '')::numeric, 0);
  END LOOP;

  v_total := GREATEST(
    0,
    v_subtotal
      + COALESCE(p_shipping, 0)
      + COALESCE(p_delivery_charge, 0)
      - COALESCE(p_discount_amount, 0)
      - COALESCE(p_manual_discount_amount, 0)
  );

  INSERT INTO orders (
    id, invoice_no, customer_name, phone, address, items,
    subtotal, shipping, total, status, order_mode, order_type,
    delivery_charge, discount_amount, manual_discount_amount,
    manual_discount_type, manual_discount_value, coupon_code,
    coupon_percentage, total_gst, gst_amount, gst_enabled,
    payment_method, payment_mode, created_at, updated_at
  ) VALUES (
    v_id, v_invoice, p_customer_name, p_phone, p_address, COALESCE(p_items, '[]'::jsonb),
    v_subtotal, COALESCE(p_shipping, 0), v_total, COALESCE(p_status, 'completed'),
    COALESCE(p_order_mode, 'offline'), COALESCE(p_order_type, 'pos_sale'),
    COALESCE(p_delivery_charge, 0), COALESCE(p_discount_amount, 0),
    COALESCE(p_manual_discount_amount, 0), COALESCE(p_manual_discount_type, 'flat'),
    COALESCE(p_manual_discount_value, 0), p_coupon_code, COALESCE(p_coupon_percentage, 0),
    0, 0, false, 'cash', 'cash', now(), now()
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, product_name, name, tamil_name,
      quantity, unit, unit_type, base_quantity, base_price, line_total,
      image_url, is_manual, discount, gst_amount, gst_rate,
      created_at, variant_name, unit_price, source, note, category
    ) VALUES (
      v_id,
      NULLIF(v_item->>'product_id', '')::bigint,
      NULLIF(v_item->>'variant_id', '')::bigint,
      COALESCE(NULLIF(v_item->>'name', ''), 'Product'),
      COALESCE(NULLIF(v_item->>'product_name', ''), NULLIF(v_item->>'name', ''), 'Product'),
      NULLIF(v_item->>'tamil_name', ''),
      COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 0),
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
      now(),
      NULLIF(v_item->>'variant_name', ''),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, NULLIF(v_item->>'base_price', '')::numeric, 0),
      NULLIF(v_item->>'source', ''),
      NULLIF(v_item->>'note', ''),
      NULLIF(v_item->>'category', '')
    );
  END LOOP;

  RETURN QUERY SELECT v_id, v_invoice;
END;
$$;


CREATE OR REPLACE FUNCTION public.create_order_with_stock(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_items jsonb,
  p_shipping numeric,
  p_status text,
  p_order_mode text,
  p_order_type text,
  p_delivery_charge numeric,
  p_discount_amount numeric,
  p_manual_discount_amount numeric,
  p_manual_discount_type text,
  p_manual_discount_value numeric,
  p_coupon_code text,
  p_coupon_percentage numeric,
  p_total_gst numeric,
  p_gst_enabled boolean,
  p_payment_method text,
  p_split_details jsonb
)
RETURNS TABLE (order_id uuid, invoice_no text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_invoice text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_gst numeric := COALESCE(p_total_gst, 0);
  v_discount numeric := COALESCE(p_discount_amount, 0) + COALESCE(p_manual_discount_amount, 0);
  v_item jsonb;
BEGIN
  SELECT LPAD((COALESCE(MAX(NULLIF(o.invoice_no, '')::numeric), 0) + 1)::text, 8, '0')
  INTO v_invoice
  FROM orders o;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_subtotal := v_subtotal + COALESCE(NULLIF(v_item->>'line_total', '')::numeric, 0);
  END LOOP;

  v_total := GREATEST(
    0,
    v_subtotal
      + COALESCE(p_shipping, 0)
      + COALESCE(p_delivery_charge, 0)
      + v_gst
      - v_discount
  );

  INSERT INTO orders (
    id, invoice_no, customer_name, phone, address, items,
    subtotal, shipping, total, status, order_mode, order_type,
    delivery_charge, discount_amount, manual_discount_amount,
    manual_discount_type, manual_discount_value, coupon_code,
    coupon_percentage, total_gst, gst_amount, gst_enabled,
    payment_method, payment_mode, split_details, created_at, updated_at
  ) VALUES (
    v_id, v_invoice, p_customer_name, p_phone, p_address, COALESCE(p_items, '[]'::jsonb),
    v_subtotal, COALESCE(p_shipping, 0), v_total, COALESCE(p_status, 'completed'),
    COALESCE(p_order_mode, 'offline'), COALESCE(p_order_type, 'pos_sale'),
    COALESCE(p_delivery_charge, 0), COALESCE(p_discount_amount, 0),
    COALESCE(p_manual_discount_amount, 0), COALESCE(p_manual_discount_type, 'flat'),
    COALESCE(p_manual_discount_value, 0), p_coupon_code, COALESCE(p_coupon_percentage, 0),
    v_gst, v_gst, COALESCE(p_gst_enabled, false),
    COALESCE(p_payment_method, 'cash'), COALESCE(p_payment_method, 'cash'),
    COALESCE(p_split_details, '{}'::jsonb), now(), now()
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, product_name, name, tamil_name,
      quantity, unit, unit_type, base_quantity, base_price, line_total,
      image_url, is_manual, discount, gst_amount, gst_rate,
      created_at, variant_name, unit_price, source, note, category
    ) VALUES (
      v_id,
      NULLIF(v_item->>'product_id', '')::bigint,
      NULLIF(v_item->>'variant_id', '')::bigint,
      COALESCE(NULLIF(v_item->>'name', ''), 'Product'),
      COALESCE(NULLIF(v_item->>'product_name', ''), NULLIF(v_item->>'name', ''), 'Product'),
      NULLIF(v_item->>'tamil_name', ''),
      COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 0),
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
      now(),
      NULLIF(v_item->>'variant_name', ''),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, NULLIF(v_item->>'base_price', '')::numeric, 0),
      NULLIF(v_item->>'source', ''),
      NULLIF(v_item->>'note', ''),
      NULLIF(v_item->>'category', '')
    );
  END LOOP;

  RETURN QUERY SELECT v_id, v_invoice;
END;
$$;
