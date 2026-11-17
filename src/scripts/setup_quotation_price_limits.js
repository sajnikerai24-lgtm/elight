require('dotenv').config();
const { Client } = require('pg');

const PG_CONNECTION =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const sql = `
  ALTER TABLE public.purchase_items
    ADD COLUMN IF NOT EXISTS min_unit_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS max_unit_price NUMERIC(12, 2);

  ALTER TABLE public.quotation_items
    ADD COLUMN IF NOT EXISTS min_unit_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS max_unit_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS price_validation_status TEXT DEFAULT 'within_range';
`;

(async () => {
  const client = new Client({
    connectionString: PG_CONNECTION,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    await client.query(sql);

    const { rows: piCols } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'purchase_items'
      ORDER BY ordinal_position
    `);
    const { rows: qiCols } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'quotation_items'
      ORDER BY ordinal_position
    `);

    console.log('purchase_items columns:', piCols.map(r => r.column_name));
    console.log('quotation_items columns:', qiCols.map(r => r.column_name));
  } finally {
    await client.end().catch(() => {});
  }
})();
