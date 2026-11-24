require('dotenv').config();
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const PG_CONNECTION =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qummnlgfaduqnkxbvzjx:sajnikerai18@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const supabaseUrl = process.env.SUPABASE_URL || 'https://qummnlgfaduqnkxbvzjx.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required in .env');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function createVerifyClient() {
  const key = supabaseAnonKey || supabaseServiceKey;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function makeUsernameFromSupplier(sup) {
  const base = String(sup.supplier_name || sup.email || `supplier${sup.supplier_id}`)
    .toLowerCase()
    .replace(/\b(ltd|limited|kenya|east africa|dist|enterprise|ent)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  return base || `supplier${sup.supplier_id}`;
}

const DEFAULT_SUPPLIER_PASSWORD = 'supplier123';

const KNOWN_USERNAMES = {
  1: 'philips',
  2: 'schneider',
  3: 'metsec',
  4: 'shreerang'
};

async function main() {
  const pg = new Client({
    connectionString: PG_CONNECTION,
    ssl: { rejectUnauthorized: false }
  });
  await pg.connect();
  console.log('Connected to Supabase PostgreSQL...');

  // 1. Add username and password columns on public.suppliers with default 'supplier123'
  await pg.query(`
    ALTER TABLE public.suppliers
      ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS password TEXT DEFAULT 'supplier123';
    ALTER TABLE public.suppliers
      ALTER COLUMN password SET DEFAULT 'supplier123';
  `);
  console.log('Columns username and password (default: supplier123) ensured on public.suppliers.');

  const { rows: suppliers } = await pg.query('SELECT * FROM public.suppliers ORDER BY supplier_id ASC');
  const usedUsernames = new Set();

  for (const sup of suppliers) {
    const supId = Number(sup.supplier_id);
    const email = String(sup.email || '').trim().toLowerCase();

    let username = KNOWN_USERNAMES[supId] ||
      (sup.username ? String(sup.username).trim().toLowerCase() : makeUsernameFromSupplier(sup));
    if (usedUsernames.has(username)) {
      username = `${username}${supId}`;
    }
    usedUsernames.add(username);

    const finalPassword = DEFAULT_SUPPLIER_PASSWORD;

    // Ensure Supabase Auth account exists and password matches
    let authUserId = sup.auth_user_id || null;
    if (email) {
      if (!authUserId) {
        const { data: listRes } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const hit = (listRes?.users || []).find(u => String(u.email || '').toLowerCase() === email);
        authUserId = hit ? hit.id : null;
      }

      if (!authUserId) {
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true,
          app_metadata: { role: 'supplier', supplier_id: supId, username },
          user_metadata: {
            full_name: sup.contact_person || sup.supplier_name,
            company_name: sup.supplier_name,
            username
          }
        });
        if (createErr) throw createErr;
        authUserId = created.user.id;
      } else {
        await adminClient.auth.admin.updateUserById(authUserId, {
          email,
          password: finalPassword,
          email_confirm: true,
          ban_duration: String(sup.status || 'active').toLowerCase() === 'active' ? 'none' : '876000h',
          app_metadata: { role: 'supplier', supplier_id: supId, username },
          user_metadata: {
            full_name: sup.contact_person || sup.supplier_name,
            company_name: sup.supplier_name,
            username
          }
        });
      }
    }

    await pg.query(
      `UPDATE public.suppliers
       SET username = $1,
           password = $2,
           auth_user_id = COALESCE($3, auth_user_id),
           updated_at = NOW()
       WHERE supplier_id = $4`,
      [username, finalPassword, authUserId, supId]
    );
  }

  const { rows: synced } = await pg.query(
    'SELECT supplier_id, supplier_name, supplier_code, username, email, password, status FROM public.suppliers ORDER BY supplier_id ASC'
  );
  console.log('\n--- Synced Supplier Credentials in Database ---');
  console.table(synced);

  await pg.end();
}

main().catch(err => {
  console.error('Supplier credential sync failed:', err);
  process.exit(1);
});
