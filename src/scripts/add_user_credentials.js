const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL pooler...');

  // 1. Add username and password columns if they do not exist
  await client.query(`
    ALTER TABLE users_accounts 
    ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '123456';
  `);
  console.log('Columns username and password ensured on users_accounts.');

  // 2. Define simple credentials for each role
  const accounts = [
    {
      full_name: 'Joseph Kariuki (Owner)',
      email: 'joseph@elight.co.ke',
      username: 'owner',
      password: 'owner123',
      role: 'owner',
      phone: '0722111000'
    },
    {
      full_name: 'Mercy Wanjiku (Admin)',
      email: 'mercy@elight.co.ke',
      username: 'admin',
      password: 'admin123',
      role: 'admin',
      phone: '0722111001'
    },
    {
      full_name: 'Peter Otieno (Service Manager)',
      email: 'peter@elight.co.ke',
      username: 'service',
      password: 'service123',
      role: 'service_manager',
      phone: '0722111002'
    },
    {
      full_name: 'Brian Kipchumba (Technician)',
      email: 'brian@elight.co.ke',
      username: 'tech',
      password: 'tech123',
      role: 'technician',
      phone: '0722111003'
    },
    {
      full_name: 'Samuel Mwangi (Technician)',
      email: 'samuel@elight.co.ke',
      username: 'tech2',
      password: 'tech123',
      role: 'technician',
      phone: '0722111004'
    },
    {
      full_name: 'Alice Muthoni (Finance Manager)',
      email: 'alice@elight.co.ke',
      username: 'finance',
      password: 'finance123',
      role: 'finance_manager',
      phone: '0722111005'
    },
    {
      full_name: 'Dennis Ndwiga (Dispatch Manager)',
      email: 'dennis@elight.co.ke',
      username: 'dispatch',
      password: 'dispatch123',
      role: 'dispatch_manager',
      phone: '0722111006'
    },
    {
      full_name: 'Francis Mutua (Driver)',
      email: 'francis@elight.co.ke',
      username: 'driver',
      password: 'driver123',
      role: 'driver',
      phone: '0722111007'
    },
    {
      full_name: 'Grace Kerubo (Inventory Manager)',
      email: 'grace@elight.co.ke',
      username: 'inventory',
      password: 'stock123',
      role: 'inventory_manager',
      phone: '0722111008'
    },
    {
      full_name: 'Dr. Anthony Njoroge (Customer)',
      email: 'anthony@gmail.com',
      username: 'customer',
      password: 'cust123',
      role: 'customer',
      phone: '0712345678'
    }
  ];

  for (const acc of accounts) {
    await client.query(`
      INSERT INTO users_accounts (full_name, email, username, password, role, phone, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      ON CONFLICT (email) DO UPDATE SET
        username = EXCLUDED.username,
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone;
    `, [acc.full_name, acc.email, acc.username, acc.password, acc.role, acc.phone]);
    console.log(`Updated account: ${acc.username} (${acc.role}) -> Password: ${acc.password}`);
  }

  const { rows } = await client.query('SELECT user_id, full_name, username, password, role, email FROM users_accounts ORDER BY user_id ASC');
  console.log('\n--- Current Accounts in Database ---');
  console.table(rows);

  await client.end();
}

main().catch(err => {
  console.error('Error migrating accounts:', err);
  process.exit(1);
});

