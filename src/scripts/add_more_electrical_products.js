require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');

const PG_URI =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const NEW_ELECTRICAL_PRODUCTS = [
  {
    product_id: 31,
    product_name: 'Tronic Instant Hot Shower Heater 5.5kW',
    category_id: 5,
    category_name: 'Appliances',
    buying_price: 3800.00,
    selling_price: 5200.00,
    quantity_in_stock: 14,
    reorder_level: 4,
    image_url: 'images/instant-shower.jpg'
  },
  {
    product_id: 32,
    product_name: 'Solar Charge Controller 30A MPPT Digital',
    category_id: 4,
    category_name: 'Circuit Protection',
    buying_price: 2900.00,
    selling_price: 4200.00,
    quantity_in_stock: 12,
    reorder_level: 3,
    image_url: 'images/solar-controller.jpg'
  },
  {
    product_id: 33,
    product_name: 'Pure Sine Wave Power Inverter 1000W 12V',
    category_id: 5,
    category_name: 'Appliances',
    buying_price: 9800.00,
    selling_price: 13500.00,
    quantity_in_stock: 7,
    reorder_level: 2,
    image_url: 'images/power-inverter.jpg'
  },
  {
    product_id: 34,
    product_name: '3-Phase Heavy Duty Industrial Changeover Switch 63A',
    category_id: 4,
    category_name: 'Circuit Protection',
    buying_price: 3200.00,
    selling_price: 4500.00,
    quantity_in_stock: 9,
    reorder_level: 3,
    image_url: 'images/changeover-switch.jpg'
  },
  {
    product_id: 35,
    product_name: '1.5mm Single Core PVC Lighting Cable (100m Red)',
    category_id: 3,
    category_name: 'Cables & Wiring',
    buying_price: 2400.00,
    selling_price: 3300.00,
    quantity_in_stock: 20,
    reorder_level: 5,
    image_url: 'images/single-core-cable.jpg'
  },
  {
    product_id: 36,
    product_name: 'Armoured Underground Power Cable 4-Core 6mm (50m)',
    category_id: 3,
    category_name: 'Cables & Wiring',
    buying_price: 14500.00,
    selling_price: 18900.00,
    quantity_in_stock: 6,
    reorder_level: 2,
    image_url: 'images/armoured-cable.jpg'
  },
  {
    product_id: 37,
    product_name: 'Modern Glass Touch 2-Gang Wall Switch',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 850.00,
    selling_price: 1350.00,
    quantity_in_stock: 24,
    reorder_level: 6,
    image_url: 'images/touch-switch.jpg'
  },
  {
    product_id: 38,
    product_name: 'Waterproof Outdoor Twin Socket IP66 Box',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 1100.00,
    selling_price: 1650.00,
    quantity_in_stock: 15,
    reorder_level: 4,
    image_url: 'images/outdoor-socket.jpg'
  },
  {
    product_id: 39,
    product_name: 'Ceiling Exhaust Ventilation Fan 8-Inch',
    category_id: 5,
    category_name: 'Appliances',
    buying_price: 2100.00,
    selling_price: 3000.00,
    quantity_in_stock: 11,
    reorder_level: 3,
    image_url: 'images/exhaust-fan.jpg'
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
  for (const p of NEW_ELECTRICAL_PRODUCTS) {
    const imgPath = path.join(__dirname, '..', '..', 'public', p.image_url);
    if (!fs.existsSync(imgPath) || fs.statSync(imgPath).size < 1000) {
      throw new Error(`Missing or invalid product image asset: ${imgPath}`);
    }
  }

  console.log('Upserting 9 new electrical products into Supabase public.inventory...');
  const { data: upserted, error } = await supabase
    .from('inventory')
    .upsert(NEW_ELECTRICAL_PRODUCTS, { onConflict: 'product_id' })
    .select();

  if (error) throw error;

  console.log('Syncing inventory.product_id Postgres sequence...');
  await syncInventorySequence();

  console.log('Syncing local src/config/products_data.json cache...');
  const allProducts = await interModuleSync.getProducts();
  const localPath = path.join(__dirname, '..', 'config', 'products_data.json');
  const sorted = [...allProducts].sort((a, b) => Number(b.product_id || 0) - Number(a.product_id || 0));
  fs.writeFileSync(localPath, JSON.stringify(sorted, null, 2), 'utf8');

  console.log(`\nSynced ${upserted.length} new electrical products. Total products in database & local cache: ${sorted.length}`);
  upserted.forEach(p => {
    console.log(`  [#${p.product_id}] ${p.product_name} (${p.category_name}) - KES ${p.selling_price} | Stock: ${p.quantity_in_stock} | Image: ${p.image_url}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed adding electrical products:', err);
    process.exit(1);
  });
