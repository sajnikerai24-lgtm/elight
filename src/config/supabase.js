require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://qummnlgfaduqnkxbvzjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from environment.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

/**
 * Create a request-scoped Supabase client authenticated with the logged-in user's JWT
 * so PostgreSQL Row Level Security (RLS) policies are enforced at the database layer.
 */
supabase.createUserClient = function createUserClient(accessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
};

/**
 * Create an isolated ephemeral Supabase Auth client for signInWithPassword / refreshSession
 * so the shared service_role singleton client's Authorization context is never mutated.
 */
supabase.createAuthClient = function createAuthClient() {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
};

module.exports = supabase;
