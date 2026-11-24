import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT = path.resolve(__dirname, '..', 'export/data/json');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const sourceOrders = JSON.parse(fs.readFileSync(path.join(EXPORT, 'orders.json'), 'utf8'));
const src = {
  count: sourceOrders.length,
  total: sourceOrders.reduce((s, o) => s + Number(o.total || 0), 0),
  invoices: sourceOrders.map(o => o.invoice_no).filter(Boolean).sort(),
};

try {
  await client.connect();
  const r = await client.query(`
    SELECT count(*)::int AS count,
           COALESCE(sum(total),0)::float8 AS total,
           array_agg(invoice_no ORDER BY invoice_no) FILTER (WHERE invoice_no IS NOT NULL) AS invoices
    FROM orders
  `);
  const tgt = r.rows[0];
  console.log('ORDERS source:', src.count, 'rows, total', src.total);
  console.log('ORDERS target:', tgt.count, 'rows, total', tgt.total);
  console.log('Invoice numbers identical:', JSON.stringify(src.invoices) === JSON.stringify(tgt.invoices));

  const sample = await client.query('SELECT invoice_no, customer_name, total, status, payment_mode FROM orders ORDER BY created_at DESC LIMIT 3');
  console.log('\nSample rows in target:');
  for (const row of sample.rows) console.log(' ', JSON.stringify(row));
} finally {
  await client.end();
}
