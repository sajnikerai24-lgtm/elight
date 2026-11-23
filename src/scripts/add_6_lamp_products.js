require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Client } = require('pg');
const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');

const PG_URI =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const LAMP_PRODUCTS = [
  {
    product_id: 40,
    product_name: 'Adjustable LED Study & Architect Desk Lamp (12W)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1250.00,
    selling_price: 1850.00,
    quantity_in_stock: 18,
    reorder_level: 5,
    image_url: 'images/desk-lamp.jpg',
    download_url: 'https://images.unsplash.com/photo-1547908068-085fb1448212?w=600&auto=format&fit=crop&q=80'
  },
  {
    product_id: 41,
    product_name: 'Modern Bedside Shade Table Lamp (Warm Glow)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1900.00,
    selling_price: 2800.00,
    quantity_in_stock: 12,
    reorder_level: 4,
    image_url: 'images/table-lamp.jpg',
    download_url: 'https://images.unsplash.com/photo-1632695403049-b4373d217fc8?w=600&auto=format&fit=crop&q=80'
  },
  {
    product_id: 42,
    product_name: 'Minimalist Standing Corner Floor Lamp',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 3800.00,
    selling_price: 5400.00,
    quantity_in_stock: 8,
    reorder_level: 2,
    image_url: 'images/floor-lamp.jpg',
    download_url: 'https://images.unsplash.com/photo-1759647020559-2f91a4290ae4?w=600&auto=format&fit=crop&q=80'
  },
  {
    product_id: 43,
    product_name: 'Nordic Pendant Hanging Lamp Fixture',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 2950.00,
    selling_price: 4200.00,
    quantity_in_stock: 10,
    reorder_level: 3,
    image_url: 'images/pendant-lamp.jpg',
    download_url: 'https://images.unsplash.com/photo-1641444457235-bff570057ee2?w=600&auto=format&fit=crop&q=80'
  },
  {
    product_id: 44,
    product_name: 'Vintage Warm Edison Filament LED Lamp 8W (E27)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 480.00,
    selling_price: 750.00,
    quantity_in_stock: 30,
    reorder_level: 8,
    image_url: 'images/edison-lamp.jpg',
    download_url: 'https://images.unsplash.com/photo-1641665277866-673cbcaf294f?w=600&auto=format&fit=crop&q=80'
  },
  {
    product_id: 45,
    product_name: 'Weatherproof Outdoor Wall Lantern Lamp',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1750.00,
    selling_price: 2550.00,
    quantity_in_stock: 14,
    reorder_level: 4,
    image_url: 'images/wall-lantern-lamp.jpg',
    download_url: 'https://images.unsplash.com/photo-1759390304641-9490a433c34b?w=600&auto=format&fit=crop&q=80'
  }
];

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 2000) {
          return reject(new Error(`Downloaded file too small (${buf.length} bytes) for ${url}`));
        }
        fs.writeFileSync(dest, buf);
        resolve(buf.length);
      });
    }).on('error', reject);
  });
}

async function syncInventorySequence() {
  const client = new Client({
    connectionString: PG_URI,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('public.inventory', 'product_id'),
        COALESCE((SELECT MAX(product_id) FROM public.inventory), 1),
        true
      );
    `);
  } finally {
    await client.end();
  }
}

async function main() {
  for (const p of LAMP_PRODUCTS) {
    const imgPath = path.join(__dirname, '..', '..', 'public', p.image_url);
    const bytes = await downloadImage(p.download_url, imgPath);
    console.log(`Downloaded ${p.image_url} (${bytes} bytes)`);
  }

  const dbPayload = LAMP_PRODUCTS.map(({ download_url, ...rest }) => rest);

  console.log('\nUpserting 6 new lamp products into Supabase public.inventory...');
  const { data: upserted, error } = await supabase
    .from('inventory')
    .upsert(dbPayload, { onConflict: 'product_id' })
    .select();

  if (error) throw error;

  console.log('Syncing inventory.product_id Postgres sequence...');
  await syncInventorySequence();

  console.log('Syncing local src/config/products_data.json cache...');
  const allProducts = await interModuleSync.getProducts();
  const localPath = path.join(__dirname, '..', 'config', 'products_data.json');
  const sorted = [...allProducts].sort((a, b) => Number(b.product_id || 0) - Number(a.product_id || 0));
  fs.writeFileSync(localPath, JSON.stringify(sorted, null, 2), 'utf8');

  console.log(`\nSynced ${upserted.length} new lamp products. Total products in database & local cache: ${sorted.length}`);
  upserted.forEach(p => {
    console.log(`  [#${p.product_id}] ${p.product_name} (${p.category_name}) - KES ${p.selling_price} | Stock: ${p.quantity_in_stock} | Image: ${p.image_url}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed adding lamp products:', err);
    process.exit(1);
  });
