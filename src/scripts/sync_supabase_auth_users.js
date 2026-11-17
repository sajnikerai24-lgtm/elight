require('dotenv').config();
const { Client } = require('pg');
const supabase = require('../config/supabase');

const PG_URI =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const REQUIRED_ROLE_ACCOUNTS = [
  {
    full_name: 'Joseph Kariuki (Owner)',
    username: 'owner',
    email: 'joseph@elight.co.ke',
    password: 'owner123',
    role: 'owner',
    phone: '0722111000',
    status: 'active'
  },
  {
    full_name: 'Mercy Wanjiku (Admin)',
    username: 'admin',
    email: 'mercy@elight.co.ke',
    password: 'admin123',
    role: 'admin',
    phone: '0722111001',
    status: 'active'
  },
  {
    full_name: 'Peter Otieno (Service Manager)',
    username: 'service',
    email: 'peter@elight.co.ke',
    password: 'service123',
    role: 'service_manager',
    phone: '0722111002',
    status: 'active'
  },
  {
    full_name: 'Brian Kipchumba (Technician)',
    username: 'tech',
    email: 'brian@elight.co.ke',
    password: 'tech123',
    role: 'technician',
    phone: '0722111003',
    status: 'active'
  },
  {
    full_name: 'Samuel Mwangi (Technician)',
    username: 'tech2',
    email: 'samuel@elight.co.ke',
    password: 'tech123',
    role: 'technician',
    phone: '0722111004',
    status: 'active'
  },
  {
    full_name: 'Alice Muthoni (Finance Manager)',
    username: 'finance',
    email: 'alice@elight.co.ke',
    password: 'finance123',
    role: 'finance_manager',
    phone: '0722111005',
    status: 'active'
  },
  {
    full_name: 'Dennis Ndwiga (Dispatch Manager)',
    username: 'dispatch',
    email: 'dennis@elight.co.ke',
    password: 'dispatch123',
    role: 'dispatch_manager',
    phone: '0722111006',
    status: 'active'
  },
  {
    full_name: 'Francis Mutua (Driver)',
    username: 'driver',
    email: 'francis@elight.co.ke',
    password: 'driver123',
    role: 'driver',
    phone: '0722111007',
    status: 'active'
  },
  {
    full_name: 'Grace Kerubo (Inventory Manager)',
    username: 'inventory',
    email: 'grace@elight.co.ke',
    password: 'stock123',
    role: 'inventory_manager',
    phone: '0722111008',
    status: 'active'
  },
  {
    full_name: 'Esther Karimi (Cashier)',
    username: 'cashier',
    email: 'esther@elight.co.ke',
    password: 'cashier123',
    role: 'cashier',
    phone: '0722111009',
    status: 'active'
  },
  {
    full_name: 'Dr. Anthony Njoroge (Customer)',
    username: 'customer',
    email: 'anthony@gmail.com',
    password: 'cust123',
    role: 'customer',
    phone: '0712345678',
    status: 'active'
  }
];

async function ensureSchema() {
  const client = new Client({
    connectionString: PG_URI,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query(`
      ALTER TABLE public.users_accounts
      ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
    `);

    // Inspect any check constraint on role and expand if cashier/customer_care are blocked
    const { rows: checks } = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.users_accounts'::regclass
        AND contype = 'c';
    `);

    for (const c of checks) {
      if (String(c.def).toLowerCase().includes('role') && !String(c.def).toLowerCase().includes('cashier')) {
        await client.query(`ALTER TABLE public.users_accounts DROP CONSTRAINT "${c.conname}";`);
        await client.query(`
          ALTER TABLE public.users_accounts
          ADD CONSTRAINT users_accounts_role_check
          CHECK (role IN (
            'owner', 'admin', 'cashier', 'service_manager', 'technician',
            'finance_manager', 'dispatch_manager', 'driver', 'inventory_manager',
            'customer_care', 'customer', 'supplier'
          ));
        `);
      }
    }

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('public.users_accounts', 'user_id'),
        COALESCE((SELECT MAX(user_id) FROM public.users_accounts), 1),
        true
      );
    `);
  } finally {
    await client.end();
  }
}

async function listAllAuthUsers() {
  const all = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    all.push(...batch);
    if (batch.length < 1000) break;
    page += 1;
  }
  return all;
}

