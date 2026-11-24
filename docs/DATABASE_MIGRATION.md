# Database copy

On 2026-11-24, all data from the production Supabase project used by the
Vercel-hosted billing site was copied into a new Supabase project
(`xoegzyzdbbpdguzkxcfu`).

## What was copied

| Table | Rows |
|---|---:|
| orders | 73 |
| order_items | 144 |
| advance_orders | 45 |
| advance_order_payments | 85 |
| advance_order_timeline | 177 |
| products | 36 |
| categories | 6 |
| coupons | 1 |
| lens_addons | 10 |
| expense_categories | 8 |
| store_settings | 1 |
| expenses / product_variants / profiles | 0 |

Verification: source and target both have 73 orders with total 213084.6 and
identical invoice numbers.

## Scripts

- `scripts/export-source.mjs` — read-only export from the source project.
- `scripts/import-target.mjs` — import into a target Postgres/Supabase DB.
- `scripts/verify.mjs` — compare source export with target DB.

Install the only dependency before running them:

```bash
npm install pg
```

The importer reads `DATABASE_URL` from the environment. Never commit that URL
or password.

## Notes

- Raw JSON/CSV/seed exports contain customer PII and are intentionally **not**
  committed to this public repo.
- RLS is left disabled on `orders` and `order_items` so the existing anon-key
  frontend can read data. Add policies if you want to restrict access.
- The frontend build in this repo still points to the old Supabase URL/key.
  Update those to `https://xoegzyzdbbpdguzkxcfu.supabase.co` and the new
  project's anon key to use the copied database.
