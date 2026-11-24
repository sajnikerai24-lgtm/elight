require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PG_CONNECTION =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const PRODUCTS_DATA_PATH = path.join(__dirname, '../config/products_data.json');

function computeCatalogMaxUnitPrice(prod) {
  const buy = Number(prod?.buying_price || 0);
  const sell = Number(prod?.selling_price || 0);
  if (buy <= 0 && sell <= 0) return 1500;
  const base = buy > 0 ? buy : Math.round(sell * 0.72);
  let computed = Math.max(10, Math.round(base * 1.15));
  if (sell > 0 && computed >= sell) {
    const ceiling = Math.round(sell * 0.92);
    computed = buy > 0 ? Math.max(buy, ceiling) : Math.max(10, ceiling);
  }
  return Number(computed.toFixed(2));
}

const sql = `
  ALTER TABLE public.inventory
    ADD COLUMN IF NOT EXISTS max_unit_price NUMERIC(12, 2);

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

    // 1. Sync per-product catalog max_unit_price onto every product in public.inventory
    const { rows: invRows } = await client.query(
      'SELECT product_id, product_name, buying_price, selling_price, max_unit_price FROM public.inventory ORDER BY product_id ASC'
    );

    const invById = new Map();
    const invByName = new Map();

    for (const row of invRows) {
      const maxPrice = computeCatalogMaxUnitPrice(row);
      await client.query(
        'UPDATE public.inventory SET max_unit_price = $1 WHERE product_id = $2',
        [maxPrice, row.product_id]
      );
      const enriched = { ...row, max_unit_price: maxPrice };
      invById.set(Number(row.product_id), enriched);
      invByName.set(String(row.product_name || '').trim().toLowerCase(), enriched);
    }

    // 2. Sync local products_data.json with catalog max_unit_price
    if (fs.existsSync(PRODUCTS_DATA_PATH)) {
      const localProds = JSON.parse(fs.readFileSync(PRODUCTS_DATA_PATH, 'utf8'));
      if (Array.isArray(localProds)) {
        const updatedLocal = localProds.map(p => {
          const fromDb = invById.get(Number(p.product_id));
          return {
            ...p,
            max_unit_price: fromDb ? fromDb.max_unit_price : computeCatalogMaxUnitPrice(p)
          };
        });
        fs.writeFileSync(PRODUCTS_DATA_PATH, JSON.stringify(updatedLocal, null, 2), 'utf8');
      }
    }

    // 3. Backfill purchase_items where max_unit_price is null/0 using each product's catalog max price
    const { rows: piRows } = await client.query(
      'SELECT purchase_item_id, product_id, product_name, max_unit_price FROM public.purchase_items'
    );
    for (const pi of piRows) {
      if (pi.max_unit_price !== null && Number(pi.max_unit_price) > 0) continue;
      const prod = invById.get(Number(pi.product_id)) || invByName.get(String(pi.product_name || '').trim().toLowerCase());
      const maxPrice = prod ? prod.max_unit_price : 1500;
      await client.query(
        'UPDATE public.purchase_items SET max_unit_price = $1 WHERE purchase_item_id = $2',
        [maxPrice, pi.purchase_item_id]
      );
    }

    // 4. Backfill quotation_items where max_unit_price is null/0 and evaluate price_validation_status
    const { rows: qiRows } = await client.query(
      'SELECT quotation_item_id, product_id, product_name, unit_price, max_unit_price FROM public.quotation_items'
    );
    for (const qi of qiRows) {
      const prod = invById.get(Number(qi.product_id)) || invByName.get(String(qi.product_name || '').trim().toLowerCase());
      const maxPrice = (qi.max_unit_price !== null && Number(qi.max_unit_price) > 0)
        ? Number(qi.max_unit_price)
        : (prod ? prod.max_unit_price : 1500);
      const unitPrice = Number(qi.unit_price || 0);
      const status = unitPrice <= 0 ? 'invalid' : (unitPrice <= maxPrice + 0.0001 ? 'within_range' : 'above_max');
      await client.query(
        'UPDATE public.quotation_items SET max_unit_price = $1, price_validation_status = $2 WHERE quotation_item_id = $3',
        [maxPrice, status, qi.quotation_item_id]
      );
    }

    const { rows: sampleInv } = await client.query(
      'SELECT product_id, product_name, buying_price, selling_price, max_unit_price FROM public.inventory ORDER BY product_id ASC LIMIT 10'
    );
    const { rows: updatedPi } = await client.query(
      'SELECT purchase_item_id, po_id, product_name, max_unit_price FROM public.purchase_items ORDER BY purchase_item_id ASC'
    );
    console.log('Sample catalog max prices:'); console.table(sampleInv);
    console.log('Backfilled purchase_items:'); console.table(updatedPi);
  } finally {
    await client.end().catch(() => {});
  }
})();
