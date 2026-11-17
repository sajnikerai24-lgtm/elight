const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to download image
function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      return resolve(); // Skip if already downloaded
    }
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

// 20 realistic electrical store products
const products = [
  {
    product_id: 1,
    product_name: 'Philips 9W LED Bulb',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 180.00,
    selling_price: 250.00,
    quantity_in_stock: 45,
    reorder_level: 10,
    image_url: 'images/bulb.jpg',
    download_url: null
  },
  {
    product_id: 2,
    product_name: 'Schneider 1-Way Light Switch',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 150.00,
    selling_price: 220.00,
    quantity_in_stock: 30,
    reorder_level: 8,
    image_url: 'images/wall-switch.jpg',
    download_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 3,
    product_name: 'Twin with Earth 2.5mm Cable (100m)',
    category_id: 3,
    category_name: 'Cables & Wiring',
    buying_price: 4500.00,
    selling_price: 5800.00,
    quantity_in_stock: 12,
    reorder_level: 3,
    image_url: 'images/cable-roll.jpg',
    download_url: 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 4,
    product_name: 'Double Socket Outlet with USB',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 650.00,
    selling_price: 950.00,
    quantity_in_stock: 18,
    reorder_level: 5,
    image_url: 'images/double-socket.jpg',
    download_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 5,
    product_name: 'Circuit Breaker (MCB) 20A Single Pole',
    category_id: 4,
    category_name: 'Circuit Protection',
    buying_price: 320.00,
    selling_price: 450.00,
    quantity_in_stock: 25,
    reorder_level: 6,
    image_url: 'images/mcb-breaker.jpg',
    download_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 6,
    product_name: 'LED Ceiling Panel Light 18W',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 700.00,
    selling_price: 1100.00,
    quantity_in_stock: 15,
    reorder_level: 4,
    image_url: 'images/panel-light.jpg',
    download_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 7,
    product_name: 'Crystal Chandelier Light',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 12000.00,
    selling_price: 16500.00,
    quantity_in_stock: 4,
    reorder_level: 2,
    image_url: 'images/chandelier.jpg',
    download_url: null
  },
  {
    product_id: 8,
    product_name: 'RGB LED Strip Light 5M',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1200.00,
    selling_price: 1800.00,
    quantity_in_stock: 20,
    reorder_level: 5,
    image_url: 'images/strip-light.jpg',
    download_url: null
  },
  {
    product_id: 9,
    product_name: 'Electric Cordless Kettle 1.8L',
    category_id: 5,
    category_name: 'Appliances',
    buying_price: 1500.00,
    selling_price: 2200.00,
    quantity_in_stock: 8,
    reorder_level: 3,
    image_url: 'images/kettle.jpg',
    download_url: null
  },
  {
    product_id: 10,
    product_name: 'Outdoor LED Floodlight 50W',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1800.00,
    selling_price: 2600.00,
    quantity_in_stock: 14,
    reorder_level: 4,
    image_url: 'images/floodlight.jpg',
    download_url: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 11,
    product_name: 'Solar Motion Sensor Security Light',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1400.00,
    selling_price: 2100.00,
    quantity_in_stock: 16,
    reorder_level: 5,
    image_url: 'images/solar-light.jpg',
    download_url: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 12,
    product_name: 'Heavy Duty 4-Way Extension Socket (5M)',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 900.00,
    selling_price: 1400.00,
    quantity_in_stock: 22,
    reorder_level: 6,
    image_url: 'images/extension-socket.jpg',
    download_url: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 13,
    product_name: 'Digital Multimeter AC/DC Voltage Tester',
    category_id: 5,
    category_name: 'Appliances',
    buying_price: 1100.00,
    selling_price: 1750.00,
    quantity_in_stock: 10,
    reorder_level: 3,
    image_url: 'images/multimeter.jpg',
    download_url: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 14,
    product_name: '20A Double Pole Water Heater Switch with Neon',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 450.00,
    selling_price: 680.00,
    quantity_in_stock: 28,
    reorder_level: 6,
    image_url: 'images/heater-switch.jpg',
    download_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 15,
    product_name: 'Automatic Voltage Guard / Protector (13A)',
    category_id: 4,
    category_name: 'Circuit Protection',
    buying_price: 850.00,
    selling_price: 1300.00,
    quantity_in_stock: 19,
    reorder_level: 5,
    image_url: 'images/voltage-guard.jpg',
    download_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 16,
    product_name: 'Track Spotlight Fixture 30W Black',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1600.00,
    selling_price: 2400.00,
    quantity_in_stock: 11,
    reorder_level: 4,
    image_url: 'images/track-light.jpg',
    download_url: 'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 17,
    product_name: 'Consumer Unit 8-Way Metal Distribution Box',
    category_id: 4,
    category_name: 'Circuit Protection',
    buying_price: 2800.00,
    selling_price: 3900.00,
    quantity_in_stock: 7,
    reorder_level: 2,
    image_url: 'images/consumer-unit.jpg',
    download_url: 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 18,
    product_name: 'Residual Current Circuit Breaker (RCCB) 40A',
    category_id: 4,
    category_name: 'Circuit Protection',
    buying_price: 1900.00,
    selling_price: 2700.00,
    quantity_in_stock: 12,
    reorder_level: 3,
    image_url: 'images/rccb-breaker.jpg',
    download_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 19,
    product_name: 'Flexible 3-Core Submersible Cable (50m)',
    category_id: 3,
    category_name: 'Cables & Wiring',
    buying_price: 3600.00,
    selling_price: 4900.00,
    quantity_in_stock: 8,
    reorder_level: 3,
    image_url: 'images/flex-cable.jpg',
    download_url: 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80'
  },
  {
    product_id: 20,
    product_name: 'Industrial Heat Gun 2000W Dual Temperature',
    category_id: 5,
    category_name: 'Appliances',
    buying_price: 2200.00,
    selling_price: 3200.00,
    quantity_in_stock: 6,
    reorder_level: 2,
    image_url: 'images/heat-gun.jpg',
    download_url: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&auto=format&fit=crop&q=80'
  }
];

(async () => {
  console.log('--- 1. Downloading images to public/images/ ---');
  for (const p of products) {
    if (p.download_url) {
      const dest = path.join(__dirname, '..', '..', 'public', p.image_url);
      try {
        await downloadImage(p.download_url, dest);
        console.log(`✓ Image ready: ${p.image_url}`);
      } catch (err) {
        console.warn(`! Failed to download ${p.image_url}: ${err.message}, will use fallback`);
      }
    }
  }

  console.log('\n--- 2. Upserting 20 products into Supabase inventory table ---');
  const dbRows = products.map(({ download_url, ...item }) => item);

  const { data, error } = await supabase
    .from('inventory')
    .upsert(dbRows, { onConflict: 'product_id' })
    .select();

  if (error) {
    console.error('Supabase upsert error:', error);
    process.exit(1);
  }

  console.log(`\n✅ Successfully added/updated ${data.length} products in Supabase!`);
  data.forEach(p => {
    console.log(`[#${p.product_id}] ${p.product_name} - ${p.category_name} | Stock: ${p.quantity_in_stock} | Price: KES ${p.selling_price} | Image: ${p.image_url}`);
  });
})();

