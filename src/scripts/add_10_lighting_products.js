require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');

const PG_URI =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const LIGHTING_PRODUCTS = [
  {
    product_id: 21,
    product_name: 'Philips 4ft T8 LED Tube Light 18W (Cool Daylight)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 420.00,
    selling_price: 600.00,
    quantity_in_stock: 35,
    reorder_level: 10,
    image_url: 'images/panel-light.jpg'
  },
  {
    product_id: 22,
    product_name: 'Tronic 24W Round LED Bulkhead Outdoor Light',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 750.00,
    selling_price: 1100.00,
    quantity_in_stock: 18,
    reorder_level: 5,
    image_url: 'images/floodlight.jpg'
  },
  {
    product_id: 23,
    product_name: 'Modern Pendant Hanging Kitchen Light (Warm Gold)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 2600.00,
    selling_price: 3600.00,
    quantity_in_stock: 9,
    reorder_level: 3,
    image_url: 'images/chandelier.jpg'
  },
  {
    product_id: 24,
    product_name: 'Rechargeable Emergency LED Twin Spot Light (8 Hours)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1650.00,
    selling_price: 2350.00,
    quantity_in_stock: 14,
    reorder_level: 4,
    image_url: 'images/solar-light.jpg'
  },
  {
    product_id: 25,
    product_name: '12W Recessed LED Downlight Spotlight (Warm White)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 520.00,
    selling_price: 780.00,
    quantity_in_stock: 28,
    reorder_level: 8,
    image_url: 'images/track-light.jpg'
  },
  {
    product_id: 26,
    product_name: 'Smart Wi-Fi Color-Changing LED Bulb 10W (B22)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 680.00,
    selling_price: 980.00,
    quantity_in_stock: 20,
    reorder_level: 6,
    image_url: 'images/bulb.jpg'
  },
  {
    product_id: 27,
    product_name: '100W Solar Street & Compound Floodlight with Remote',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 4200.00,
    selling_price: 5800.00,
    quantity_in_stock: 10,
    reorder_level: 3,
    image_url: 'images/solar-light.jpg'
  },
  {
    product_id: 28,
    product_name: 'LED Bedside & Staircase Wall Sconce Lamp (6W)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1150.00,
    selling_price: 1650.00,
    quantity_in_stock: 12,
    reorder_level: 4,
    image_url: 'images/chandelier.jpg'
  },
  {
    product_id: 29,
    product_name: 'Waterproof Garden Bollard & Pathway LED Light (IP65)',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1850.00,
    selling_price: 2600.00,
    quantity_in_stock: 11,
    reorder_level: 3,
    image_url: 'images/floodlight.jpg'
  },
  {
    product_id: 30,
    product_name: '150W High-Bay Warehouse LED UFO Lamp',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 4900.00,
    selling_price: 6800.00,
    quantity_in_stock: 6,
    reorder_level: 2,
    image_url: 'images/panel-light.jpg'
  }
];

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
  for (const p of LIGHTING_PRODUCTS) {
    const imgPath = path.join(__dirname, '..', '..', 'public', p.image_url);
    if (!fs.existsSync(imgPath)) {
      throw new Error(`Missing product image asset: ${imgPath}`);
    }
  }

  console.log('Upserting 10 lighting products into Supabase public.inventory...');
  const { data: upserted, error } = await supabase
    .from('inventory')
    .upsert(LIGHTING_PRODUCTS, { onConflict: 'product_id' })
    .select();

  if (error) throw error;

  console.log('Syncing inventory.product_id Postgres sequence...');
  await syncInventorySequence();

  console.log('Syncing local src/config/products_data.json cache...');
  const allProducts = await interModuleSync.getProducts();

  console.log(`\nSynced ${upserted.length} new lighting products. Total products in Supabase inventory: ${allProducts.length}`);
  upserted.forEach(p => {
    console.log(`  [#${p.product_id}] ${p.product_name} (${p.category_name}) - KES ${p.selling_price} | Stock: ${p.quantity_in_stock} | Image: ${p.image_url}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed adding lighting products:', err);
    process.exit(1);
  });
