// Table definitions inferred from the production Supabase data and the
// columns referenced by the production frontend build.

export const TABLES = [
  {
    name: 'advance_order_payments', pk: 'id',
    columns: [
      ['id', 'uuid'], ['advance_order_id', 'uuid'], ['payment_type', 'text'],
      ['amount', 'numeric'], ['payment_method', 'text'], ['remarks', 'text'],
      ['received_by', 'uuid'], ['received_at', 'timestamptz'],
    ],
  },
  {
    name: 'advance_order_timeline', pk: 'id',
    columns: [
      ['id', 'bigint'], ['advance_order_id', 'uuid'], ['event_type', 'text'],
      ['label', 'text'], ['remarks', 'text'], ['created_by', 'uuid'],
      ['created_at', 'timestamptz'],
    ],
  },
  {
    name: 'advance_orders', pk: 'id',
    columns: [
      ['id', 'uuid'], ['deposit_id', 'text'], ['customer_name', 'text'],
      ['phone', 'text'], ['address', 'text'], ['product_name', 'text'],
      ['products', 'jsonb'], ['category', 'text'], ['description', 'text'],
      ['total_amount', 'numeric'], ['deposit_amount', 'numeric'],
      ['remaining_balance', 'numeric'], ['expected_delivery_date', 'date'],
      ['status', 'text'], ['remarks', 'text'], ['created_by', 'uuid'],
      ['created_by_name', 'text'], ['created_at', 'timestamptz'],
      ['updated_at', 'timestamptz'], ['completed_at', 'timestamptz'],
      ['completed_order_id', 'uuid'], ['invoice_number', 'text'],
      ['final_payment_method', 'text'], ['reference_number', 'text'],
    ],
  },
  {
    name: 'categories', pk: 'id',
    columns: [
      ['id', 'bigint'], ['name_en', 'text'], ['name_ta', 'text'],
      ['is_active', 'boolean'], ['sort_order', 'integer'],
      ['created_at', 'timestamptz'], ['updated_at', 'timestamptz'],
      ['is_manual_entry', 'boolean'],
    ],
  },
  {
    name: 'coupons', pk: 'id',
    columns: [
      ['id', 'bigint'], ['code', 'text'], ['percentage', 'numeric'],
      ['is_active', 'boolean'], ['expiry_date', 'date'],
      ['usage_limit', 'integer'], ['usage_count', 'integer'],
      ['min_order_value', 'numeric'], ['created_at', 'timestamptz'],
      ['updated_at', 'timestamptz'],
    ],
  },
  {
    name: 'expense_categories', pk: 'id',
    columns: [
      ['id', 'bigint'], ['name', 'text'], ['is_active', 'boolean'],
      ['created_at', 'timestamptz'],
    ],
  },
  {
    name: 'expenses', pk: 'id',
    columns: [
      ['id', 'bigint'], ['category_id', 'bigint'], ['amount', 'numeric'],
      ['expense_date', 'date'], ['description', 'text'],
      ['receipt_url', 'text'], ['created_at', 'timestamptz'],
    ],
  },
  {
    name: 'lens_addons', pk: 'id',
    columns: [
      ['id', 'bigint'], ['name', 'text'], ['price', 'numeric'],
      ['is_active', 'boolean'], ['created_at', 'timestamptz'],
    ],
  },
  {
    name: 'order_items', pk: 'id',
    columns: [
      ['id', 'bigint'], ['order_id', 'uuid'], ['product_id', 'bigint'],
      ['variant_id', 'bigint'], ['product_name', 'text'], ['name', 'text'],
      ['product_tamil_name', 'text'], ['tamil_name', 'text'],
      ['quantity', 'numeric'], ['unit', 'text'], ['unit_type', 'text'],
      ['base_quantity', 'numeric'], ['base_price', 'numeric'],
      ['line_total', 'numeric'], ['image_url', 'text'],
      ['is_manual', 'boolean'], ['discount', 'numeric'],
      ['gst_amount', 'numeric'], ['gst_rate', 'numeric'],
      ['created_at', 'timestamptz'], ['variant_name', 'text'],
      ['unit_price', 'numeric'], ['source', 'text'], ['note', 'text'],
      ['category', 'text'],
    ],
  },
  {
    name: 'orders', pk: 'id',
    columns: [
      ['id', 'uuid'], ['invoice_no', 'text'], ['user_id', 'uuid'],
      ['customer_name', 'text'], ['phone', 'text'], ['address', 'text'],
      ['items', 'jsonb'], ['subtotal', 'numeric'], ['shipping', 'numeric'],
      ['total', 'numeric'], ['status', 'text'], ['order_mode', 'text'],
      ['order_type', 'text'], ['delivery_charge', 'numeric'],
      ['discount_amount', 'numeric'], ['manual_discount_amount', 'numeric'],
      ['manual_discount_type', 'text'], ['manual_discount_value', 'numeric'],
      ['coupon_code', 'text'], ['coupon_percentage', 'numeric'],
      ['total_gst', 'numeric'], ['gst_amount', 'numeric'],
      ['gst_enabled', 'boolean'], ['payment_method', 'text'],
      ['payment_mode', 'text'], ['split_details', 'jsonb'],
      ['created_at', 'timestamptz'], ['updated_at', 'timestamptz'],
      ['remarks', 'text'], ['reference_number', 'text'],
      ['billing_date', 'timestamptz'], ['eye_prescription', 'jsonb'],
      ['invoice_pdf_url', 'text'],
    ],
  },
  {
    name: 'product_variants', pk: 'id',
    columns: [
      ['id', 'bigint'], ['product_id', 'bigint'], ['variant_name', 'text'],
      ['size_label', 'text'], ['weight_value', 'numeric'],
      ['weight_unit', 'text'], ['sku', 'text'], ['barcode', 'text'],
      ['purchase_price', 'numeric'], ['mrp', 'numeric'], ['price', 'numeric'],
      ['stock', 'numeric'], ['is_default', 'boolean'],
      ['sort_order', 'integer'], ['image_url', 'text'],
      ['is_active', 'boolean'], ['group_name', 'text'],
    ],
  },
  {
    name: 'products', pk: 'id',
    columns: [
      ['id', 'bigint'], ['name', 'text'], ['name_ta', 'text'],
      ['tamil_name', 'text'], ['category', 'text'], ['category_id', 'bigint'],
      ['remedy', 'jsonb'], ['price', 'numeric'], ['offer_price', 'numeric'],
      ['purchase_price', 'numeric'], ['mrp', 'numeric'],
      ['gst_percent', 'numeric'], ['unit_type', 'text'],
      ['unit_label', 'text'], ['unit', 'text'], ['base_quantity', 'numeric'],
      ['allow_decimal_quantity', 'boolean'], ['predefined_options', 'jsonb'],
      ['description', 'text'], ['description_ta', 'text'],
      ['benefits', 'text'], ['benefits_ta', 'text'], ['image', 'text'],
      ['image_url', 'text'], ['sku', 'text'], ['barcode', 'text'],
      ['brand', 'text'], ['supplier', 'text'], ['size', 'text'],
      ['color', 'text'], ['rating', 'numeric'], ['has_variants', 'boolean'],
      ['is_active', 'boolean'], ['sort_order', 'integer'],
      ['created_at', 'timestamptz'], ['updated_at', 'timestamptz'],
      ['is_price_editable', 'boolean'], ['lens_type', 'text'],
    ],
  },
  {
    name: 'profiles', pk: 'id',
    columns: [
      ['id', 'uuid'], ['email', 'text'], ['name', 'text'], ['mobile', 'text'],
      ['role', 'text'], ['created_at', 'timestamptz'],
    ],
  },
  {
    name: 'store_settings', pk: 'id',
    columns: [
      ['id', 'bigint'], ['name', 'text'], ['owner_name', 'text'],
      ['phone', 'text'], ['email', 'text'], ['address', 'text'],
      ['gst_enabled', 'boolean'], ['updated_at', 'timestamptz'],
      ['gstin', 'text'], ['advance_gst_rate', 'numeric'],
    ],
  },
];

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function sqlLiteral(value, type) {
  if (value === null || value === undefined) return 'NULL';
  if (type === 'jsonb') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  if (['numeric', 'integer', 'bigint', 'boolean', 'double precision', 'real'].includes(type)) {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
