import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { TABLES, quoteIdent } from './lib/schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXPORT = path.join(ROOT, 'export');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('Set DATABASE_URL to your target Supabase Postgres connection string.');

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const typeByTable = new Map(TABLES.map(t => [t.name, new Map(t.columns)]));

// Parents before children so foreign keys are satisfied.
const IMPORT_ORDER = [
  'categories',
  'coupons',
  'lens_addons',
  'store_settings',
  'expense_categories',
  'expenses',
  'products',
  'product_variants',
  'orders',
  'order_items',
  'advance_orders',
  'advance_order_payments',
  'advance_order_timeline',
  'profiles',
];

async function main() {
  await client.connect();
  console.log('Connected to target Supabase Postgres.');

  const schemaSql = fs.readFileSync(path.join(EXPORT, 'supabase/schema.sql'), 'utf8');

  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    console.log('Schema applied (CREATE TABLE IF NOT EXISTS).');

    for (const tableName of IMPORT_ORDER) {
      const table = TABLES.find(t => t.name === tableName);
      const file = path.join(EXPORT, 'data/json', `${table.name}.json`);
      const raw = fs.readFileSync(file, 'utf8').trim();
      const rows = raw ? JSON.parse(raw) : [];
      if (!rows.length) {
        console.log(`${table.name.padEnd(26)} 0 rows (nothing to insert)`);
        continue;
      }

      const existing = await client.query(
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',
        ['public', table.name],
      );
      const targetTypes = new Map(existing.rows.map(r => [r.column_name, r.data_type]));
      const defined = typeByTable.get(table.name);
      const columns = table.columns.map(c => c[0]).filter(c => targetTypes.has(c));
      const skipped = table.columns.map(c => c[0]).filter(c => !targetTypes.has(c));
      if (skipped.length) console.log(`  skipping columns not in target ${table.name}: ${skipped.join(', ')}`);

      const names = columns.map(quoteIdent).join(', ');
      const placeholders = columns.map((c, i) => targetTypes.get(c) === 'jsonb' ? `$${i + 1}::jsonb` : `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${quoteIdent(table.name)} (${names}) VALUES (${placeholders}) ON CONFLICT (${quoteIdent(table.pk)}) DO NOTHING`;

      let inserted = 0;
      for (const row of rows) {
        const values = columns.map(c => {
          const v = row[c];
          return targetTypes.get(c) === 'jsonb' && v !== null && v !== undefined ? JSON.stringify(v) : (v ?? null);
        });
        const result = await client.query(sql, values);
        inserted += result.rowCount || 0;
      }
      console.log(`${table.name.padEnd(26)} ${rows.length} exported, ${inserted} inserted`);
    }

    await client.query('COMMIT');
    console.log('COMMIT complete.');

    const check = await client.query(`
      SELECT relname AS table, n_live_tup AS approx_rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname
    `);
    console.log('\nTarget row counts (stats, may lag slightly):');
    for (const r of check.rows) console.log(`  ${r.table.padEnd(26)} ${r.approx_rows}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('IMPORT FAILED:', err.message);
  process.exitCode = 1;
});