async function syncUsers() {
  console.log('1. Ensuring users_accounts schema (auth_user_id + role constraint)...');
  await ensureSchema();

  console.log('2. Ensuring core role accounts exist in public.users_accounts...');
  const { data: currentAccounts, error: fetchErr } = await supabase
    .from('users_accounts')
    .select('*')
    .order('user_id', { ascending: true });
  if (fetchErr) throw fetchErr;

  const existingByUsername = new Map();
  const existingByEmail = new Map();
  for (const row of currentAccounts || []) {
    if (row.username) existingByUsername.set(String(row.username).trim().toLowerCase(), row);
    if (row.email) existingByEmail.set(String(row.email).trim().toLowerCase(), row);
  }

  for (const acct of REQUIRED_ROLE_ACCOUNTS) {
    const match =
      existingByUsername.get(acct.username.toLowerCase()) ||
      existingByEmail.get(acct.email.toLowerCase());
    if (!match) {
      const { error: insErr } = await supabase.from('users_accounts').insert([acct]);
      if (insErr) throw insErr;
      console.log(`   + Inserted missing users_accounts row: ${acct.username} (${acct.role})`);
    }
  }

  console.log('3. Syncing public.users_accounts -> Supabase Auth (auth.users)...');
  const { data: allAccounts, error: allErr } = await supabase
    .from('users_accounts')
    .select('*')
    .order('user_id', { ascending: true });
  if (allErr) throw allErr;

  const authUsers = await listAllAuthUsers();
  const authByEmail = new Map();
  const authById = new Map();
  for (const au of authUsers) {
    authById.set(au.id, au);
    if (au.email) authByEmail.set(String(au.email).trim().toLowerCase(), au);
  }

  let syncedCount = 0;
  for (const row of allAccounts || []) {
    const cleanEmail = String(row.email || `${row.username || `user${row.user_id}`}@elight.co.ke`)
      .trim()
      .toLowerCase();
    let cleanPass = String(row.password || '').trim();
    if (cleanPass.length < 6) {
      cleanPass = 'elight123';
    }

    const appMetadata = {
      role: row.role,
      erp_user_id: row.user_id,
      username: row.username
    };
    const userMetadata = {
      full_name: row.full_name,
      username: row.username,
      phone: row.phone || '',
      role: row.role,
      erp_user_id: row.user_id
    };

    let matchedAuth =
      (row.auth_user_id && authById.get(row.auth_user_id)) ||
      authByEmail.get(cleanEmail);

    let authUserId = matchedAuth?.id || null;

    if (!matchedAuth) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPass,
        email_confirm: true,
        app_metadata: appMetadata,
        user_metadata: userMetadata
      });
      if (createErr) {
        console.error(`   ! Failed creating auth user for ${cleanEmail}:`, createErr.message);
        continue;
      }
      authUserId = created.user.id;
      console.log(`   + Created auth.users entry: ${cleanEmail} (${row.role}) -> ${authUserId}`);
    } else {
      const { error: updErr } = await supabase.auth.admin.updateUserById(matchedAuth.id, {
        email: cleanEmail,
        password: cleanPass,
        email_confirm: true,
        app_metadata: { ...(matchedAuth.app_metadata || {}), ...appMetadata },
        user_metadata: { ...(matchedAuth.user_metadata || {}), ...userMetadata }
      });
      if (updErr) {
        console.error(`   ! Failed updating auth user for ${cleanEmail}:`, updErr.message);
        continue;
      }
      console.log(`   = Synced auth.users entry: ${cleanEmail} (${row.role}) -> ${authUserId}`);
    }

    const dbPatch = {};
    if (row.auth_user_id !== authUserId) dbPatch.auth_user_id = authUserId;
    if (!row.email) dbPatch.email = cleanEmail;
    if (Object.keys(dbPatch).length > 0) {
      const { error: linkErr } = await supabase
        .from('users_accounts')
        .update(dbPatch)
        .eq('user_id', row.user_id);
      if (linkErr) {
        console.error(`   ! Failed linking auth_user_id on user #${row.user_id}:`, linkErr.message);
        continue;
      }
    }
    syncedCount += 1;
  }

  console.log(`Done! Synced ${syncedCount} users between public.users_accounts and Supabase Auth.`);
}

syncUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });

