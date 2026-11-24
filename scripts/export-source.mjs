import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, quoteIdent, sqlLiteral, csvCell } from './lib/schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'export');

const SOURCE_URL = (process.env.SOURCE_SUPABASE_URL || 'https://uqalossnwbdchljrfsse.supabase.co').replace(/\/$/, '');
const SOURCE_KEY = process.env.SOURCE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxYWxvc3Nud2JkY2hsanJmc3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2Nzg2MDQsImV4cCI6MjEwNDI1NDYwNH0.6OE6T2unWzRrfJN6uxMwNsxV5a2KPB62vBetdLAEZZA';

fs.mkdirSync(path.join(OUT, 'data/json'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'data/csv'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'supabase'), { recursive: true });

const headers = { apikey: SOURCE_KEY, Authorization: `Bearer ${SOURCE_KEY}`, Accept: 'application/json' };
const dump = {};
const summary = [];

for (const table of TABLES) {
  const res = await fetch(`${SOURCE_URL}/rest/v1/${table.name}?select=*`, { headers });
  if (!res.ok) throw new Error(`${table.name}: HTTP ${res.status} ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`${table.name}: unexpected response`);
  dump[table.name] = rows;

  fs.writeFileSync(path.join(OUT, 'data/json', `${table.name}.json`), JSON.stringify(rows, null, 2) + '\n');

  const defined = table.columns.map(c => c[0]);
  const csvCols = defined.length ? defined : Object.keys(rows[0] || {});
  const csv = [csvCols.join(',')]
    .concat(rows.map(r => csvCols.map(c => csvCell(r[c])).join(',')))
    .join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, 'data/csv', `${table.name}.csv`), csv);

  summary.push(`${table.name.padEnd(26)} ${rows.length}`);
}

// ---- schema.sql ----
let schema = '-- Generated from the production data shape. Safe to re-run.\n';
for (const table of TABLES) {
  const defs = table.columns.map(([name, type]) => {
    const pk = name === table.pk ? ' PRIMARY KEY' : '';
    return `  ${quoteIdent(name)} ${type}${pk}`;
  });
  schema += `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (\n${defs.join(',\n')}\n);\n\n`;
}
schema += `-- RLS is left as-is so the existing frontend can read with its anon key.\n`;
schema += `-- Add policies later if you want to restrict access.\n`;
fs.writeFileSync(path.join(OUT, 'supabase/schema.sql'), schema);

// ---- seed.sql ----
let seed = '-- Generated INSERT statements. Safe to re-run (ON CONFLICT DO NOTHING).\n';
seed += '-- Contains customer data from the source project. Handle as sensitive.\n\n';
for (const table of TABLES) {
  const rows = dump[table.name];
  if (!rows.length) continue;
  const cols = table.columns.map(c => c[0]);
  const colList = cols.map(quoteIdent).join(', ');
  const typeByCol = new Map(table.columns);
  seed += `-- ${table.name} (${rows.length} rows)\n`;
  for (const row of rows) {
    const vals = cols.map(c => sqlLiteral(row[c], typeByCol.get(c)));
    seed += `INSERT INTO ${quoteIdent(table.name)} (${colList}) VALUES (${vals.join(', ')}) ON CONFLICT (${quoteIdent(table.pk)}) DO NOTHING;\n`;
  }
  seed += '\n';
}
fs.writeFileSync(path.join(OUT, 'supabase/seed.sql'), seed);

fs.writeFileSync(path.join(OUT, 'SUMMARY.txt'), `Exported from ${SOURCE_URL}\n\n${summary.join('\n')}\n`);
console.log(`Exported ${TABLES.length} tables to ${OUT}`);
console.log(summary.join('\n'));
