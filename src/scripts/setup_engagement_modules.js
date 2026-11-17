const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL...');

  // Booking Module Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      booking_id SERIAL PRIMARY KEY,
      booking_ref VARCHAR(40) UNIQUE NOT NULL,
      booking_type VARCHAR(30) NOT NULL DEFAULT 'service',
      customer_name VARCHAR(150) NOT NULL,
      customer_email VARCHAR(150),
      customer_phone VARCHAR(40) NOT NULL,
      product_id INTEGER,
      item_or_service_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      preferred_date DATE NOT NULL,
      preferred_time VARCHAR(40) DEFAULT '09:00 AM - 12:00 PM',
      location_or_notes TEXT,
      estimated_amount NUMERIC(12, 2) DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
      confirmation_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Table bookings ensured.');

  // Feedback Module Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS customer_feedback (
      feedback_id SERIAL PRIMARY KEY,
      customer_name VARCHAR(150) NOT NULL,
      customer_email VARCHAR(150),
      feedback_type VARCHAR(30) NOT NULL DEFAULT 'review',
      rating INTEGER DEFAULT 5,
      subject VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'published',
      admin_reply TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Table customer_feedback ensured.');

  // Contact Us Module Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS contact_inquiries (
      inquiry_id SERIAL PRIMARY KEY,
      ticket_ref VARCHAR(40) UNIQUE NOT NULL,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL,
      phone VARCHAR(40),
      subject VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'unread',
      admin_response TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Table contact_inquiries ensured.');

  // Seed initial sample bookings if empty
  const { rows: bCount } = await client.query('SELECT COUNT(*)::int AS c FROM bookings');
  if (bCount[0].c === 0) {
    await client.query(`
      INSERT INTO bookings (
        booking_ref, booking_type, customer_name, customer_email, customer_phone,
        item_or_service_name, quantity, preferred_date, preferred_time,
        location_or_notes, estimated_amount, status, confirmation_note
      ) VALUES
      (
        'BK-ELIGHT-1001', 'service', 'Dr. Anthony Njoroge', 'anthony@gmail.com', '0712345678',
        '3-Phase Solar Backup & Inverter Installation', 1, CURRENT_DATE + INTERVAL '5 days', '09:00 AM - 12:00 PM',
        'Milimani Estate, Meru - Site readiness confirmed', 18500.00, 'confirmed',
        'Confirmed! Technician team scheduled for morning arrival.'
      ),
      (
        'BK-ELIGHT-1002', 'product', 'Dr. Anthony Njoroge', 'anthony@gmail.com', '0712345678',
        'Crystal Chandelier Light', 2, CURRENT_DATE + INTERVAL '10 days', '02:00 PM - 05:00 PM',
        'Reserve for pickup at Meru Town Showroom', 33000.00, 'confirmed',
        '2 units reserved in showroom under reference BK-ELIGHT-1002.'
      ),
      (
        'BK-ELIGHT-1003', 'service', 'Wanjiru Kamau', 'wanjiru.k@gmail.com', '0723998877',
        'Commercial Consumer Unit (8-Way MCB) Upgrade', 1, CURRENT_DATE + INTERVAL '3 days', '10:00 AM - 01:00 PM',
        'Makutano Junction, Meru County', 6500.00, 'confirmed',
        'Booking confirmed. Certified electrician assigned.'
      );
    `);
    console.log('Seeded initial bookings.');
  }

  // Seed initial sample feedback if empty
  const { rows: fCount } = await client.query('SELECT COUNT(*)::int AS c FROM customer_feedback');
  if (fCount[0].c === 0) {
    await client.query(`
      INSERT INTO customer_feedback (
        customer_name, customer_email, feedback_type, rating, subject, message, status, admin_reply
      ) VALUES
      (
        'Dr. Anthony Njoroge', 'anthony@gmail.com', 'review', 5,
        'Genuine Schneider Breakers & Fast Delivery',
        'Ordered an 8-way consumer unit and twin & earth cables. Everything was genuine KEBS-certified and delivered to Milimani, Meru the same afternoon.',
        'published',
        'Thank you Dr. Njoroge! We appreciate your continued trust in Elight Electrical Shop.'
      ),
      (
        'Eng. David Mutua', 'dmutua@buildkenya.co.ke', 'review', 5,
        'Reliable Wholesale Pricing for Contractors',
        'Best wholesale rates in Meru County for LED panels and 2.5mm wiring rolls. Stock levels on the website are accurate.',
        'published',
        'Asante sana Eng. Mutua! Always happy to support your project sites across Meru.'
      ),
      (
        'Beatrice Achieng', 'beatrice.a@yahoo.com', 'review', 4,
        'Beautiful Chandelier & Helpful Shop Attendants',
        'The showroom team helped me pick warm-white LED bulbs that matched our dining chandelier perfectly.',
        'published',
        null
      ),
      (
        'Kelvin Omondi', 'kelvin.o@gmail.com', 'complaint', 2,
        'Delayed Delivery to Maua',
        'My parcel arrived slightly later than expected via local delivery van, though the voltage guard itself works well.',
        'resolved',
        'Apologies for the delay, Kelvin. Our Maua delivery route has been streamlined to ensure prompt afternoon handover.'
      );
    `);
    console.log('Seeded initial customer feedback.');
  }

  // Seed initial sample contact inquiries if empty
  const { rows: cCount } = await client.query('SELECT COUNT(*)::int AS c FROM contact_inquiries');
  if (cCount[0].c === 0) {
    await client.query(`
      INSERT INTO contact_inquiries (
        ticket_ref, full_name, email, phone, subject, message, status, admin_response
      ) VALUES
      (
        'INQ-2026-401', 'Grace Wambui', 'gwambui@sunriseapartments.co.ke', '0711445566',
        'Bulk Quotation for 40 Apartment Units Wiring',
        'Hello Elight team, kindly share a wholesale quotation for 40 consumer units, 13A twin sockets, and 1.5mm/2.5mm cables.',
        'replied',
        'Sent detailed proforma invoice to gwambui@sunriseapartments.co.ke with 12% contractor discount.'
      ),
      (
        'INQ-2026-402', 'Musa Hassan', 'musa.hassan@gmail.com', '0733889900',
        'Do you install Automatic Voltage Protectors for Fridges?',
        'I want to buy 3 fridge guards and have a technician check our kitchen socket grounding in Meru Town.',
        'unread',
        null
      );
    `);
    console.log('Seeded initial contact inquiries.');
  }

  await client.end();
  console.log('Engagement modules DB setup complete!');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
