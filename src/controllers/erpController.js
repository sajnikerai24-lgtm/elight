const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');
const { buildOfficialReceiptPdf } = require('../utils/pdfReceiptGenerator');
const { readJsonFile, writeJsonFile } = require('../utils/jsonStore');
const { validatePaymentReference, validateBankAccountNumber } = require('../utils/paymentValidation');
const { sortByLatest } = require('../utils/sortLatest');
const moduleNotifications = require('../utils/moduleNotifications');

const SETTINGS_PATH = path.join(__dirname, '../config/system_settings.json');
const CASHIER_ORDERS_PATH = path.join(__dirname, '../config/cashier_orders.json');
const FINANCE_RECORDS_PATH = path.join(__dirname, '../config/finance_records.json');
const SERVICE_REQUESTS_PATH = path.join(__dirname, '../config/service_requests.json');
const BOOKINGS_PATH = path.join(__dirname, '../config/bookings_data.json');
const DISPATCHES_PATH = path.join(__dirname, '../config/dispatches.json');

function readDispatches() {
  const parsed = readJsonFile(DISPATCHES_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeDispatches(dispatches) {
  writeJsonFile(DISPATCHES_PATH, dispatches);
}

async function findSupabaseAuthUserByEmail(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users) return null;
    const hit = data.users.find(u => String(u.email || '').trim().toLowerCase() === cleanEmail);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

async function ensureSupabaseAuthUser(userRecord, rawPassword) {
  const cleanEmail = String(userRecord.email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('User email is required for Supabase authentication.');
  }
  const cleanPass = String(rawPassword || userRecord.password || 'elight123').trim();
  const appMetadata = {
    role: userRecord.role,
    erp_user_id: userRecord.user_id,
    username: userRecord.username
  };
  const userMetadata = {
    full_name: userRecord.full_name,
    username: userRecord.username,
    phone: userRecord.phone || '',
    role: userRecord.role,
    erp_user_id: userRecord.user_id,
    ...(userRecord.location ? { location: userRecord.location } : {})
  };

  let existingAuth = null;
  if (userRecord.auth_user_id) {
    const { data } = await supabase.auth.admin.getUserById(userRecord.auth_user_id);
    existingAuth = data?.user || null;
  }
  if (!existingAuth) {
    existingAuth = await findSupabaseAuthUserByEmail(cleanEmail);
  }

  let authUserId = existingAuth?.id || null;
  if (!existingAuth) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPass,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: userMetadata
    });
    if (error) throw error;
    authUserId = data.user.id;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(existingAuth.id, {
      email: cleanEmail,
      password: cleanPass,
      email_confirm: true,
      app_metadata: { ...(existingAuth.app_metadata || {}), ...appMetadata },
      user_metadata: { ...(existingAuth.user_metadata || {}), ...userMetadata }
    });
    if (error) throw error;
  }

  if (userRecord.user_id && authUserId && userRecord.auth_user_id !== authUserId) {
    await supabase
      .from('users_accounts')
      .update({ auth_user_id: authUserId })
      .eq('user_id', userRecord.user_id);
  }
  return authUserId;
}

function readFinanceRecords() {
  const parsed = readJsonFile(FINANCE_RECORDS_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeFinanceRecords(records) {
  writeJsonFile(FINANCE_RECORDS_PATH, records);
}

function normalizeKenyanPhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (/^254[71]\d{8}$/.test(digits)) return digits;
  if (/^0[71]\d{8}$/.test(digits)) return '254' + digits.slice(1);
  if (/^[71]\d{8}$/.test(digits)) return '254' + digits;
  return null;
}

function generateMpesaReceiptCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'SLK';
  for (let i = 0; i < 7; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function readCashierOrders() {
  const parsed = readJsonFile(CASHIER_ORDERS_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeCashierOrders(orders) {
  writeJsonFile(CASHIER_ORDERS_PATH, orders);
}

function readServiceRequests() {
  const parsed = readJsonFile(SERVICE_REQUESTS_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeServiceRequests(requests) {
  writeJsonFile(SERVICE_REQUESTS_PATH, requests);
}

function readSystemConfig() {
  const parsed = readJsonFile(SETTINGS_PATH, null);
  if (parsed && typeof parsed === 'object') return parsed;
  return {
    settings: {
      shop_name: 'Elight Electrical Shop',
      operating_region: 'Meru County Only',
      official_email: 'elightelectrical@ke.com',
      official_phone: '+254 700 123 456',
      mpesa_till: '5894210',
      meru_town_delivery_fee: 300,
      meru_subcounty_delivery_fee: 500,
      low_stock_threshold: 5,
      allow_customer_registration: true,
      enforce_suspended_block: true
    },
    role_permissions: {
      cashier: ['cashier', 'new_sale', 'feedback', 'help'],
      technician: ['technicians', 'feedback', 'help'],
      inventory_manager: ['inventory', 'feedback', 'help'],
      service_manager: ['services', 'bookings', 'feedback', 'help'],
      finance_manager: ['finance', 'reports', 'feedback', 'help'],
      dispatch_manager: ['dispatch', 'bookings', 'feedback', 'help'],
      driver: ['driver', 'feedback', 'help']
    },
    audit_log: []
  };
}

function writeSystemConfig(cfg) {
  writeJsonFile(SETTINGS_PATH, cfg);
}

function appendAuditLog(action, details, actor = 'System Administrator', department = 'Admin & Security') {
  const cfg = readSystemConfig();
  if (!Array.isArray(cfg.audit_log)) cfg.audit_log = [];
  cfg.audit_log.unshift({
    timestamp: new Date().toISOString(),
    department,
    actor,
    action,
    details
  });
  if (cfg.audit_log.length > 100) cfg.audit_log = cfg.audit_log.slice(0, 100);
  writeSystemConfig(cfg);
}

/**
 * Normalizes order pipeline fields while keeping delivery_status and installation_status
 * strictly independent so customers can receive products without requesting installation.
 */
function normalizeOrderDualStatuses(o) {
  const total = Number(o.total_amount || 0);
  const paid = o.amount_paid !== undefined ? Number(o.amount_paid) : (o.payment_status === 'paid' ? total : 0);
  const balance = o.balance_due !== undefined ? Number(o.balance_due) : Math.max(0, total - paid);
  const hasUnpaid = balance > 0;
  const isServiceOrder = o.fulfillment_type === 'service_only' || o.fulfillment_mode === 'service' || /service booking/i.test(String(o.source || ''));
  const fType = o.fulfillment_type || (isServiceOrder ? 'service_only' : (o.fulfillment_mode === 'collection' ? 'product_collection' : 'product_delivery'));

  let relStatus = o.finance_release_status;
  if (!relStatus) {
    if (!o.cashier_served && o.source === 'Online Customer Order' && paid === 0) relStatus = 'awaiting_cashier';
    else if (hasUnpaid) relStatus = 'pending_credit_review';
    else if (['delivered', 'collected', 'installed_and_completed'].includes(o.fulfillment_status)) relStatus = 'released';
    else relStatus = 'pending_finance';
  }

  let stage = o.fulfillment_stage;
  if (!stage || (relStatus === 'awaiting_cashier' && stage !== 'cashier')) {
    if (relStatus === 'awaiting_cashier') {
      stage = 'cashier';
    } else if (relStatus === 'released') {
      if (['delivered', 'collected', 'installed_and_completed'].includes(o.fulfillment_status)) stage = 'completed';
      else if (fType === 'service_only') stage = 'installation';
      else if (fType === 'product_collection') stage = 'collection';
      else stage = 'delivery';
    } else {
      stage = 'finance';
    }
  }

  const orderNo = o.order_no || o.order_number;
  const invoiceNo = o.invoice_no || `INV-${String(orderNo || '').replace(/^EL-/, '') || Date.now().toString().slice(-6)}`;

  let ordStatus = o.order_status || o.status || 'processing';
  if (o.status === 'cancelled' || o.order_status === 'cancelled') ordStatus = 'cancelled';
  else if (relStatus === 'awaiting_cashier') ordStatus = 'awaiting_cashier';
  else if (['delivered', 'collected', 'installed_and_completed'].includes(o.fulfillment_status) || stage === 'completed') ordStatus = 'completed';
  else if (o.fulfillment_status === 'ready_for_collection') ordStatus = 'ready';

  let payStatus = o.payment_status;
  if (relStatus === 'payment_failed') payStatus = 'failed';
  else if (relStatus === 'awaiting_cashier') payStatus = 'pending';
  else if (!payStatus || payStatus === 'pending') {
    if (paid === 0) payStatus = 'unpaid';
    else if (relStatus === 'released') payStatus = hasUnpaid ? 'partially_paid' : 'paid';
    else payStatus = 'pending_verification';
  }

  // Independent Delivery Status
  let delStatus = o.delivery_status;
  if (o.status === 'cancelled' || o.order_status === 'cancelled') {
    delStatus = 'cancelled';
  } else if (!delStatus) {
    if (fType === 'product_collection') {
      delStatus = ['collected', 'completed', 'delivered'].includes(o.fulfillment_status) ? 'delivered' : 'not_scheduled';
    } else if (relStatus === 'released') {
      if (['delivered', 'installed_and_completed'].includes(o.fulfillment_status)) delStatus = 'delivered';
      else if (o.fulfillment_status === 'out_for_delivery') delStatus = 'out_for_delivery';
      else delStatus = 'scheduled';
    } else {
      delStatus = 'not_scheduled';
    }
  }

  // Independent Installation Status (remains 'not_requested' unless explicitly requested)
  const needsInst = Boolean(
    o.requires_installation ||
    fType === 'product_delivery_install' ||
    fType === 'product_install_later' ||
    (o.installation_status && o.installation_status !== 'not_requested')
  );
  let instStatus = o.installation_status;
  if (o.status === 'cancelled' || o.order_status === 'cancelled') {
    instStatus = 'cancelled';
  } else if (!instStatus) {
    if (!needsInst) {
      instStatus = 'not_requested';
    } else if (o.fulfillment_status === 'installed_and_completed') {
      instStatus = 'completed';
    } else if (relStatus === 'released') {
      instStatus = 'approved';
    } else {
      instStatus = 'requested';
    }
  }

  return {
    ...o,
    order_no: orderNo,
    order_number: orderNo,
    invoice_no: invoiceNo,
    order_status: ordStatus,
    status: ordStatus,
    payment_status: payStatus,
    delivery_status: delStatus,
    installation_status: instStatus,
    requires_installation: needsInst,
    packing_status: o.packing_status || 'pending',
    site_ready_for_installation: Boolean(o.site_ready_for_installation || delStatus === 'delivered' || fType === 'product_collection'),
    fulfillment_type: fType,
    total_amount: total,
    amount_paid: paid,
    balance_due: balance,
    unpaid_balance: hasUnpaid,
    finance_release_status: relStatus,
    fulfillment_stage: stage
  };
}

function calculateTreasuryBalances(records, customSettings) {
  const cfg = readSystemConfig();
  const settings = customSettings || cfg.settings || {};
  const treasury = settings.treasury_accounts || {
    opening_cash: 15000,
    opening_mpesa: 65000,
    opening_bank: 350000,
    bank_name: 'Equity Bank - Meru Branch',
    bank_account_no: '014028394012',
    mpesa_till: '5894210'
  };

  let cashInflow = 0, cashOutflow = 0;
  let mpesaInflow = 0, mpesaOutflow = 0;
  let bankInflow = 0, bankOutflow = 0;

  (records || []).forEach(r => {
    if (String(r.status || '').toLowerCase() === 'cancelled') return;
    const amt = Number(r.amount || 0);
    const method = String(r.payment_method || '').toLowerCase();
    const isSale = (r.type === 'sale' || r.type === 'income');
    const isExpense = (r.type === 'expense');

    if (method.includes('cash')) {
      if (isSale) cashInflow += amt;
      else if (isExpense) cashOutflow += amt;
    } else if (method.includes('bank') || method.includes('transfer') || method.includes('cheque') || method.includes('eft') || method.includes('rtgs')) {
      if (isSale) bankInflow += amt;
      else if (isExpense) bankOutflow += amt;
    } else {
      // Default to M-Pesa / Till
      if (isSale) mpesaInflow += amt;
      else if (isExpense) mpesaOutflow += amt;
    }
  });

  const cashOpening = Number(treasury.opening_cash || 0);
  const mpesaOpening = Number(treasury.opening_mpesa || 0);
  const bankOpening = Number(treasury.opening_bank || 0);

  const cashBalance = cashOpening + cashInflow - cashOutflow;
  const mpesaBalance = mpesaOpening + mpesaInflow - mpesaOutflow;
  const bankBalance = bankOpening + bankInflow - bankOutflow;
  const totalLiquid = cashBalance + mpesaBalance + bankBalance;

  return {
    cash: {
      account_name: 'Cash in Hand (Counter Float)',
      account_desc: 'Physical Cash Drawer at Showroom Counter',
      payment_method_tag: 'Cash',
      opening: cashOpening,
      inflow: cashInflow,
      outflow: cashOutflow,
      balance: cashBalance
    },
    mpesa: {
      account_name: 'M-Pesa Business Till',
      account_desc: `Safaricom Buy Goods Till #${treasury.mpesa_till || '5894210'}`,
      till_number: treasury.mpesa_till || '5894210',
      payment_method_tag: 'M-Pesa',
      opening: mpesaOpening,
      inflow: mpesaInflow,
      outflow: mpesaOutflow,
      balance: mpesaBalance
    },
    bank: {
      account_name: treasury.bank_name || 'Equity Bank - Meru Branch',
      account_desc: `Current Operating Account #${treasury.bank_account_no || '014028394012'}`,
      bank_name: treasury.bank_name || 'Equity Bank - Meru Branch',
      account_number: treasury.bank_account_no || '014028394012',
      payment_method_tag: 'Bank Transfer',
      opening: bankOpening,
      inflow: bankInflow,
      outflow: bankOutflow,
      balance: bankBalance
    },
    total_liquid_balance: totalLiquid,
    treasury_accounts: treasury
  };
}

/**
 * Validates that an account phone number contains strictly 10 digits (not below or above 10 digits).
 */
function validateAccountPhone(rawPhone, { required = true } = {}) {
  const str = String(rawPhone === undefined || rawPhone === null ? '' : rawPhone).trim();
  if (!str) {
    if (required) {
      return { valid: false, value: '', message: 'Phone number is required and must be exactly 10 digits.' };
    }
    return { valid: true, value: '' };
  }
  if (/[a-zA-Z]/.test(str)) {
    return { valid: false, value: '', message: 'Phone number must contain exactly 10 digits (numbers only).' };
  }
  const digits = str.replace(/[\s()-]/g, '');
  if (!/^\d{10}$/.test(digits)) {
    return {
      valid: false,
      value: digits,
      message: 'Phone number must be exactly 10 digits (cannot be below 10 or above 10 digits, e.g. 0712345678).'
    };
  }
  return { valid: true, value: digits };
}

const erpController = {
  // ==========================================
  // AUTHENTICATION & DEMO ACCOUNTS
  // ==========================================
  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Please provide username, email, or phone and password.' });
      }

      const rawIdentifier = String(username).trim();
      let cleanIdentifier = rawIdentifier.toLowerCase();
      const cleanPass = String(password).trim();

      // Normalize phone digits cleanly (supports 07..., +2547..., 2547..., spaces/dashes, or stored non-10-digit phones)
      const digitsOnly = cleanIdentifier.replace(/\D/g, '');
      const normalizedDigits = (digitsOnly.startsWith('254') && digitsOnly.length === 12)
        ? ('0' + digitsOnly.slice(3))
        : digitsOnly;

      const { data: allAccounts, error } = await supabase
        .from('users_accounts')
        .select('*')
        .order('user_id', { ascending: true });

      if (error) {
        console.error('Login DB query error:', error);
        return res.status(500).json({ success: false, message: 'Database error verifying user account.' });
      }

      const normalizeStoredPhone = (ph) => {
        const d = String(ph || '').replace(/\D/g, '');
        return (d.startsWith('254') && d.length === 12) ? ('0' + d.slice(3)) : d;
      };
      const normalizeName = (nm) => String(nm || '').replace(/\s*\([^)]*\)\s*$/i, '').trim().toLowerCase();

      const matches = (allAccounts || []).filter(acc => {
        const uName = String(acc.username || '').trim().toLowerCase();
        const uEmail = String(acc.email || '').trim().toLowerCase();
        const uPhone = String(acc.phone || '').trim().toLowerCase();
        const uPhoneNorm = normalizeStoredPhone(acc.phone);
        const uFull = String(acc.full_name || '').trim().toLowerCase();
        const uFullBase = normalizeName(acc.full_name);

        if (uName === cleanIdentifier || uEmail === cleanIdentifier || uFull === cleanIdentifier || (uFullBase && uFullBase === cleanIdentifier)) {
          return true;
        }
        if (/^[\d+\s-]+$/.test(rawIdentifier) && digitsOnly.length >= 4) {
          return uPhone === cleanIdentifier || uPhoneNorm === normalizedDigits || uPhoneNorm === digitsOnly;
        }
        return false;
      });

      if (matches.length === 0) {
        const { data: sups } = await supabase
          .from('suppliers')
          .select('supplier_id, username, email, supplier_name')
          .limit(50);
        const supHit = (sups || []).find(s =>
          String(s.username || '').trim().toLowerCase() === cleanIdentifier ||
          String(s.email || '').trim().toLowerCase() === cleanIdentifier
        );
        if (supHit) {
          return res.status(403).json({
            success: false,
            message: 'This is a Supplier account. Please sign in at the Supplier Portal (/supplier-login).'
          });
        }
        return res.status(401).json({ success: false, message: 'Invalid username, email, or phone number.' });
      }

      const sysCfg = readSystemConfig();
      const nonPendingMatches = matches.filter(u => !['pending', 'pending_approval'].includes(String(u.status || '').toLowerCase()));
      if (nonPendingMatches.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Your customer account is awaiting Administrator approval. Please try again after approval.'
        });
      }

      const nonRejectedMatches = nonPendingMatches.filter(u => String(u.status || '').toLowerCase() !== 'rejected');
      if (nonRejectedMatches.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Your account registration was declined by the System Administrator.'
        });
      }

      const activeMatches = nonRejectedMatches.filter(u =>
        !(sysCfg.settings?.enforce_suspended_block !== false && String(u.status || 'active').toLowerCase() === 'suspended')
      );
      if (activeMatches.length === 0) {
        return res.status(403).json({ success: false, message: 'This user account is currently suspended. Contact the System Administrator.' });
      }

      let matchedUser = null;
      let authData = null;
      let authErr = null;

      for (const candidate of activeMatches) {
        const authEmail = String(candidate.email || '').trim().toLowerCase();
        if (!authEmail) continue;

        let attempt = await supabase
          .createAuthClient()
          .auth.signInWithPassword({ email: authEmail, password: cleanPass });

        // Auto-repair Supabase Auth sync if DB row password matches
        if ((attempt.error || !attempt.data?.session) && candidate.password && String(candidate.password) === cleanPass) {
          try {
            await ensureSupabaseAuthUser(candidate, cleanPass);
            attempt = await supabase
              .createAuthClient()
              .auth.signInWithPassword({ email: authEmail, password: cleanPass });
          } catch (syncErr) {
            console.error('Supabase Auth sync error during login:', syncErr.message);
          }
        }

        if (!attempt.error && attempt.data?.session && attempt.data?.user) {
          matchedUser = candidate;
          authData = attempt.data;
          authErr = null;
          break;
        }
        authErr = attempt.error;
      }

      if (authErr || !matchedUser || !authData?.session || !authData?.user) {
        return res.status(401).json({ success: false, message: 'Invalid password. Check credentials.' });
      }

      const user = matchedUser;
      const authEmail = String(user.email || '').trim().toLowerCase();

      if (!user.auth_user_id && authData.user.id) {
        await supabase
          .from('users_accounts')
          .update({ auth_user_id: authData.user.id })
          .eq('user_id', user.user_id);
      }

      const token = authData.session.access_token;
      const safeUser = {
        user_id: user.user_id,
        auth_user_id: authData.user.id,
        full_name: user.full_name,
        username: user.username || cleanIdentifier,
        email: authEmail,
        role: user.role,
        phone: user.phone || ''
      };

      appendAuditLog(
        'User Sign-In',
        `${safeUser.full_name} signed in via Supabase Auth with role "${safeUser.role}".`,
        safeUser.full_name,
        'Admin & Security'
      );

      return res.json({
        success: true,
        message: `Welcome back, ${safeUser.full_name}!`,
        user: safeUser,
        token,
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_at: authData.session.expires_at
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Server error processing login.' });
    }
  },

  getDemoAccounts: async (req, res) => {
    res.json({
      success: true,
      accounts: [],
      message: 'Quick access demo accounts are disabled. Sign in using your database credentials.'
    });
  },

  registerCustomer: async (req, res) => {
    try {
      const sysCfg = readSystemConfig();
      if (sysCfg.settings?.allow_customer_registration === false) {
        return res.status(403).json({ success: false, message: 'Customer self-registration is currently disabled by the System Administrator.' });
      }

      const { full_name, phone, email, location, password } = req.body;
      if (!full_name || !phone || !password) {
        return res.status(400).json({ success: false, message: 'Please provide full name, phone number, and password.' });
      }

      const phoneCheck = validateAccountPhone(phone, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({
          success: false,
          message: phoneCheck.message
        });
      }
      const cleanPhone = phoneCheck.value;

      const cleanEmail = email ? String(email).trim().toLowerCase() : `${cleanPhone}@customer.elight.co.ke`;
      const cleanName = String(full_name).trim();
      const cleanPass = String(password).trim();
      if (cleanPass.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
      }
      const cleanLocation = location ? String(location).trim() : 'Meru, Meru County';
      const cleanUsername = email ? cleanEmail.split('@')[0] : cleanPhone;

      // 1. Check if user already exists
      const { data: existingUser } = await supabase
        .from('users_accounts')
        .select('user_id, status')
        .or(`email.eq.${cleanEmail},phone.eq.${cleanPhone}`)
        .limit(1);

      if (existingUser && existingUser.length > 0) {
        const existingStatus = String(existingUser[0].status || '').toLowerCase();
        if (existingStatus === 'pending' || existingStatus === 'pending_approval') {
          return res.status(400).json({
            success: false,
            message: 'A registration request with this phone or email is already pending Administrator approval.'
          });
        }
        if (existingStatus === 'rejected') {
          return res.status(400).json({
            success: false,
            message: 'This registration request was declined. Please contact the System Administrator.'
          });
        }
        return res.status(400).json({ success: false, message: 'An account with this phone or email already exists. Please log in.' });
      }

      // 2. Provision Supabase Auth account in locked state until Administrator approves
      const authUserId = await ensureSupabaseAuthUser(
        {
          full_name: cleanName,
          email: cleanEmail,
          username: cleanUsername,
          phone: cleanPhone,
          role: 'customer',
          location: cleanLocation
        },
        cleanPass
      );
      if (authUserId) {
        await supabase.auth.admin.updateUserById(authUserId, { ban_duration: '876000h' });
      }

      // 3. Insert into users_accounts with pending_approval status (no active customer row or session yet)
      const { data: newUser, error: userErr } = await supabase
        .from('users_accounts')
        .insert([{
          full_name: cleanName,
          email: cleanEmail,
          username: cleanUsername,
          password: cleanPass,
          role: 'customer',
          phone: cleanPhone,
          status: 'pending_approval',
          auth_user_id: authUserId
        }])
        .select();

      if (userErr) throw userErr;

      const createdUser = newUser[0];
      // Sync erp_user_id onto Supabase Auth metadata while keeping account locked until approval
      await ensureSupabaseAuthUser({ ...createdUser, location: cleanLocation }, cleanPass);

      appendAuditLog(
        'Customer Registration Pending Approval',
        `${cleanName} (${cleanPhone}, ${cleanEmail}, ${cleanLocation}) requested a customer account and requires Administrator approval.`,
        cleanName,
        'Admin & Security'
      );

      moduleNotifications.notify({
        targetModules: ['admin'],
        sourceModule: 'admin',
        senderName: cleanName,
        title: `Customer Approval Required: ${cleanName}`,
        message: `${cleanName} (${cleanPhone}, ${cleanEmail}) requested a new customer account. Approve or decline in User Accounts.`,
        severity: 'warning',
        refNo: cleanPhone,
        actionModule: 'admin'
      });

      return res.status(201).json({
        success: true,
        pending_approval: true,
        status: 'pending_approval',
        message: `Registration submitted for ${cleanName}. Your account requires Administrator approval before you can sign in.`
      });
    } catch (err) {
      console.error('Customer registration error:', err);
      res.status(500).json({ success: false, message: err.message || 'Registration failed.' });
    }
  },

  // ==========================================
  // ADMINISTRATIVE GOVERNANCE MODULE
  // ==========================================
  getUsers: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('users_accounts')
        .select('user_id, full_name, username, email, role, phone, status, created_at, auth_user_id')
        .order('user_id', { ascending: false });
      if (error) throw error;

      const users = sortByLatest(Array.isArray(data) ? data : [], 'user_id');
      res.json({ success: true, count: users.length, users });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  createUser: async (req, res) => {
    try {
      const { full_name, username, email, role, phone, password, actor } = req.body;
      if (!full_name || (!email && !username)) {
        return res.status(400).json({ success: false, message: 'Full name and email or username are required.' });
      }

      const cleanName = String(full_name).trim();
      const cleanEmail = email ? String(email).trim().toLowerCase() : `${String(username).trim().toLowerCase()}@elight.co.ke`;
      const cleanUsername = username
        ? String(username).trim().toLowerCase()
        : cleanEmail.split('@')[0].trim().toLowerCase();
      const cleanPassword = password ? String(password).trim() : 'elight123';
      if (cleanPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
      }
      const cleanRole = String(role || 'cashier').trim().toLowerCase();
      const phoneCheck = validateAccountPhone(phone, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({ success: false, message: phoneCheck.message });
      }
      const cleanPhone = phoneCheck.value;

      const authUserId = await ensureSupabaseAuthUser(
        {
          full_name: cleanName,
          email: cleanEmail,
          username: cleanUsername,
          phone: cleanPhone,
          role: cleanRole
        },
        cleanPassword
      );

      const { data, error } = await supabase
        .from('users_accounts')
        .insert([{
          full_name: cleanName,
          email: cleanEmail,
          username: cleanUsername,
          password: cleanPassword,
          role: cleanRole,
          phone: cleanPhone,
          status: 'active',
          auth_user_id: authUserId
        }])
        .select('user_id, full_name, username, email, role, phone, status, created_at, auth_user_id');
      if (error) throw error;

      await ensureSupabaseAuthUser(data[0], cleanPassword);

      appendAuditLog(
        'User Account Created',
        `Created ${cleanRole} account for ${cleanName} (@${cleanUsername}) synced to Supabase Auth.`,
        actor || 'Administrator'
      );

      res.status(201).json({ success: true, user: data[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  updateUserRole: async (req, res) => {
    try {
      const { id } = req.params;
      const { role, status, password, full_name, phone, actor } = req.body;
      const updates = {};
      if (role !== undefined && role !== '') updates.role = String(role).trim().toLowerCase();
      if (status !== undefined && status !== '') updates.status = String(status).trim().toLowerCase();
      if (password !== undefined && String(password).trim() !== '') {
        const trimmedPass = String(password).trim();
        if (trimmedPass.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }
        updates.password = trimmedPass;
      }
      if (full_name !== undefined && String(full_name).trim() !== '') updates.full_name = String(full_name).trim();
      if (phone !== undefined) {
        const phoneCheck = validateAccountPhone(phone, { required: true });
        if (!phoneCheck.valid) {
          return res.status(400).json({ success: false, message: phoneCheck.message });
        }
        updates.phone = phoneCheck.value;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No account fields provided to update.' });
      }

      const { data: previousUser } = await supabase
        .from('users_accounts')
        .select('user_id, status, role')
        .eq('user_id', id)
        .maybeSingle();

      const { data, error } = await supabase
        .from('users_accounts')
        .update(updates)
        .eq('user_id', id)
        .select();
      if (error) throw error;

      const updatedUser = data && data[0] ? data[0] : null;
      if (!updatedUser) {
        return res.status(404).json({ success: false, message: `User #${id} not found.` });
      }

      let authLocation = '';
      if (updatedUser.email) {
        const authUserId = await ensureSupabaseAuthUser(updatedUser, updates.password || updatedUser.password);
        if (authUserId) {
          const { data: authDetails } = await supabase.auth.admin.getUserById(authUserId).catch(() => ({ data: null }));
          authLocation = authDetails?.user?.user_metadata?.location || '';
          if (updates.status) {
            const shouldLock = ['suspended', 'rejected', 'pending', 'pending_approval'].includes(updates.status);
            await supabase.auth.admin.updateUserById(authUserId, {
              ban_duration: shouldLock ? '876000h' : 'none'
            });
          }
        }
      }

      const prevStatus = String(previousUser?.status || '').toLowerCase();
      const wasPending = prevStatus === 'pending' || prevStatus === 'pending_approval';
      if (wasPending && updates.status === 'active' && String(updatedUser.role || '').toLowerCase() === 'customer') {
        const cleanEmail = String(updatedUser.email || '').trim().toLowerCase();
        const cleanPhone = String(updatedUser.phone || '').trim();
        const filterClauses = [
          cleanEmail ? `email.eq.${cleanEmail}` : '',
          cleanPhone ? `phone.eq.${cleanPhone}` : ''
        ].filter(Boolean);

        let existingCust = [];
        if (filterClauses.length > 0) {
          const { data: custHits } = await supabase
            .from('customers')
            .select('customer_id')
            .or(filterClauses.join(','))
            .limit(1);
          existingCust = custHits || [];
        }

        if (existingCust.length === 0) {
          await supabase
            .from('customers')
            .insert([{
              full_name: updatedUser.full_name,
              phone: cleanPhone,
              email: cleanEmail,
              location: authLocation || 'Meru, Meru County',
              notes: `Approved by ${actor || 'Administrator'}`
            }]);
        }

        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'admin',
          senderName: actor || 'System Administrator',
          title: 'Customer Account Approved',
          message: `Welcome ${updatedUser.full_name}! Your Elight Electrical customer account has been approved and is now active.`,
          severity: 'success',
          refNo: cleanPhone || `USR-${id}`,
          recipientPhone: cleanPhone,
          recipientEmail: cleanEmail,
          recipientName: updatedUser.full_name
        });
      }

      const { password: _omitted, ...safeUser } = updatedUser;
      const changeSummary = Object.keys(updates)
        .map(k => (k === 'password' ? 'password reset' : `${k} → ${updates[k]}`))
        .join(', ');

      appendAuditLog(
        'User Account / Role Updated',
        `${safeUser.full_name} (#${id}): ${changeSummary}`,
        actor || 'Administrator'
      );

      res.json({ success: true, user: safeUser });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;
      const actor = req.query.actor || req.body?.actor || 'Administrator';

      const { data: existing } = await supabase
        .from('users_accounts')
        .select('full_name, role, auth_user_id')
        .eq('user_id', id)
        .maybeSingle();

      const { error } = await supabase
        .from('users_accounts')
        .delete()
        .eq('user_id', id);
      if (error) throw error;

      if (existing?.auth_user_id) {
        await supabase.auth.admin.deleteUser(existing.auth_user_id).catch(() => null);
      }

      appendAuditLog(
        'User Account Removed',
        `Deleted user #${id}${existing ? ` (${existing.full_name} - ${existing.role})` : ''}.`,
        actor
      );

      res.json({ success: true, message: 'User account removed successfully.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getSystemSettings: async (req, res) => {
    try {
      const cfg = readSystemConfig();
      res.json({
        success: true,
        settings: cfg.settings || {},
        role_permissions: cfg.role_permissions || {}
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  updateSystemSettings: async (req, res) => {
    try {
      const { settings, role_permissions, actor } = req.body;
      const cfg = readSystemConfig();
      const updatedAreas = [];

      if (settings && typeof settings === 'object') {
        cfg.settings = { ...(cfg.settings || {}), ...settings };
        updatedAreas.push('system settings');
      }
      if (role_permissions && typeof role_permissions === 'object') {
        cfg.role_permissions = { ...(cfg.role_permissions || {}), ...role_permissions };
        updatedAreas.push('role permissions matrix');
      }

      if (!Array.isArray(cfg.audit_log)) cfg.audit_log = [];
      cfg.audit_log.unshift({
        timestamp: new Date().toISOString(),
        department: 'Admin & Security',
        actor: actor || 'Administrator',
        action: 'Settings / Permissions Updated',
        details: `Updated ${updatedAreas.join(' & ') || 'configuration'} for Meru County operations.`
      });
      if (cfg.audit_log.length > 100) cfg.audit_log = cfg.audit_log.slice(0, 100);

      writeSystemConfig(cfg);

      res.json({
        success: true,
        message: 'System configuration saved successfully.',
        settings: cfg.settings,
        role_permissions: cfg.role_permissions
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getSystemActivities: async (req, res) => {
    try {
      const cfg = readSystemConfig();
      const [finRes, movRes, servRes, dispRes, bookRes, fbRes, inqRes] = await Promise.all([
        supabase.from('finance_records').select('*').order('record_id', { ascending: false }).limit(20),
        supabase.from('stock_movements').select('*').order('movement_id', { ascending: false }).limit(20),
        supabase.from('service_requests').select('*').order('request_id', { ascending: false }).limit(20),
        supabase.from('dispatches').select('*').order('dispatch_id', { ascending: false }).limit(20),
        supabase.from('bookings').select('*').order('booking_id', { ascending: false }).limit(15),
        supabase.from('customer_feedback').select('*').order('feedback_id', { ascending: false }).limit(10),
        supabase.from('contact_inquiries').select('*').order('inquiry_id', { ascending: false }).limit(10)
      ]);

      const activities = [];

      // 1. Admin & Security Audit Log
      (cfg.audit_log || []).forEach(entry => {
        activities.push({
          timestamp: entry.timestamp || new Date().toISOString(),
          department: entry.department || 'Admin & Security',
          actor: entry.actor || 'Administrator',
          action: entry.action || 'Admin Event',
          details: entry.details || ''
        });
      });

      // 2. Cashier & Finance Entries
      (finRes.data || []).forEach(r => {
        const cashierMatch = String(r.description || '').match(/\[Cashier:\s*([^\]]+)\]/i);
        const actor = cashierMatch ? `${cashierMatch[1].trim()} (Cashier)` : (r.type === 'sale' ? 'Cashier / Home' : 'Finance Desk');
        activities.push({
          timestamp: r.created_at || r.transaction_date || new Date().toISOString(),
          department: 'Cashier & Sales',
          actor,
          action: r.type === 'sale' ? `Sale Recorded (${r.payment_method || 'M-Pesa'})` : `Expense Logged (${r.category || 'Expense'})`,
          details: `KES ${Number(r.amount || 0).toLocaleString()} — ${String(r.description || '').replace(/\s*\[Cashier:[^\]]+\]/i, '')} [Ref: ${r.reference_no || 'N/A'}]`
        });
      });

      // 3. Inventory Stock Movements
      (movRes.data || []).forEach(m => {
        activities.push({
          timestamp: m.created_at || m.movement_date || new Date().toISOString(),
          department: 'Inventory',
          actor: m.recorded_by || 'Inventory Manager',
          action: m.type === 'STOCK_IN' ? 'Stock-In Restock' : (m.type === 'DAMAGE_WRITE_OFF' ? 'Damage Write-Off' : 'Stock-Out Issue'),
          details: `${m.quantity}x ${m.product_name || 'Item'}${m.reason ? ` — ${m.reason}` : ''}`
        });
      });

      // 4. Technician & Service Requests
      (servRes.data || []).forEach(s => {
        activities.push({
          timestamp: s.created_at || s.scheduled_date || new Date().toISOString(),
          department: 'Technician & Services',
          actor: s.technician_name ? `${s.technician_name} (Technician)` : 'Service Manager',
          action: `Service Job (${String(s.status || 'pending').toUpperCase()})`,
          details: `${s.service_type || 'Electrical Work'} for ${s.customer_name || 'Client'} at ${s.location || 'Meru'}`
        });
      });

      // 5. Dispatch & Driver Deliveries
      (dispRes.data || []).forEach(d => {
        activities.push({
          timestamp: d.created_at || d.scheduled_date || new Date().toISOString(),
          department: 'Dispatch & Delivery',
          actor: d.driver_name && d.driver_name !== 'Unassigned' ? `${d.driver_name} (Driver)` : 'Dispatch Manager',
          action: `Delivery ${String(d.status || 'pending').replace(/_/g, ' ').toUpperCase()}`,
          details: `Order ${d.order_no || ''} to ${d.customer_name || 'Customer'} — ${d.delivery_address || 'Meru County'}`
        });
      });

      // 6. Customer Bookings, Feedback & Inquiries
      (bookRes.data || []).forEach(b => {
        activities.push({
          timestamp: b.created_at || b.preferred_date || new Date().toISOString(),
          department: 'Customer Engagement',
          actor: b.customer_name || 'Customer',
          action: `Booking ${b.booking_ref || ''} (${String(b.status || 'pending').toUpperCase()})`,
          details: `${b.item_or_service_name || 'Booking'} (x${b.quantity || 1}) — KES ${Number(b.estimated_amount || 0).toLocaleString()}`
        });
      });

      (fbRes.data || []).forEach(f => {
        activities.push({
          timestamp: f.created_at || new Date().toISOString(),
          department: 'Customer Engagement',
          actor: f.customer_name || 'Customer',
          action: `Feedback (${f.rating || 5}★)`,
          details: f.comment || f.subject || 'Customer review submitted'
        });
      });

      (inqRes.data || []).forEach(i => {
        activities.push({
          timestamp: i.created_at || new Date().toISOString(),
          department: 'Customer Engagement',
          actor: i.full_name || i.customer_name || 'Visitor',
          action: `Contact Inquiry (${String(i.status || 'new').toUpperCase()})`,
          details: i.subject || i.message || 'Shop inquiry received'
        });
      });

      activities.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

      res.json({
        success: true,
        count: activities.length,
        activities: activities.slice(0, 120)
      });
    } catch (err) {
      console.error('System activities error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  backupDatabase: async (req, res) => {
    try {
      // Create a full JSON snapshot of all tables as a backup
      const [inv, users, cust, serv, fin, disp] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('users_accounts').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('service_requests').select('*'),
        supabase.from('finance_records').select('*'),
        supabase.from('dispatches').select('*')
      ]);

      const backupData = {
        app: 'Elight Electrical Shop',
        timestamp: new Date().toISOString(),
        tables: {
          inventory: inv.data || [],
          users_accounts: users.data || [],
          customers: cust.data || [],
          service_requests: serv.data || [],
          finance_records: fin.data || [],
          dispatches: disp.data || []
        }
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="elight_backup_${Date.now()}.json"`);
      res.json({ success: true, message: 'Backup generated successfully', backup: backupData });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // CUSTOMER MODULE
  // ==========================================
  getCustomers: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('customer_id', { ascending: false });
      if (error) throw error;
      const customers = sortByLatest(data || [], 'customer_id');
      res.json({ success: true, count: customers.length, customers });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  createCustomer: async (req, res) => {
    try {
      const { full_name, phone, email, location, notes } = req.body;
      const phoneCheck = validateAccountPhone(phone, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({ success: false, message: phoneCheck.message });
      }
      const { data, error } = await supabase
        .from('customers')
        .insert([{ full_name, phone: phoneCheck.value, email, location, notes }])
        .select();
      if (error) throw error;
      res.status(201).json({ success: true, customer: data[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getWarranties: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('warranties')
        .select('*, customers(full_name, phone)')
        .order('warranty_id', { ascending: false });
      if (error) throw error;
      const warranties = sortByLatest(data || [], 'warranty_id');
      res.json({ success: true, count: warranties.length, warranties });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  createWarranty: async (req, res) => {
    try {
      const { customer_id, product_name, serial_no, start_date, expiry_date } = req.body;
      const { data, error } = await supabase
        .from('warranties')
        .insert([{ customer_id: Number(customer_id), product_name, serial_no, start_date, expiry_date, status: 'active' }])
        .select();
      if (error) throw error;

      try {
        const { data: cust } = await supabase
          .from('customers')
          .select('full_name, phone, email')
          .eq('customer_id', Number(customer_id))
          .maybeSingle();
        if (cust) {
          moduleNotifications.notify({
            targetModules: ['customer'],
            sourceModule: 'customers',
            senderName: 'Elight Customer Desk',
            title: `Product Warranty Activated: ${product_name}`,
            message: `Your warranty (Serial: ${serial_no}) is active until ${expiry_date}.`,
            severity: 'success',
            refNo: serial_no || `WRN-${data[0]?.warranty_id || ''}`,
            recipientPhone: cust.phone || '',
            recipientEmail: cust.email || '',
            recipientName: cust.full_name || ''
          });
        }
      } catch (e) {}

      res.status(201).json({ success: true, warranty: data[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // Dedicated Customer-Only Self-Service Portal Data (Strictly scoped to logged-in customer)
  getCustomerPortal: async (req, res) => {
    try {
      const email = String(req.query.email || '').trim().toLowerCase();
      const phone = String(req.query.phone || '').trim();
      const rawName = String(req.query.name || '').trim();
      const baseName = rawName.replace(/\s*\(customer\)\s*$/i, '').trim();

      if (!email && !phone && !baseName) {
        return res.status(400).json({ success: false, message: 'Customer identity parameters are required.' });
      }

      // 1. Locate this specific customer's profile in customers table
      let customerProfile = null;
      try {
        const { data: allCustomers, error: custErr } = await supabase
          .from('customers')
          .select('*');
        if (!custErr && Array.isArray(allCustomers)) {
          customerProfile = allCustomers.find(c =>
            (email && c.email && String(c.email).toLowerCase() === email) ||
            (phone && c.phone && String(c.phone).trim() === phone) ||
            (baseName && c.full_name && String(c.full_name).toLowerCase() === baseName.toLowerCase())
          );
        }
      } catch (e) {}

      // If missing in customers table, auto-create profile entry for this customer
      if (!customerProfile && (baseName || email || phone)) {
        try {
          const { data: created } = await supabase
            .from('customers')
            .insert([{
              full_name: baseName || 'Valued Customer',
              phone: phone || 'N/A',
              email: email || null,
              location: 'Meru, Meru County',
              notes: 'Customer portal account'
            }])
            .select();
          if (created && created[0]) customerProfile = created[0];
        } catch (e) {}

        if (!customerProfile) {
          customerProfile = {
            customer_id: 1,
            full_name: baseName || 'Valued Customer',
            phone: phone || 'N/A',
            email: email || null,
            location: 'Meru, Meru County',
            notes: 'Customer portal account'
          };
        }
      }

      // 2. Fetch ONLY this customer's warranties
      let warranties = [];
      if (customerProfile?.customer_id) {
        try {
          const { data: wData } = await supabase
            .from('warranties')
            .select('*')
            .eq('customer_id', customerProfile.customer_id)
            .order('warranty_id', { ascending: false });
          warranties = wData || [];
        } catch (e) {}
      }

      // 3. Fetch ONLY this customer's dispatches / order deliveries
      const allDispatches = await interModuleSync.getDispatches();

      const activePhone = (customerProfile?.phone || phone || '').trim();
      const activeNameLower = (customerProfile?.full_name || baseName || '').toLowerCase();
      const activeEmailLower = (customerProfile?.email || email || '').toLowerCase();

      // 4. Fetch ONLY this customer's orders from cashier_orders.json (normalized for independent delivery & installation tracking)
      const allOrders = readCashierOrders();
      const myOrders = allOrders
        .filter(o => {
          const oPhone = String(o.customer_phone || '').trim();
          const oName = String(o.customer_name || '').toLowerCase().trim();
          const matchPhone = activePhone && activePhone !== 'N/A' && (
            oPhone === activePhone ||
            (activePhone.length >= 8 && oPhone.includes(activePhone.slice(-8))) ||
            (oPhone.length >= 8 && activePhone.includes(oPhone.slice(-8)))
          );
          const matchName = activeNameLower && (
            oName === activeNameLower ||
            (activeNameLower.length > 3 && oName.includes(activeNameLower)) ||
            (oName.length > 3 && activeNameLower.includes(oName))
          );
          return matchPhone || matchName;
        })
        .map(normalizeOrderDualStatuses);

      // 5. Fetch ONLY this customer's payments
      const myPayments = myOrders
        .filter(o => o.payment_status === 'paid')
        .map(o => ({
          payment_ref: o.payment_ref || ('REF-' + o.order_no),
          order_no: o.order_no,
          receipt_no: o.receipt_no || ('RCP-' + o.order_no),
          amount: Number(o.total_amount || 0),
          payment_method: o.payment_method || 'M-Pesa',
          paid_at: o.paid_at || o.created_at,
          cashier_name: o.cashier_name || 'Esther Karimi',
          status: 'confirmed'
        }));

      // 6. Fetch ONLY this customer's deliveries
      const myOrderNos = new Set(myOrders.map(o => String(o.order_no).toUpperCase()));
      const dispatches = (allDispatches || [])
        .filter(d =>
          (activePhone && activePhone !== 'N/A' && String(d.customer_phone || '').trim() === activePhone) ||
          (activeNameLower && String(d.customer_name || '').toLowerCase() === activeNameLower) ||
          (d.order_no && myOrderNos.has(String(d.order_no).toUpperCase()))
        )
        .map(d => ({
          dispatch_id: d.dispatch_id,
          order_no: d.order_no,
          delivery_address: d.delivery_address,
          scheduled_date: d.scheduled_date,
          status: d.status,
          driver_notes: d.driver_notes,
          driver_name: d.driver_name
        }));

      // 7. Fetch ONLY this customer's bookings
      const allBookings = await interModuleSync.getBookings();
      const bookings = (allBookings || []).filter(b => {
        const bEmail = String(b.customer_email || '').toLowerCase().trim();
        const bPhone = String(b.customer_phone || '').trim();
        const matchEmail = activeEmailLower && bEmail && bEmail === activeEmailLower;
        const matchPhone = activePhone && activePhone !== 'N/A' && bPhone && (
          bPhone === activePhone ||
          (activePhone.length >= 8 && bPhone.includes(activePhone.slice(-8)))
        );
        return matchEmail || matchPhone;
      });

      // 8. Fetch ONLY this customer's service jobs & service fee receipts
      const allServices = await interModuleSync.getServiceRequests();
      const myBookingRefs = new Set(bookings.map(b => String(b.booking_ref || '').toUpperCase()).filter(Boolean));
      const myServices = (allServices || []).filter(s => {
        const sEmail = String(s.customer_email || '').toLowerCase().trim();
        const sPhone = String(s.phone || '').trim();
        const sName = String(s.customer_name || '').toLowerCase().trim();
        const sBookingRef = String(s.booking_ref || '').toUpperCase().trim();
        const matchEmail = activeEmailLower && sEmail && sEmail === activeEmailLower;
        const matchPhone = activePhone && activePhone !== 'N/A' && sPhone && (
          sPhone === activePhone ||
          (activePhone.length >= 8 && sPhone.includes(activePhone.slice(-8)))
        );
        const matchName = activeNameLower && sName && sName === activeNameLower;
        const matchBooking = sBookingRef && myBookingRefs.has(sBookingRef);
        return matchEmail || matchPhone || matchName || matchBooking;
      });

      const servicePayments = myServices
        .filter(s => String(s.payment_status || '').toLowerCase() === 'paid' && Number(s.service_fee || 0) > 0)
        .map(s => ({
          source: 'service',
          request_id: s.request_id,
          payment_ref: s.service_payment_ref || `SR-REF-${s.request_id}`,
          order_no: `SR-${s.request_id}`,
          receipt_no: s.service_receipt_no || `RCP-SR-${s.request_id}`,
          amount: Number(s.service_fee || 0),
          payment_method: s.service_payment_method || 'M-Pesa',
          paid_at: s.service_paid_at || s.approved_at || s.created_at,
          cashier_name: s.service_payment_confirmed_by || 'Finance Manager',
          service_type: s.service_type,
          status: 'confirmed'
        }));

      const combinedPayments = sortByLatest([...servicePayments, ...myPayments], 'request_id');

      res.json({
        success: true,
        profile: customerProfile,
        warranties: sortByLatest(warranties, 'warranty_id'),
        dispatches: sortByLatest(dispatches, 'dispatch_id'),
        orders: sortByLatest(myOrders),
        payments: combinedPayments,
        bookings: sortByLatest(bookings, 'booking_id'),
        services: sortByLatest(myServices, 'request_id')
      });
    } catch (err) {
      console.error('Customer portal fetch error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  updateCustomerProfile: async (req, res) => {
    try {
      const { customer_id, user_id, full_name, phone, location } = req.body;
      if (!customer_id) {
        return res.status(400).json({ success: false, message: 'Customer ID is required.' });
      }

      const cleanName = String(full_name || '').trim();
      const rawPhone = String(phone || '').trim();
      let cleanPhone = rawPhone.replace(/\D/g, '');
      if (cleanPhone.startsWith('254') && cleanPhone.length === 12) {
        cleanPhone = '0' + cleanPhone.slice(3);
      }
      if (cleanPhone && cleanPhone.length !== 10) {
        return res.status(400).json({
          success: false,
          message: 'Customer phone number must be exactly 10 digits (e.g. 07XXXXXXXX or 01XXXXXXXX).'
        });
      }
      if (!cleanPhone) {
        cleanPhone = rawPhone;
      }
      const cleanLocation = String(location || '').trim();

      const { data, error } = await supabase
        .from('customers')
        .update({
          full_name: cleanName,
          phone: cleanPhone,
          location: cleanLocation
        })
        .eq('customer_id', customer_id)
        .select();

      if (error) throw error;

      if (user_id) {
        await supabase
          .from('users_accounts')
          .update({ full_name: cleanName, phone: cleanPhone })
          .eq('user_id', user_id);
      }

      res.json({ success: true, profile: data[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // SERVICE MANAGER & TECHNICIAN MODULES
  // ==========================================
  getServiceRequests: async (req, res) => {
    try {
      const techFilter = String(req.query.technician || '').trim().toLowerCase();
      const techId = req.query.technician_id ? Number(req.query.technician_id) : null;

      const requests = await interModuleSync.getServiceRequests(techFilter, techId);
      res.json({ success: true, count: requests.length, requests });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  createServiceRequest: async (req, res) => {
    try {
      const {
        customer_name,
        customer_email,
        phone,
        location,
        service_type,
        description,
        scheduled_date,
        preferred_time,
        service_fee,
        technician_id,
        technician_name
      } = req.body;
      const newReq = await interModuleSync.createServiceRequestFromBooking({
        customer_name,
        customer_email: customer_email || null,
        customer_phone: phone,
        location_or_notes: location,
        item_or_service_name: service_type,
        description: description || '',
        preferred_time: preferred_time || 'Pending Service Manager Assignment',
        preferred_date: scheduled_date || new Date().toISOString().split('T')[0],
        service_fee: Number(service_fee || 0),
        technician_id: technician_id ? Number(technician_id) : null,
        technician_name: technician_name || ''
      });

      res.status(201).json({ success: true, request: newReq });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  assignTechnician: async (req, res) => {
    try {
      const { id } = req.params;
      const { technician_id, technician_name, assigned_time, user_role, actor } = req.body;
      const callerRole = String(user_role || req.headers['x-user-role'] || '').trim().toLowerCase();

      const authorizedRoles = ['service_manager', 'service', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !authorizedRoles.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Service Manager (Peter Otieno) can assign field technicians.'
        });
      }

      const updated = await interModuleSync.assignTechnicianToRequest(id, technician_id, technician_name);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Service request not found.' });
      }

      if (assigned_time) {
        await interModuleSync.assignTimeToServiceRequest(id, assigned_time, actor || 'Service Manager');
      }

      res.json({ success: true, request: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  assignServiceTime: async (req, res) => {
    try {
      const { id } = req.params;
      const { assigned_time, user_role, actor } = req.body;
      const callerRole = String(user_role || req.headers['x-user-role'] || '').trim().toLowerCase();

      // Enforce: ONLY the Service Manager (Peter Otieno) or Admin/Owner can assign appointment time
      const authorizedRoles = ['service_manager', 'service', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !authorizedRoles.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Service Manager (Peter Otieno) can assign service appointment times.'
        });
      }

      if (!assigned_time || !String(assigned_time).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid assigned time window.'
        });
      }

      const updated = await interModuleSync.assignTimeToServiceRequest(id, String(assigned_time).trim(), actor || 'Service Manager');
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Service request not found.' });
      }

      res.json({ success: true, request: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  updateServiceStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, materials_used, completion_notes, actor, skipAutoStockDeduct } = req.body;

      const updated = await interModuleSync.updateServiceRequestStatus(id, status, {
        materialsUsed: materials_used,
        completionNotes: completion_notes,
        actor,
        skipAutoStockDeduct
      });
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Service request not found.' });
      }

      res.json({ success: true, request: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  submitServiceCompletionReport: async (req, res) => {
    try {
      const { id } = req.params;
      const { completion_notes, materials_used, actor } = req.body;
      if (!String(completion_notes || '').trim()) {
        return res.status(400).json({ success: false, message: 'Completion report details are required.' });
      }

      const updated = await interModuleSync.updateServiceRequestStatus(id, 'awaiting_inspection', {
        materialsUsed: materials_used,
        completionNotes: String(completion_notes).trim(),
        actor: actor || 'Field Technician',
        skipAutoStockDeduct: true
      });
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Service request not found.' });
      }
      res.json({
        success: true,
        request: updated,
        message: `Completion report for #SR-${id} submitted for Service Manager inspection.`
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getMaterialRequests: async (req, res) => {
    try {
      const serviceRequestId = req.params.id || req.query.service_request_id || null;
      const status = req.query.status || 'all';
      const technician = req.query.technician || '';
      const requests = await interModuleSync.getMaterialRequests({
        service_request_id: serviceRequestId,
        status,
        technician
      });
      res.json({ success: true, count: requests.length, material_requests: requests });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  createMaterialRequest: async (req, res) => {
    try {
      const serviceRequestId = Number(req.params.id || req.body.service_request_id);
      const { technician_id, technician_name, items, notes } = req.body;
      const created = await interModuleSync.createMaterialRequest({
        service_request_id: serviceRequestId,
        technician_id,
        technician_name,
        items,
        notes
      });
      res.status(201).json({
        success: true,
        material_request: created,
        message: `Material Request ${created.request_number} sent to Inventory Manager.`
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  reviewMaterialRequest: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      const allowed = ['inventory', 'inventory_manager', 'storekeeper', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowed.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Inventory Manager can approve, partially approve, or reject material requests.'
        });
      }

      const updated = await interModuleSync.reviewMaterialRequest(req.params.mrId, {
        action: req.body.action,
        items: req.body.items,
        review_notes: req.body.review_notes,
        actor: req.body.actor || 'Inventory Manager'
      });
      res.json({
        success: true,
        material_request: updated,
        message: `Material Request ${updated.request_number} marked ${updated.status.replace(/_/g, ' ')}.`
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  issueMaterialRequest: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      const allowed = ['inventory', 'inventory_manager', 'storekeeper', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowed.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Inventory Manager can issue approved materials and deduct inventory.'
        });
      }

      const result = await interModuleSync.issueMaterialRequest(req.params.mrId, {
        actor: req.body.actor || 'Inventory Manager'
      });
      res.json({
        success: true,
        ...result,
        message: `Materials for ${result.material_request.request_number} issued to technician and deducted from inventory.`
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  getServiceFeeCharges: async (req, res) => {
    try {
      const requests = await interModuleSync.getServiceRequests();
      const billable = requests.filter(s =>
        String(s.status || '').toLowerCase() === 'completed' ||
        Number(s.service_fee || 0) > 0 ||
        ['pending_payment', 'paid'].includes(String(s.billing_status || '').toLowerCase())
      );
      const pending = billable.filter(s => String(s.payment_status || 'unpaid').toLowerCase() !== 'paid' && Number(s.service_fee || 0) > 0);
      const paid = billable.filter(s => String(s.payment_status || '').toLowerCase() === 'paid');
      res.json({
        success: true,
        services: billable,
        summary: {
          total_billable: billable.length,
          pending_payment_count: pending.length,
          paid_count: paid.length,
          pending_amount: pending.reduce((sum, s) => sum + Number(s.service_fee || 0), 0),
          collected_amount: paid.reduce((sum, s) => sum + Number(s.service_fee || 0), 0)
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  confirmServiceFeePayment: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      const allowed = ['finance', 'finance_manager', 'accountant', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowed.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Finance Manager can confirm service fee payments.'
        });
      }

      const refCheck = validatePaymentReference(req.body.payment_method || 'M-Pesa', req.body.transaction_ref, {
        required: true,
        label: 'Transaction reference'
      });
      if (!refCheck.valid) {
        return res.status(400).json({ success: false, message: refCheck.message });
      }

      const updated = await interModuleSync.confirmServiceFeePayment(req.params.id, {
        amount_paid: req.body.amount_paid,
        payment_method: req.body.payment_method,
        transaction_ref: refCheck.value,
        actor: req.body.actor || 'Finance Manager'
      });
      res.json({
        success: true,
        request: updated,
        message: `Service fee payment confirmed for #SR-${updated.request_id}. Receipt ${updated.service_receipt_no} is ready.`
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  downloadCustomerServiceReceipt: async (req, res) => {
    try {
      const srId = Number(req.params.id);
      if (!srId) return res.status(400).json({ success: false, message: 'Invalid service ID.' });

      const email = String(req.query.email || '').trim().toLowerCase();
      const phone = String(req.query.phone || '').trim();
      const rawName = String(req.query.name || '').trim();
      const baseName = rawName.replace(/\s*\(customer\)\s*$/i, '').toLowerCase();
      const isAdminBypass = String(req.query.role || '').toLowerCase() === 'admin';

      const allServices = await interModuleSync.getServiceRequests();
      const sr = allServices.find(s => Number(s.request_id) === srId);
      if (!sr) return res.status(404).json({ success: false, message: 'Service record not found.' });

      if (!isAdminBypass) {
        const sEmail = String(sr.customer_email || '').toLowerCase().trim();
        const sPhone = String(sr.phone || '').trim();
        const sName = String(sr.customer_name || '').toLowerCase().trim();
        const matchesCustomer =
          (email && sEmail && email === sEmail) ||
          (phone && sPhone && (phone === sPhone || (phone.length >= 8 && sPhone.includes(phone.slice(-8))))) ||
          (baseName && sName && baseName === sName);
        if (!matchesCustomer) {
          return res.status(403).json({ success: false, message: 'Forbidden: This service receipt belongs to another customer.' });
        }
      }

      if (String(sr.payment_status || '').toLowerCase() !== 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Receipt is available only after Finance Manager confirms service fee payment.'
        });
      }

      const receiptNo = sr.service_receipt_no || `RCP-SR-${sr.request_id}`;
      const paidDate = String(sr.service_paid_at || sr.approved_at || sr.created_at || '').slice(0, 10) || 'N/A';

      const pdfBuffer = buildOfficialReceiptPdf({
        documentTitle: 'OFFICIAL SERVICE FEE PAYMENT RECEIPT',
        metaLeft: [
          `Receipt No: ${receiptNo}`,
          `Service Job Ref: #SR-${sr.request_id}`,
          `Payment Date: ${paidDate}`
        ],
        metaRight: [
          'Status: PAYMENT CONFIRMED BY FINANCE',
          `Payment Ref: ${sr.service_payment_ref || 'VERIFIED'}`,
          `Payment Method: ${sr.service_payment_method || 'M-Pesa'}`
        ],
        statusPositive: true,
        sectionTitle: 'CUSTOMER & SERVICE JOB DETAILS',
        detailRows: [
          ['Customer Name:', sr.customer_name || 'Valued Customer', 'Service Type:', sr.service_type || 'Electrical Service'],
          ['Phone:', sr.phone || '-', 'Technician:', sr.technician_name || sr.assigned_technician_name || 'Assigned Tech'],
          ['Site Location:', sr.location || 'Meru County', 'Service Approved:', sr.approved_by || 'Service Manager'],
          ['Customer Email:', sr.customer_email || '-', 'Finance Confirmed:', sr.service_payment_confirmed_by || 'Finance Manager']
        ],
        amountLabel: 'TOTAL SERVICE FEE PAID',
        amountSubtext: 'Verified and confirmed received by Elight Electrical Shop Finance Department',
        amountValue: Number(sr.service_fee || 0),
        notesTitle: 'COMPLETION & MATERIALS SUMMARY',
        notesBody: `Work Report: ${sr.completion_notes || 'Service completed and approved.'} | Materials: ${sr.materials_used || 'Standard tools & consumables'}`,
        footerLine: 'Thank you for choosing Elight Electrical Shop. You may submit service feedback from your Customer Portal.'
      });

      const safeFileName = `Service-Receipt-SR-${sr.request_id}.pdf`;
      const disposition = req.query.preview === '1' ? 'inline' : 'attachment';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    } catch (err) {
      console.error('downloadCustomerServiceReceipt error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // FINANCE MANAGER MODULE
  // ==========================================
  getFinanceRecords: async (req, res) => {
    try {
      let records = [];
      try {
        const { data, error } = await supabase
          .from('finance_records')
          .select('*')
          .order('record_id', { ascending: false });
        if (!error && Array.isArray(data) && data.length > 0) {
          records = data;
        }
      } catch (e) {}

      if (records.length === 0) {
        records = readFinanceRecords();
      }
      records = sortByLatest(records, 'record_id');
      res.json({ success: true, count: records.length, records });
    } catch (err) {
      const records = sortByLatest(readFinanceRecords(), 'record_id');
      res.json({ success: true, count: records.length, records });
    }
  },

  createFinanceRecord: async (req, res) => {
    try {
      const { type, category, description, amount, payment_method, reference_no, cashier_name } = req.body;
      const cleanType = String(type || '').trim().toLowerCase();

      // Governance Rule: Finance Manager can view financial records and record expenses/disbursements,
      // but completed sales records originate strictly from the Cashier and cannot be altered or created manually.
      if (cleanType === 'sale' || cleanType === 'income') {
        return res.status(403).json({
          success: false,
          message: 'Governance Restriction: The Finance Manager can view financial records and log operational expenses, but cannot alter or create completed sales. Sales records originate strictly from Cashier checkout.'
        });
      }

      const cleanDesc = String(description || '').trim();
      const taggedDesc = (cleanType === 'sale' && cashier_name && !/\[Cashier:/i.test(cleanDesc))
        ? `${cleanDesc} [Cashier: ${String(cashier_name).trim()}]`
        : cleanDesc;

      const payMethod = payment_method || 'M-Pesa';
      const refCheck = validatePaymentReference(payMethod, reference_no, { required: false, label: 'Payment reference' });
      if (!refCheck.valid) {
        return res.status(400).json({ success: false, message: refCheck.message });
      }

      const newRec = {
        record_id: Date.now(),
        type: cleanType || 'expense',
        category: category || 'General Expense',
        description: taggedDesc,
        amount: Number(amount) || 0,
        payment_method: payMethod,
        reference_no: refCheck.value || 'MANUAL-' + Date.now().toString().slice(-6),
        status: 'confirmed',
        created_at: new Date().toISOString()
      };

      const localList = readFinanceRecords();
      localList.unshift(newRec);
      writeFinanceRecords(localList);

      try {
        await supabase.from('finance_records').insert([newRec]);
      } catch (e) {}

      res.status(201).json({ success: true, record: newRec });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getFinanceSummary: async (req, res) => {
    try {
      let records = [];
      try {
        const { data, error } = await supabase.from('finance_records').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          records = data;
        }
      } catch (e) {}

      if (records.length === 0) {
        records = readFinanceRecords();
      }

      let totalSales = 0;
      let totalExpenses = 0;

      records.forEach(r => {
        if (r.type === 'sale') totalSales += Number(r.amount || 0);
        else if (r.type === 'expense') totalExpenses += Number(r.amount || 0);
      });

      const netProfit = totalSales - totalExpenses;
      const balances = calculateTreasuryBalances(records);

      res.json({
        success: true,
        summary: {
          totalSales,
          totalExpenses,
          netProfit,
          recordCount: records.length
        },
        balances
      });
    } catch (err) {
      const records = readFinanceRecords();
      let totalSales = 0;
      let totalExpenses = 0;
      records.forEach(r => {
        if (r.type === 'sale') totalSales += Number(r.amount || 0);
        else if (r.type === 'expense') totalExpenses += Number(r.amount || 0);
      });
      const balances = calculateTreasuryBalances(records);
      res.json({
        success: true,
        summary: {
          totalSales,
          totalExpenses,
          netProfit: totalSales - totalExpenses,
          recordCount: records.length
        },
        balances
      });
    }
  },

  getFinanceBalances: async (req, res) => {
    try {
      let records = [];
      try {
        const { data, error } = await supabase.from('finance_records').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          records = data;
        }
      } catch (e) {}

      if (records.length === 0) {
        records = readFinanceRecords();
      }

      const balances = calculateTreasuryBalances(records);
      res.json({ success: true, balances });
    } catch (err) {
      const records = readFinanceRecords();
      const balances = calculateTreasuryBalances(records);
      res.json({ success: true, balances });
    }
  },

  updateOpeningBalances: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      if (callerRole && !['admin', 'administrator', 'finance_manager', 'owner'].includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Finance Manager or Administrator can adjust account baseline balances.'
        });
      }

      const { opening_cash, opening_mpesa, opening_bank, bank_name, bank_account_no, mpesa_till, actor } = req.body;
      const cfg = readSystemConfig();
      if (!cfg.settings) cfg.settings = {};
      if (!cfg.settings.treasury_accounts) cfg.settings.treasury_accounts = {};

      const t = cfg.settings.treasury_accounts;
      if (opening_cash !== undefined) t.opening_cash = Math.max(0, Number(opening_cash));
      if (opening_mpesa !== undefined) t.opening_mpesa = Math.max(0, Number(opening_mpesa));
      if (opening_bank !== undefined) t.opening_bank = Math.max(0, Number(opening_bank));
      if (bank_name) t.bank_name = String(bank_name).trim();
      if (bank_account_no !== undefined && String(bank_account_no).trim() !== '') {
        const bankAccCheck = validateBankAccountNumber(bank_account_no, 'Bank', { required: false });
        if (!bankAccCheck.valid) {
          return res.status(400).json({ success: false, message: bankAccCheck.message });
        }
        t.bank_account_no = bankAccCheck.value;
      }
      if (mpesa_till) t.mpesa_till = String(mpesa_till).trim();

      writeSystemConfig(cfg);

      appendAuditLog(
        'Treasury Account Opening Balances Adjusted',
        `Cash: KES ${Number(t.opening_cash || 0).toLocaleString()} • M-Pesa: KES ${Number(t.opening_mpesa || 0).toLocaleString()} • Bank: KES ${Number(t.opening_bank || 0).toLocaleString()}`,
        actor || 'Finance Desk',
        'Finance & Treasury'
      );

      const records = readFinanceRecords();
      const balances = calculateTreasuryBalances(records, cfg.settings);

      res.json({
        success: true,
        message: 'Account opening balances updated successfully.',
        balances
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // FINANCE RELEASE & CREDIT REVIEW DESK
  // ==========================================
  getPendingFinanceReleases: async (req, res) => {
    try {
      const orders = readCashierOrders();
      const normalized = orders.map(normalizeOrderDualStatuses);

      const sortedAll = sortByLatest(normalized);
      const awaitingCashier = sortedAll.filter(o => o.finance_release_status === 'awaiting_cashier');
      // Finance only reviews & confirms orders that Cashier has confirmed and passed to Finance
      const sortedNormalized = sortedAll.filter(o => o.finance_release_status !== 'awaiting_cashier');
      const pendingFinance = sortedNormalized.filter(o => o.finance_release_status === 'pending_finance');
      const pendingCredit = sortedNormalized.filter(o => o.finance_release_status === 'pending_credit_review');
      const released = sortedNormalized.filter(o => o.finance_release_status === 'released');
      const creditHolds = sortedNormalized.filter(o => o.finance_release_status === 'credit_hold');
      const totalReceivable = pendingCredit.reduce((sum, o) => sum + (o.balance_due || 0), 0);

      res.json({
        success: true,
        orders: sortedNormalized,
        counts: {
          awaiting_cashier: awaitingCashier.length,
          pending_finance: pendingFinance.length,
          pending_credit_review: pendingCredit.length,
          released: released.length,
          credit_holds: creditHolds.length,
          total_receivable: totalReceivable
        }
      });
    } catch (err) {
      console.error('getPendingFinanceReleases error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  releaseOrderByFinance: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      const allowedRoles = ['finance', 'finance_manager', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowedRoles.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: "Access Denied: Only Finance Officers or Administrators can review credit terms and release customer orders."
        });
      }

      const targetNo = String(req.params.orderNo || '').trim();
      const {
        action,
        credit_notes,
        credit_policy_type,
        officer_name,
        cashier_name,
        payment_amount,
        amount,
        payment_method,
        payment_ref,
        reference_no
      } = req.body;

      const cleanOfficer = String(officer_name || cashier_name || 'Finance Officer').trim();

      // Shared helper: route a Finance-confirmed order to Dispatch Manager (if dispatch needed)
      // and/or Service Manager (if electrical service / installation is requested).
      async function finalizeFinanceConfirmedRouting(targetOrder, officer, releaseNote) {
        const routedTo = [];
        const isServiceOnly = targetOrder.fulfillment_type === 'service_only' ||
          targetOrder.fulfillment_mode === 'service' ||
          /service booking/i.test(String(targetOrder.source || ''));
        const fType = isServiceOnly
          ? 'service_only'
          : (targetOrder.fulfillment_type || (targetOrder.fulfillment_mode === 'collection' ? 'product_collection' : 'product_delivery'));
        targetOrder.fulfillment_type = fType;

        const wantsInst = Boolean(
          isServiceOnly ||
          targetOrder.requires_installation ||
          fType === 'product_delivery_install' ||
          fType === 'product_install_later' ||
          (targetOrder.installation_status && targetOrder.installation_status !== 'not_requested')
        );
        targetOrder.requires_installation = wantsInst;
        targetOrder.installation_status = wantsInst ? 'approved' : 'not_requested';

        // 1. Dispatch Manager routing (for any order requiring delivery dispatch)
        const needsDispatch = !isServiceOnly && fType !== 'product_collection' && targetOrder.fulfillment_mode !== 'collection';
        if (needsDispatch) {
          targetOrder.fulfillment_stage = 'delivery';
          targetOrder.fulfillment_status = 'sent_to_dispatch';
          targetOrder.delivery_status = 'scheduled';
          await interModuleSync.createDispatchForOrder(targetOrder, {
            needs_installation: wantsInst && fType !== 'product_install_later',
            booked_later: fType === 'product_install_later'
          });
          routedTo.push('Dispatch Manager');
        } else if (fType === 'product_collection') {
          targetOrder.fulfillment_stage = wantsInst ? 'installation' : 'collection';
          targetOrder.fulfillment_status = 'ready_for_collection';
          targetOrder.delivery_status = 'not_scheduled';
          moduleNotifications.notify({
            targetModules: ['cashier'],
            sourceModule: 'finance',
            senderName: officer,
            title: `Order ${targetOrder.order_no} Released for Shop Collection`,
            message: `Finance confirmed & released Order ${targetOrder.order_no} (${targetOrder.customer_name}) for customer shop counter collection.`,
            severity: 'success',
            refNo: targetOrder.order_no,
            actionModule: 'cashier'
          });
        } else if (isServiceOnly) {
          targetOrder.fulfillment_stage = 'installation';
          targetOrder.fulfillment_status = 'installation_pending';
          targetOrder.delivery_status = 'not_scheduled';
        }

        // 2. Service Manager routing (only when a service or installation is requested)
        if (wantsInst) {
          const isLater = fType === 'product_install_later' || Boolean(targetOrder.schedule_install_later);
          const reqPrefix = isLater ? 'SCH' : (isServiceOnly ? 'SRV' : 'INS');
          const sRequests = readServiceRequests();
          const existingInst = sRequests.find(s =>
            s.order_no === targetOrder.order_no ||
            s.booking_ref === `INS-${targetOrder.order_no}` ||
            s.booking_ref === `SCH-${targetOrder.order_no}` ||
            s.booking_ref === `SRV-${targetOrder.order_no}`
          );
          if (!existingInst) {
            const nextReqId = sRequests.length > 0 ? Math.max(...sRequests.map(s => s.request_id || 0)) + 1 : 101;
            const itemsSummary = (targetOrder.items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
            const installReq = {
              request_id: nextReqId,
              order_no: targetOrder.order_no,
              booking_ref: `${reqPrefix}-${targetOrder.order_no}`,
              customer_name: targetOrder.customer_name || 'Customer',
              phone: targetOrder.customer_phone || 'N/A',
              location: targetOrder.customer_location || 'Meru County',
              service_type: isLater
                ? 'Scheduled Product Installation'
                : (targetOrder.service_type || (isServiceOnly ? (itemsSummary || 'Electrical Service') : 'Product Installation')),
              description: isLater
                ? `Scheduled Installation for Order ${targetOrder.order_no} (${itemsSummary || 'Electrical Products'}). Finance confirmed (${releaseNote}). Customer will confirm preferred installation appointment date.`
                : `${isServiceOnly ? 'Electrical Service' : 'Product Installation'} for Order ${targetOrder.order_no} (${itemsSummary || 'Electrical Products'}). Finance confirmed (${releaseNote}).`,
              scheduled_date: isLater ? 'Pending Customer Booking' : (targetOrder.scheduled_date || 'TBD'),
              status: 'pending',
              site_ready: isServiceOnly || fType === 'product_collection',
              site_ready_for_installation: isServiceOnly || fType === 'product_collection',
              assigned_technician_id: null,
              assigned_technician_name: '',
              technician_name: '',
              materials_used: '',
              created_at: new Date().toISOString()
            };
            const validSqlDate = (!isLater && targetOrder.scheduled_date && /^\d{4}-\d{2}-\d{2}/.test(String(targetOrder.scheduled_date)))
              ? String(targetOrder.scheduled_date).slice(0, 10)
              : new Date().toISOString().split('T')[0];
            try {
              const { data: insertedInst } = await supabase.from('service_requests').insert([{
                booking_ref: installReq.booking_ref,
                customer_name: installReq.customer_name,
                phone: installReq.phone,
                location: installReq.location,
                service_type: installReq.service_type,
                description: installReq.description,
                scheduled_date: validSqlDate,
                status: installReq.status
              }]).select('*').single();
              if (insertedInst?.request_id) installReq.request_id = insertedInst.request_id;
            } catch (e) {}
            sRequests.unshift(installReq);
            writeServiceRequests(sRequests);
          }

          moduleNotifications.notify({
            targetModules: ['services'],
            sourceModule: 'finance',
            senderName: officer,
            title: `Service / Installation Job Sent (${targetOrder.order_no})`,
            message: `Finance confirmed Order ${targetOrder.order_no} (${targetOrder.customer_name}) — queued for Service Manager (${targetOrder.service_type || 'Product Installation'}).`,
            severity: 'info',
            refNo: targetOrder.order_no,
            actionModule: 'services'
          });
          routedTo.push('Service Manager');
        }

        targetOrder.routed_to = routedTo;
        return routedTo;
      }
      const orders = readCashierOrders();
      let order = orders.find(o => String(o.order_no || o.order_number || '').toUpperCase() === targetNo.toUpperCase());

      if (!order) {
        return res.status(404).json({ success: false, message: `Order ${targetNo} not found.` });
      }

      if (order.finance_release_status === 'awaiting_cashier' || (!order.cashier_served && order.source === 'Online Customer Order' && Number(order.amount_paid || 0) === 0)) {
        return res.status(400).json({
          success: false,
          message: `Cashier Confirmation Required: Order ${order.order_no} must be confirmed by the Cashier first and passed to Finance before payment confirmation.`
        });
      }

      const total = Number(order.total_amount || 0);
      let paid = order.amount_paid !== undefined ? Number(order.amount_paid) : (order.payment_status === 'paid' ? total : 0);
      let balance = order.balance_due !== undefined ? Number(order.balance_due) : Math.max(0, total - paid);

      if (action === 'record_balance_payment') {
        const amt = Number(payment_amount || amount || 0);
        if (amt <= 0) {
          return res.status(400).json({ success: false, message: 'Please specify a valid payment amount greater than KES 0.' });
        }
        const payMethod = payment_method || 'M-Pesa';
        const rawPayRef = payment_ref || reference_no || '';
        const refCheck = validatePaymentReference(payMethod, rawPayRef, { required: false, label: 'Transaction reference' });
        if (!refCheck.valid) {
          return res.status(400).json({ success: false, message: refCheck.message });
        }
        const wasReleased = order.finance_release_status === 'released';
        paid += amt;
        balance = Math.max(0, total - paid);
        order.amount_paid = paid;
        order.balance_due = balance;
        order.unpaid_balance = balance > 0;
        if (balance === 0) {
          order.payment_status = 'paid';
          order.finance_release_status = 'released';
          order.financial_clearance = 'approved';
          if (!order.finance_released_at) order.finance_released_at = new Date().toISOString();
          if (!order.finance_released_by) order.finance_released_by = cleanOfficer;
        } else {
          order.payment_status = 'partially_paid';
        }

        const payRef = refCheck.value || `FIN-${Date.now().toString().slice(-6)}`;
        const localFin = readFinanceRecords();
        localFin.unshift({
          record_id: Date.now(),
          type: 'sale',
          category: 'Order Balance Settlement',
          description: `Settlement of KES ${amt.toLocaleString()} on Order ${order.order_no} (${order.customer_name}) [Remaining Balance: KES ${balance.toLocaleString()}] [Finance: ${cleanOfficer}]`,
          amount: amt,
          payment_method: payMethod,
          reference_no: payRef,
          status: 'confirmed',
          created_at: new Date().toISOString()
        });
        writeFinanceRecords(localFin);

        try {
          await supabase.from('finance_records').insert([{
            type: 'sale',
            category: 'Order Balance Settlement',
            description: `Settlement of KES ${amt.toLocaleString()} on Order ${order.order_no} (${order.customer_name}) [Remaining Balance: KES ${balance.toLocaleString()}] [Finance: ${cleanOfficer}]`,
            amount: amt,
            payment_method: payMethod,
            reference_no: payRef,
            status: 'confirmed'
          }]);
        } catch (e) {}

        // If full balance settlement unlocked release for the first time, route to Dispatch & Service Managers
        let settledRoutes = [];
        if (balance === 0 && !wasReleased) {
          settledRoutes = await finalizeFinanceConfirmedRouting(order, cleanOfficer, `Full balance settled via ${payMethod} (${payRef}).`);
        }

        writeCashierOrders(orders);

        appendAuditLog(
          'Customer Order Balance Payment Received',
          `Finance received KES ${amt.toLocaleString()} via ${payMethod} (${payRef}) for Order ${order.order_no}. Remaining balance: KES ${balance.toLocaleString()}.${settledRoutes.length ? ` Routed to: ${settledRoutes.join(' & ')}.` : ''}`,
          `${cleanOfficer} (Finance)`,
          'Finance & Treasury'
        );

        moduleNotifications.notify({
          targetModules: ['cashier'],
          sourceModule: 'finance',
          senderName: cleanOfficer,
          title: `Balance Payment Recorded (${order.order_no})`,
          message: `Finance received KES ${amt.toLocaleString()} (${payMethod}). Remaining customer balance: KES ${balance.toLocaleString()}.`,
          severity: balance === 0 ? 'success' : 'info',
          refNo: order.order_no,
          actionModule: 'cashier'
        });

        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'finance',
          senderName: cleanOfficer,
          title: `Payment of KES ${amt.toLocaleString()} Confirmed (${order.order_no})`,
          message: balance === 0
            ? `Your order ${order.order_no} balance is now fully settled.${settledRoutes.length ? ` Forwarded to ${settledRoutes.join(' & ')}.` : ''}`
            : `Received KES ${amt.toLocaleString()}. Remaining balance: KES ${balance.toLocaleString()}.`,
          severity: 'success',
          refNo: order.order_no,
          recipientPhone: order.customer_phone || '',
          recipientName: order.customer_name || ''
        });

        return res.json({
          success: true,
          order,
          routed_to: settledRoutes,
          message: `Payment of KES ${amt.toLocaleString()} recorded. Remaining balance: KES ${balance.toLocaleString()}.${settledRoutes.length ? ` Sent to ${settledRoutes.join(' and ')}.` : ''}`
        });
      }

      if (action === 'flag_failed') {
        order.payment_status = 'failed';
        order.finance_release_status = 'payment_failed';
        order.finance_release_notes = credit_notes || 'Payment verification failed: transaction reference unmatched or unconfirmed.';
        order.order_status = 'pending';
        writeCashierOrders(orders);

        appendAuditLog(
          'Payment Flagged as Failed',
          `Order ${order.order_no} payment was flagged as FAILED by Finance (${order.finance_release_notes}). Order returned to Cashier for customer re-payment.`,
          `${cleanOfficer} (Finance)`,
          'Finance & Treasury'
        );

        moduleNotifications.notify({
          targetModules: ['cashier'],
          sourceModule: 'finance',
          senderName: cleanOfficer,
          title: `⚠️ Payment Verification Failed (${order.order_no})`,
          message: `Finance flagged payment on Order ${order.order_no} (${order.customer_name}): ${order.finance_release_notes}`,
          severity: 'danger',
          refNo: order.order_no,
          actionModule: 'cashier'
        });

        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'finance',
          senderName: cleanOfficer,
          title: `Payment Issue on Order ${order.order_no}`,
          message: `We could not verify payment for ${order.order_no}: ${order.finance_release_notes}. Please contact Cashier.`,
          severity: 'warning',
          refNo: order.order_no,
          recipientPhone: order.customer_phone || '',
          recipientName: order.customer_name || ''
        });

        return res.json({ success: true, order, message: `Order ${order.order_no} payment flagged as failed.` });
      }

      if (action === 'reject') {
        order.finance_release_status = 'credit_hold';
        order.finance_release_notes = credit_notes || 'Credit terms rejected by Finance. Goods placed on hold pending full settlement.';
        order.finance_released_by = cleanOfficer;
        order.finance_released_at = new Date().toISOString();
        writeCashierOrders(orders);

        appendAuditLog(
          'Order Credit Hold Imposed',
          `Order ${order.order_no} placed on credit hold by Finance (${order.finance_release_notes}).`,
          `${cleanOfficer} (Finance)`,
          'Finance & Treasury'
        );

        moduleNotifications.notify({
          targetModules: ['cashier'],
          sourceModule: 'finance',
          senderName: cleanOfficer,
          title: `🛑 Order ${order.order_no} Placed on Credit Hold`,
          message: `Finance held Order ${order.order_no} (${order.customer_name}, Balance Due: KES ${balance.toLocaleString()}): ${order.finance_release_notes}`,
          severity: 'warning',
          refNo: order.order_no,
          actionModule: 'cashier'
        });

        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'finance',
          senderName: cleanOfficer,
          title: `Order ${order.order_no} On Credit Hold`,
          message: `Order ${order.order_no} has a remaining balance of KES ${balance.toLocaleString()} awaiting settlement before release.`,
          severity: 'warning',
          refNo: order.order_no,
          recipientPhone: order.customer_phone || '',
          recipientName: order.customer_name || ''
        });

        return res.json({ success: true, order, message: `Order ${order.order_no} placed on credit hold.` });
      }

      if (action === 'release') {
        // Enforce Rule 5: Product with unpaid balance: Finance checks credit/payment policy before release
        if (balance > 0) {
          if (!credit_notes && !credit_policy_type) {
            return res.status(400).json({
              success: false,
              message: `Credit Policy Check Enforced: Order ${order.order_no} has an unpaid balance of KES ${balance.toLocaleString()}. Finance must specify credit verification notes or policy approval terms before releasing this order.`
            });
          }
        }

        const policyLabel = credit_policy_type ? `[Credit Policy: ${credit_policy_type}] ` : '';
        const noteText = credit_notes ? `${policyLabel}${credit_notes}` : 'Full payment verified and released by Finance Desk.';

        order.finance_release_status = 'released';
        order.finance_release_notes = noteText;
        order.credit_policy_type = credit_policy_type || order.credit_policy_type || '';
        if (credit_notes) order.credit_policy_notes = credit_notes;
        order.finance_released_by = cleanOfficer;
        order.finance_released_at = new Date().toISOString();

        if (balance === 0) {
          order.payment_status = 'paid';
          order.financial_clearance = 'approved';
        } else {
          order.payment_status = 'partially_paid';
          order.financial_clearance = 'approved_with_credit';
        }

        const routedTo = await finalizeFinanceConfirmedRouting(order, cleanOfficer, noteText);

        writeCashierOrders(orders);

        appendAuditLog(
          'Order Released by Finance',
          `Order ${order.order_no} (${order.customer_name}) verified and RELEASED by Finance${routedTo.length ? ` to ${routedTo.join(' & ')}` : ` for ${order.fulfillment_stage.toUpperCase()}`} (${noteText}).`,
          `${cleanOfficer} (Finance)`,
          'Finance & Treasury'
        );

        const destSummary = routedTo.length > 0
          ? `sent to ${routedTo.join(' and ')}`
          : `released for ${order.fulfillment_stage}`;

        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'finance',
          senderName: cleanOfficer,
          title: order.fulfillment_type === 'product_collection' && !order.requires_installation
            ? `Order ${order.order_no} Ready for Shop Collection`
            : `Order ${order.order_no} Confirmed by Finance`,
          message: order.fulfillment_type === 'product_collection' && !order.requires_installation
            ? `Finance confirmed your order ${order.order_no}. You may collect it at Elight Electrical Shop counter.`
            : `Finance confirmed your order ${order.order_no} (${destSummary}).${balance > 0 ? ` Remaining balance: KES ${balance.toLocaleString()}.` : ''}`,
          severity: 'success',
          refNo: order.order_no,
          recipientPhone: order.customer_phone || '',
          recipientName: order.customer_name || ''
        });

        return res.json({
          success: true,
          order,
          routed_to: routedTo,
          message: `Order ${order.order_no} confirmed by Finance and ${destSummary}!`
        });
      }

      return res.status(400).json({ success: false, message: 'Invalid release action.' });
    } catch (err) {
      console.error('releaseOrderByFinance error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // DISPATCH & DRIVER MODULES
  // ==========================================
  getDispatches: async (req, res) => {
    try {
      const driverFilter = String(req.query.driver || '').trim().toLowerCase();
      const dispatches = await interModuleSync.getDispatches(driverFilter);
      res.json({ success: true, count: dispatches.length, dispatches });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  createDispatch: async (req, res) => {
    try {
      const { order_no, customer_name, customer_phone, delivery_address, driver_name, scheduled_date, driver_notes } = req.body;

      if (order_no) {
        const orders = readCashierOrders();
        const ord = orders.find(o => String(o.order_no).toUpperCase() === String(order_no).toUpperCase());
        if (ord && ord.finance_release_status !== 'released') {
          return res.status(403).json({
            success: false,
            message: ord.unpaid_balance
              ? `Finance Credit Review Required: Order ${order_no} has an unpaid balance of KES ${(ord.balance_due || 0).toLocaleString()}. Finance must verify credit policy before release.`
              : `Finance Release Required: Order ${order_no} is awaiting Finance verification and release before delivery dispatch.`
          });
        }
      }

      const newDisp = await interModuleSync.createDispatchForOrder({
        order_no,
        customer_name,
        customer_phone,
        customer_location: delivery_address,
        payment_method: 'Manual Dispatch',
        payment_ref: 'DISP-MANUAL',
        cashier_name: driver_name || 'Dispatch Manager'
      });
      if (driver_notes && newDisp) newDisp.driver_notes = driver_notes;

      res.status(201).json({ success: true, dispatch: newDisp });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  updateDispatchStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, driver_notes, driver_name } = req.body;

      const updated = await interModuleSync.updateDispatchStatus(id, status, driver_notes, driver_name);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Dispatch record not found.' });
      }

      res.json({ success: true, dispatch: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // INVENTORY MOVEMENTS (Stock-In / Stock-Out)
  // ==========================================
  getStockMovements: async (req, res) => {
    try {
      const movements = await interModuleSync.getStockMovements();
      res.json({ success: true, count: movements.length, movements });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  recordStockMovement: async (req, res) => {
    try {
      const { product_id, product_name, type, quantity, reason, recorded_by } = req.body;
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();

      // Only the Inventory Manager or Administrator should update stock quantities manually
      const allowedRoles = ['inventory_manager', 'inventory', 'storekeeper', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowedRoles.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Inventory Manager or Administrator should update stock quantities.'
        });
      }

      const qtyNum = Math.abs(Number(quantity) || 1);
      const adjResult = await interModuleSync.adjustProductStock({
        productId: product_id,
        productName: product_name,
        deltaQuantity: qtyNum,
        type: type || 'STOCK_IN',
        reason: reason || 'Manual stock update',
        actor: recorded_by || 'Grace Kerubo (Inventory Manager)'
      });

      if (!adjResult.success) {
        return res.status(400).json({ success: false, message: adjResult.message || 'Could not adjust stock.' });
      }

      res.status(201).json({
        success: true,
        movement: adjResult.movement,
        product: adjResult.product,
        current_stock: adjResult.current_stock
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // CASHIER MODULE (Connects Customer, Inventory, Finance & Dispatch)
  // ==========================================
  getCashierOrders: async (req, res) => {
    try {
      const localOrders = readCashierOrders();
      const seenKeys = new Set(localOrders.map(o => String(o.order_no || '').toUpperCase()));

      const [finRes, dispRes, bookRes, invRes, custRes] = await Promise.all([
        supabase.from('finance_records').select('*').eq('type', 'sale').order('record_id', { ascending: false }).limit(40),
        supabase.from('dispatches').select('*').order('dispatch_id', { ascending: false }).limit(40),
        supabase.from('bookings').select('*').order('booking_id', { ascending: false }).limit(25),
        supabase.from('inventory').select('*').order('product_id', { ascending: false }),
        supabase.from('customers').select('*').order('customer_id', { ascending: false })
      ]);

      const dispatchByOrder = {};
      (dispRes.data || []).forEach(d => {
        if (d.order_no) dispatchByOrder[String(d.order_no).toUpperCase()] = d;
      });

      // Sync live dispatch status back onto local orders (e.g. if Driver delivered an order!)
      localOrders.forEach(o => {
        const d = dispatchByOrder[String(o.order_no || '').toUpperCase()];
        if (d) {
          if (d.status === 'delivered') {
            o.delivery_status = 'delivered';
            if (!['installation_pending', 'scheduled_installation_pending', 'installed_and_completed'].includes(o.fulfillment_status)) {
              o.fulfillment_status = 'delivered';
            }
          } else if (d.status === 'out_for_delivery') {
            o.delivery_status = 'out_for_delivery';
            o.fulfillment_status = 'out_for_delivery';
          } else if (d.status === 'failed') {
            o.delivery_status = 'failed';
          } else if (d.status === 'pending_dispatch' && o.fulfillment_status !== 'collected') {
            o.fulfillment_status = 'sent_to_dispatch';
          }
        }
      });

      const mergedOrders = [...localOrders];

      // Include product/service bookings from Customers that haven't been converted yet
      (bookRes.data || []).forEach(b => {
        const ref = String(b.booking_ref || `BK-${b.booking_id}`);
        if (seenKeys.has(ref.toUpperCase())) return;
        seenKeys.add(ref.toUpperCase());

        const isPaid = String(b.status || '').toLowerCase() === 'completed';
        const amt = Number(b.estimated_amount || 0);
        mergedOrders.push({
          order_no: ref,
          receipt_no: isPaid ? `RCP-${ref}` : '',
          source: b.booking_type === 'product' ? 'Customer Product Booking' : 'Customer Service Booking',
          customer_name: b.customer_name || 'Customer',
          customer_phone: b.customer_phone || '',
          customer_location: b.location_or_notes || 'Meru County',
          items: [
            {
              product_id: null,
              product_name: b.item_or_service_name || 'Electrical Order',
              quantity: Number(b.quantity || 1),
              unit_price: Number(b.quantity || 1) > 0 ? amt / Number(b.quantity || 1) : amt
            }
          ],
          subtotal: amt,
          delivery_fee: 0,
          total_amount: amt,
          payment_status: isPaid ? 'paid' : 'pending',
          payment_method: 'M-Pesa',
          payment_ref: isPaid ? ref : 'Awaiting Payment at Counter / M-Pesa',
          cash_tendered: isPaid ? amt : 0,
          change_due: 0,
          fulfillment_type: b.booking_type === 'product' ? 'product_collection' : 'service_only',
          fulfillment_mode: b.booking_type === 'product' ? 'collection' : 'service',
          fulfillment_stage: isPaid ? 'collection' : 'cashier',
          fulfillment_status: isPaid ? 'collected' : 'awaiting_cashier_confirmation',
          finance_release_status: isPaid ? 'released' : 'awaiting_cashier',
          requires_installation: b.booking_type !== 'product',
          cashier_confirmed: isPaid,
          cashier_served: isPaid,
          cashier_name: isPaid ? 'Esther Karimi' : '',
          stock_deducted: isPaid,
          booking_id: b.booking_id,
          created_at: b.created_at || b.preferred_date || new Date().toISOString(),
          paid_at: isPaid ? (b.created_at || new Date().toISOString()) : null
        });
      });

      // Include historical confirmed sales from finance_records
      (finRes.data || []).forEach(r => {
        const ref = String(r.reference_no || `SALE-${r.record_id}`);
        if (seenKeys.has(ref.toUpperCase())) return;
        seenKeys.add(ref.toUpperCase());

        const cashierMatch = String(r.description || '').match(/\[Cashier:\s*([^\]]+)\]/i);
        const cleanDesc = String(r.description || 'Shop Sale').replace(/\s*\[Cashier:[^\]]+\]/i, '').trim();
        const linkedDisp = dispatchByOrder[ref.toUpperCase()];
        const amt = Number(r.amount || 0);

        let fStatus = 'collected';
        let fMode = 'collection';
        if (linkedDisp) {
          fMode = 'delivery';
          fStatus = linkedDisp.status === 'delivered'
            ? 'delivered'
            : (linkedDisp.status === 'out_for_delivery' ? 'out_for_delivery' : 'sent_to_dispatch');
        }

        mergedOrders.push({
          order_no: ref,
          receipt_no: `RCP-${r.record_id}`,
          source: r.category || 'Shop Sale',
          customer_name: linkedDisp?.customer_name || 'Walk-In / Shop Customer',
          customer_phone: linkedDisp?.customer_phone || '',
          customer_location: linkedDisp?.delivery_address || 'Meru Town Showroom',
          items: [
            { product_id: null, product_name: cleanDesc, quantity: 1, unit_price: amt }
          ],
          subtotal: amt,
          delivery_fee: 0,
          total_amount: amt,
          payment_status: String(r.status || 'confirmed').toLowerCase() === 'pending' ? 'pending' : 'paid',
          payment_method: r.payment_method || 'M-Pesa',
          payment_ref: ref,
          cash_tendered: amt,
          change_due: 0,
          fulfillment_mode: fMode,
          fulfillment_status: fStatus,
          cashier_name: cashierMatch ? cashierMatch[1].trim() : 'Esther Karimi',
          stock_deducted: true,
          finance_record_id: r.record_id,
          created_at: r.created_at || new Date().toISOString(),
          paid_at: r.created_at || new Date().toISOString()
        });
      });

      // Normalize order pipeline fields (keeping delivery_status & installation_status strictly independent)
      const normalizedOrders = mergedOrders.map(normalizeOrderDualStatuses);

      // Sort strictly by latest order first (newest created_at timestamp at the top)
      normalizedOrders.sort((a, b) => {
        const timeB = new Date(b.created_at || b.paid_at || 0).getTime() || 0;
        const timeA = new Date(a.created_at || a.paid_at || 0).getTime() || 0;
        return timeB - timeA;
      });

      const products = invRes.data || [];
      const inStockProducts = products.filter(p => Number(p.quantity_in_stock || 0) > 0);
      const confirmedFinanceTotal = (finRes.data || [])
        .filter(f => String(f.status || 'confirmed').toLowerCase() !== 'pending')
        .reduce((s, f) => s + Number(f.amount || 0), 0);

      res.json({
        success: true,
        orders: normalizedOrders,
        connections: {
          customersCount: (custRes.data || []).length,
          pendingCustomerOrders: mergedOrders.filter(o => o.payment_status !== 'paid').length,
          inStockProductsCount: inStockProducts.length,
          totalCatalogCount: products.length,
          financeSyncedRevenue: confirmedFinanceTotal,
          activeDispatchesCount: (dispRes.data || []).filter(d => d.status !== 'delivered').length
        },
        products,
        customers: custRes.data || []
      });
    } catch (err) {
      console.error('getCashierOrders error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  recordCashierSale: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      if (callerRole && callerRole !== 'cashier') {
        if (callerRole === 'admin' || callerRole === 'administrator' || callerRole === 'owner' || callerRole === 'superadmin') {
          return res.status(403).json({
            success: false,
            message: "Admin Governance Rule: The Admin manages permissions and governance, and cannot bypass the Cashier's normal sales and payment process. Please log in as the Cashier (Esther Karimi) to process and confirm sales."
          });
        }
        return res.status(403).json({
          success: false,
          message: "Access Denied: Only the Cashier should confirm payments and issue sales receipts."
        });
      }

      const {
        customer_name,
        customer_phone,
        customer_location,
        items,
        delivery_fee,
        payment_method,
        payment_ref,
        cash_tendered,
        split_cash_amount,
        split_mpesa_amount,
        fulfillment_mode,
        fulfillment_type,
        amount_paid,
        credit_policy_notes,
        cashier_name
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Please add at least one product item to record a sale.' });
      }

      const cleanCustomer = String(customer_name || 'Walk-In Customer').trim();
      const cleanPhone = String(customer_phone || '').trim();
      const cleanLocation = String(customer_location || 'Meru Town Showroom').trim();
      const cleanCashier = String(cashier_name || 'Esther Karimi').trim();
      const cleanMethod = String(payment_method || 'M-Pesa').trim();
      const delivFee = Math.max(0, Number(delivery_fee || 0));

      const normalizedItems = items.map(it => ({
        product_id: it.product_id ? Number(it.product_id) : null,
        product_name: String(it.product_name || 'Electrical Item').trim(),
        quantity: Math.max(1, Number(it.quantity || 1)),
        unit_price: Math.max(0, Number(it.unit_price || 0))
      }));

      if (normalizedItems.some(it => Number(it.unit_price || 0) <= 0)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot accept a sale containing an item with KSh 0 unit price.'
        });
      }

      const subtotal = normalizedItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
      const totalAmount = subtotal + delivFee;

      if (Number.isNaN(totalAmount) || totalAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot accept or record a sale with KSh 0 total amount.'
        });
      }

      const posRefCheck = validatePaymentReference(cleanMethod, payment_ref, { required: false, label: 'Payment reference' });
      if (!posRefCheck.valid) {
        return res.status(400).json({ success: false, message: posRefCheck.message });
      }

      // Extract fulfillment type according to the 5 business workflows:
      // 1. Product only: Cashier -> Finance -> Delivery
      // 2. Product + installation: Cashier -> Finance -> Delivery -> Installation
      // 3. Product collected from shop: Cashier -> Finance -> Collection
      // 4. Product + installation booked later: Cashier -> Finance -> Delivery -> Scheduled installation
      // 5. Product with unpaid balance: Finance checks credit/payment policy before release
      const rawType = String(fulfillment_type || '').trim();
      const rawMode = String(fulfillment_mode || '').trim().toLowerCase();
      const explicitlyNeedsInst = Boolean(
        req.body.requires_installation ||
        req.body.installation_required ||
        req.body.service_type ||
        Number(req.body.installation_fee || 0) > 0 ||
        rawType === 'product_delivery_install' ||
        rawType === 'product_install_later'
      );
      let fType = 'product_collection';
      if (['product_delivery', 'product_delivery_install', 'product_collection', 'product_install_later'].includes(rawType)) {
        fType = rawType;
      } else if (rawMode.includes('delivery')) {
        fType = explicitlyNeedsInst ? 'product_delivery_install' : 'product_delivery';
      } else {
        // Collection stays 'product_collection' even when installation is also requested independently
        fType = 'product_collection';
      }
      if (explicitlyNeedsInst && fType === 'product_delivery') {
        fType = req.body.schedule_install_later ? 'product_install_later' : 'product_delivery_install';
      }
      const needsInst = explicitlyNeedsInst;

      const rawPaid = req.body.amount_paid !== undefined ? Number(req.body.amount_paid) : totalAmount;
      if (Number.isNaN(rawPaid) || rawPaid <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot accept a sale with KSh 0 payment amount. Payment amount must be greater than KSh 0.'
        });
      }
      const cleanPaid = rawPaid;
      const balanceDue = Math.max(0, totalAmount - cleanPaid);
      const hasUnpaidBalance = balanceDue > 0;
      const paymentStatus = cleanPaid === 0 ? 'unpaid' : 'pending_verification';

      // Rule 5: Product with unpaid balance: Finance checks credit/payment policy before release.
      // All orders enter Finance verification stage before release to Delivery or Collection!
      const financeReleaseStatus = hasUnpaidBalance ? 'pending_credit_review' : 'pending_finance';
      const fulfillmentStage = 'finance';
      const fulfillmentStatus = hasUnpaidBalance ? 'pending_credit_review' : 'pending_finance_release';

      const isSplit = cleanMethod === 'Split' || /split|half/i.test(cleanMethod);
      const splitCash = isSplit
        ? Math.max(0, Math.min(cleanPaid, Number(req.body.split_cash_amount ?? Math.round(cleanPaid / 2))))
        : 0;
      const splitMpesa = isSplit
        ? Math.max(0, Number(req.body.split_mpesa_amount ?? (cleanPaid - splitCash)))
        : 0;

      const tendered = cleanMethod === 'Cash'
        ? Math.max(cleanPaid, Number(cash_tendered || cleanPaid))
        : (isSplit ? Math.max(splitCash, Number(cash_tendered || splitCash)) : cleanPaid);
      const changeDue = cleanMethod === 'Cash'
        ? Math.max(0, tendered - cleanPaid)
        : (isSplit ? Math.max(0, tendered - splitCash) : 0);

      const stamp = Math.floor(100000 + Math.random() * 900000);
      const orderNo = `EL-${stamp}`;
      const receiptNo = `RCP-${stamp}`;
      const refCode = posRefCheck.value
        ? posRefCheck.value
        : (cleanMethod === 'Cash' ? `CASH-${stamp}` : `MPESA-${stamp}`);

      const finalMethodLabel = isSplit ? 'Split (Cash + M-Pesa)' : cleanMethod;

      // 1. INVENTORY MANAGER CONNECTION: Deduct stock & log STOCK_OUT movement
      for (const item of normalizedItems) {
        await interModuleSync.adjustProductStock({
          productId: item.product_id,
          productName: item.product_name,
          deltaQuantity: -item.quantity,
          type: 'STOCK_OUT',
          reason: `Counter Sale ${orderNo} to ${cleanCustomer}`,
          actor: `${cleanCashier} (Cashier)`
        });
      }

      // 2. FINANCE MANAGER CONNECTION: Post payment to finance_records
      const summaryText = normalizedItems.map(i => `${i.quantity}x ${i.product_name}`).join(', ');
      const localFinRecs = readFinanceRecords();
      const creditNoteSuffix = hasUnpaidBalance ? ` [UNPAID BALANCE: KES ${balanceDue.toLocaleString()} - Pending Finance Credit Review]` : '';

      if (cleanPaid > 0) {
        if (isSplit) {
          localFinRecs.unshift(
            {
              record_id: Date.now(),
              type: 'sale',
              category: 'Shop Sale',
              description: `Sale ${orderNo} (${cleanCustomer}) [Split Payment — Cash Portion: KES ${splitCash.toLocaleString()}]${creditNoteSuffix}: ${summaryText} [Cashier: ${cleanCashier}]`,
              amount: splitCash,
              payment_method: 'Cash',
              reference_no: `CASH-${stamp}`,
              status: 'confirmed',
              created_at: new Date().toISOString()
            },
            {
              record_id: Date.now() + 1,
              type: 'sale',
              category: 'Shop Sale',
              description: `Sale ${orderNo} (${cleanCustomer}) [Split Payment — M-Pesa Portion: KES ${splitMpesa.toLocaleString()}]${creditNoteSuffix}: ${summaryText} [Cashier: ${cleanCashier}]`,
              amount: splitMpesa,
              payment_method: 'M-Pesa',
              reference_no: refCode,
              status: 'confirmed',
              created_at: new Date().toISOString()
            }
          );
          writeFinanceRecords(localFinRecs);

          try {
            await supabase.from('finance_records').insert([
              {
                type: 'sale',
                category: 'Shop Sale',
                description: `Sale ${orderNo} (${cleanCustomer}) [Split Payment — Cash Portion: KES ${splitCash.toLocaleString()}]${creditNoteSuffix}: ${summaryText} [Cashier: ${cleanCashier}]`,
                amount: splitCash,
                payment_method: 'Cash',
                reference_no: `CASH-${stamp}`,
                status: 'confirmed'
              },
              {
                type: 'sale',
                category: 'Shop Sale',
                description: `Sale ${orderNo} (${cleanCustomer}) [Split Payment — M-Pesa Portion: KES ${splitMpesa.toLocaleString()}]${creditNoteSuffix}: ${summaryText} [Cashier: ${cleanCashier}]`,
                amount: splitMpesa,
                payment_method: 'M-Pesa',
                reference_no: refCode,
                status: 'confirmed'
              }
            ]);
          } catch (e) {}
        } else {
          localFinRecs.unshift({
            record_id: Date.now(),
            type: 'sale',
            category: 'Shop Sale',
            description: `Sale ${orderNo} (${cleanCustomer}) [Paid: KES ${cleanPaid.toLocaleString()} via ${cleanMethod}]${creditNoteSuffix}: ${summaryText} [Cashier: ${cleanCashier}]`,
            amount: cleanPaid,
            payment_method: cleanMethod,
            reference_no: refCode,
            status: 'confirmed',
            created_at: new Date().toISOString()
          });
          writeFinanceRecords(localFinRecs);

          try {
            await supabase.from('finance_records').insert([{
              type: 'sale',
              category: 'Shop Sale',
              description: `Sale ${orderNo} (${cleanCustomer}) [Paid: KES ${cleanPaid.toLocaleString()} via ${cleanMethod}]${creditNoteSuffix}: ${summaryText} [Cashier: ${cleanCashier}]`,
              amount: cleanPaid,
              payment_method: cleanMethod,
              reference_no: refCode,
              status: 'confirmed'
            }]);
          } catch (e) {}
        }
      }

      // 3. CUSTOMER CONNECTION: Ensure customer exists in customers directory
      if (cleanPhone && cleanCustomer.toLowerCase() !== 'walk-in customer') {
        try {
          const { data: existingCust } = await supabase
            .from('customers')
            .select('customer_id')
            .eq('phone', cleanPhone)
            .limit(1);

          if (!existingCust || existingCust.length === 0) {
            await supabase.from('customers').insert([{
              full_name: cleanCustomer,
              phone: cleanPhone,
              email: null,
              location: cleanLocation,
              notes: `Registered at Cashier counter (${orderNo})`
            }]);
          }
        } catch (e) {}
      }

      // 4. ORDER FULFILLMENT GATEWAY (Cashier -> Finance -> Delivery / Collection / Installation)
      // Per business rules, orders are NOT released directly to delivery or collection here.
      // Finance must review/verify payment and credit policy before release!
      const nowIso = new Date().toISOString();
      const invoiceNo = `INV-${orderNo.replace(/^EL-/, '') || Date.now().toString().slice(-6)}`;
      const newOrder = {
        order_no: orderNo,
        order_number: orderNo,
        invoice_no: invoiceNo,
        receipt_no: receiptNo,
        source: 'Walk-In Shop Sale',
        customer_name: cleanCustomer,
        customer_phone: cleanPhone,
        customer_location: cleanLocation,
        items: normalizedItems,
        subtotal,
        delivery_fee: delivFee,
        total_amount: totalAmount,
        amount_paid: cleanPaid,
        balance_due: balanceDue,
        unpaid_balance: hasUnpaidBalance,
        order_status: 'processing',
        status: 'processing',
        payment_status: paymentStatus,
        delivery_status: 'not_scheduled',
        installation_status: needsInst ? 'requested' : 'not_requested',
        requires_installation: Boolean(needsInst),
        schedule_install_later: Boolean(req.body.schedule_install_later || fType === 'product_install_later'),
        service_type: req.body.service_type || (needsInst ? 'Product Installation' : null),
        installation_fee: Number(req.body.installation_fee || 0),
        scheduled_date: req.body.scheduled_date || null,
        packing_status: 'pending',
        site_ready_for_installation: fType === 'product_collection',
        payment_method: finalMethodLabel,
        payment_ref: refCode,
        cash_tendered: tendered,
        change_due: changeDue,
        split_details: isSplit ? {
          cash_amount: splitCash,
          mpesa_amount: splitMpesa,
          cash_tendered: tendered,
          change_due: changeDue,
          mpesa_ref: refCode
        } : null,
        fulfillment_type: fType,
        fulfillment_mode: fType === 'product_collection' ? 'collection' : 'delivery',
        fulfillment_stage: fulfillmentStage,
        fulfillment_status: fulfillmentStatus,
        finance_release_status: financeReleaseStatus,
        finance_release_notes: '',
        finance_released_by: null,
        finance_released_at: null,
        credit_policy_notes: String(credit_policy_notes || ''),
        balance_note: hasUnpaidBalance
          ? (String(credit_policy_notes || '').trim() || `Customer has unpaid balance of KES ${balanceDue.toLocaleString()} (Noted by Cashier ${cleanCashier})`)
          : '',
        cashier_served: true,
        cashier_served_at: nowIso,
        cashier_name: cleanCashier,
        stock_deducted: true,
        created_at: nowIso,
        paid_at: cleanPaid > 0 ? nowIso : null
      };

      const orders = readCashierOrders();
      orders.unshift(newOrder);
      writeCashierOrders(orders);

      appendAuditLog(
        'Cashier Sale & Receipt Generated',
        `Order ${orderNo} (${receiptNo}) • KES ${totalAmount.toLocaleString()} (${cleanPaid.toLocaleString()} paid, ${balanceDue.toLocaleString()} balance due) via ${cleanMethod} (${refCode}) for ${cleanCustomer}. Pipeline: ${fType} [Stage: Finance].`,
        `${cleanCashier} (Cashier)`,
        'Cashier & Sales'
      );

      moduleNotifications.notify({
        targetModules: ['finance', 'finance_releases'],
        sourceModule: 'cashier',
        senderName: cleanCashier,
        title: hasUnpaidBalance
          ? `⚠️ Order ${orderNo} Sent to Finance — Customer Balance: KES ${balanceDue.toLocaleString()}`
          : `Order ${orderNo} Sent to Finance for Confirmation`,
        message: `Cashier ${cleanCashier} served ${cleanCustomer}: Paid KES ${cleanPaid.toLocaleString()} of KES ${totalAmount.toLocaleString()} (${cleanMethod}).${hasUnpaidBalance ? ` Customer Balance Due: KES ${balanceDue.toLocaleString()}.${newOrder.balance_note ? ` Note: ${newOrder.balance_note}` : ''}` : ' Full payment settled.'}`,
        severity: hasUnpaidBalance ? 'warning' : 'info',
        refNo: orderNo,
        actionModule: 'finance_releases'
      });

      moduleNotifications.notify({
        targetModules: ['customer'],
        sourceModule: 'cashier',
        senderName: cleanCashier,
        title: `Receipt ${receiptNo} Issued (${orderNo})`,
        message: hasUnpaidBalance
          ? `Paid KES ${cleanPaid.toLocaleString()} for ${orderNo}. Remaining balance due: KES ${balanceDue.toLocaleString()}. Submitted to Finance confirmation.`
          : `Paid KES ${cleanPaid.toLocaleString()} in full for ${orderNo}. Submitted to Finance confirmation.`,
        severity: hasUnpaidBalance ? 'warning' : 'success',
        refNo: orderNo,
        recipientPhone: cleanPhone,
        recipientName: cleanCustomer
      });

      res.status(201).json({ success: true, order: newOrder });
    } catch (err) {
      console.error('recordCashierSale error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  confirmOrderPayment: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      if (callerRole && callerRole !== 'cashier') {
        if (callerRole === 'admin' || callerRole === 'administrator' || callerRole === 'owner' || callerRole === 'superadmin') {
          return res.status(403).json({
            success: false,
            message: "Admin Governance Rule: The Admin manages permissions and governance, and cannot bypass the Cashier's normal sales and payment process. Please log in as the Cashier (Esther Karimi) to confirm payments and issue sales receipts."
          });
        }
        return res.status(403).json({
          success: false,
          message: "Access Denied: Only the Cashier should confirm payments and issue sales receipts."
        });
      }

      const targetNo = String(req.params.orderNo || '').trim();
      const { payment_method, payment_ref, cash_tendered, cashier_name } = req.body;
      const cleanCashier = String(cashier_name || 'Esther Karimi').trim();
      const cleanMethod = String(payment_method || 'M-Pesa').trim();

      const orders = readCashierOrders();
      let order = orders.find(o => String(o.order_no).toUpperCase() === targetNo.toUpperCase());

      // If confirming a Customer Booking that wasn't in cashier_orders.json yet, hydrate it from bookings table
      if (!order && targetNo.toUpperCase().startsWith('BK-')) {
        const { data: bk } = await supabase
          .from('bookings')
          .select('*')
          .ilike('booking_ref', targetNo)
          .maybeSingle();

        if (bk) {
          const amt = Number(bk.estimated_amount || 0);
          order = {
            order_no: bk.booking_ref,
            receipt_no: '',
            source: bk.booking_type === 'product' ? 'Customer Product Booking' : 'Customer Service Booking',
            customer_name: bk.customer_name || 'Customer',
            customer_phone: bk.customer_phone || '',
            customer_location: bk.location_or_notes || 'Meru County',
            items: [{
              product_id: null,
              product_name: bk.item_or_service_name || 'Booked Item',
              quantity: Number(bk.quantity || 1),
              unit_price: Number(bk.quantity || 1) > 0 ? amt / Number(bk.quantity || 1) : amt
            }],
            subtotal: amt,
            delivery_fee: 0,
            total_amount: amt,
            payment_status: 'pending',
            payment_method: cleanMethod,
            payment_ref: '',
            fulfillment_mode: 'collection',
            fulfillment_status: 'awaiting_payment',
            stock_deducted: false,
            booking_id: bk.booking_id,
            created_at: bk.created_at || new Date().toISOString()
          };
          orders.unshift(order);
        }
      }

      if (!order) {
        return res.status(404).json({ success: false, message: `Order ${targetNo} not found.` });
      }

      const totalAmount = Number(order.total_amount || 0);
      if (Number.isNaN(totalAmount) || totalAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot accept or confirm payment for order ${order.order_no} with KSh 0 total amount.`
        });
      }
      const rawPaid = req.body.amount_paid !== undefined ? Number(req.body.amount_paid) : totalAmount;
      if (Number.isNaN(rawPaid) || rawPaid <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot accept a KSh 0 payment amount. Payment amount must be greater than KSh 0.'
        });
      }
      if (rawPaid > totalAmount) {
        return res.status(400).json({
          success: false,
          message: `Amount paid (KES ${rawPaid.toLocaleString()}) cannot exceed order total (KES ${totalAmount.toLocaleString()}). Use Cash Tendered for change.`
        });
      }
      const confirmRefCheck = validatePaymentReference(cleanMethod, payment_ref, { required: false, label: 'Payment reference' });
      if (!confirmRefCheck.valid) {
        return res.status(400).json({ success: false, message: confirmRefCheck.message });
      }
      const amountPaid = rawPaid;
      const balanceDue = Math.max(0, totalAmount - amountPaid);
      const hasUnpaid = balanceDue > 0;
      const cleanBalanceNote = String(req.body.credit_policy_notes || req.body.balance_note || '').trim();

      const isSplit = cleanMethod === 'Split' || /split|half/i.test(cleanMethod);
      const splitCash = isSplit
        ? Math.max(0, Math.min(amountPaid, Number(req.body.split_cash_amount ?? Math.round(amountPaid / 2))))
        : 0;
      const splitMpesa = isSplit
        ? Math.max(0, Number(req.body.split_mpesa_amount ?? (amountPaid - splitCash)))
        : 0;

      const tendered = cleanMethod === 'Cash'
        ? Math.max(amountPaid, Number(cash_tendered || amountPaid))
        : (isSplit ? Math.max(splitCash, Number(cash_tendered || splitCash)) : amountPaid);
      const changeDue = cleanMethod === 'Cash'
        ? Math.max(0, tendered - amountPaid)
        : (isSplit ? Math.max(0, tendered - splitCash) : 0);

      const stamp = Math.floor(100000 + Math.random() * 900000);
      const refCode = confirmRefCheck.value
        ? confirmRefCheck.value
        : (cleanMethod === 'Cash' ? `CASH-${stamp}` : `MPESA-${stamp}`);

      const finalMethodLabel = isSplit ? 'Split (Cash + M-Pesa)' : cleanMethod;
      const servedAtIso = new Date().toISOString();

      order.amount_paid = amountPaid;
      order.balance_due = balanceDue;
      order.unpaid_balance = hasUnpaid;
      order.payment_status = hasUnpaid ? (amountPaid > 0 ? 'partial' : 'unpaid') : 'paid';
      order.payment_method = finalMethodLabel;
      order.payment_ref = refCode;
      order.cash_tendered = tendered;
      order.change_due = changeDue;
      order.cashier_name = cleanCashier;
      order.cashier_confirmed = true;
      order.cashier_served = true;
      order.cashier_served_at = servedAtIso;
      order.paid_at = servedAtIso;
      order.order_status = 'processing';
      order.status = 'processing';
      order.credit_policy_notes = hasUnpaid
        ? (cleanBalanceNote || order.credit_policy_notes || '')
        : '';
      order.balance_note = hasUnpaid
        ? (cleanBalanceNote || `Customer has unpaid balance of KES ${balanceDue.toLocaleString()} (Noted by Cashier ${cleanCashier})`)
        : '';

      // Enforce Finance Gate:
      // Once served by Cashier, order passes to Finance Manager for confirmation / credit balance review.
      if (order.finance_release_status !== 'released') {
        order.finance_release_status = hasUnpaid ? 'pending_credit_review' : 'pending_finance';
        order.fulfillment_stage = 'finance';
        order.fulfillment_status = hasUnpaid ? 'pending_credit_review' : 'pending_finance_release';
      }
      if (isSplit) {
        order.split_details = {
          cash_amount: splitCash,
          mpesa_amount: splitMpesa,
          cash_tendered: tendered,
          change_due: changeDue,
          mpesa_ref: refCode
        };
      }
      if (!order.receipt_no) {
        order.receipt_no = 'RCP-' + String(order.order_no).replace(/^EL-|^BK-/i, '');
      }
      if (order.finance_release_status === 'released' && order.fulfillment_status === 'awaiting_payment') {
        order.fulfillment_status = 'paid_awaiting_handoff';
      }

      // 1. INVENTORY MANAGER CONNECTION: Deduct stock if not yet deducted
      if (!order.stock_deducted && Array.isArray(order.items)) {
        for (const item of order.items) {
          const qty = Math.max(1, Number(item.quantity || 1));
          await interModuleSync.adjustProductStock({
            productId: item.product_id,
            productName: item.product_name,
            deltaQuantity: -qty,
            type: 'STOCK_OUT',
            reason: `Paid Customer Order ${order.order_no} (${order.customer_name})`,
            actor: `${cleanCashier} (Cashier)`
          });
        }
        order.stock_deducted = true;
      }

      // 2. FINANCE MANAGER CONNECTION: Confirm or insert sale in finance_records and pass to Finance confirmation
      const itemSummary = (order.items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
      const finBalanceNote = hasUnpaid
        ? ` [UNPAID BALANCE: KES ${balanceDue.toLocaleString()} - Pending Finance Confirmation${cleanBalanceNote ? ` | Note: ${cleanBalanceNote}` : ''}]`
        : ' [Paid in Full - Pending Finance Confirmation]';
      const localFin = readFinanceRecords();
      if (isSplit) {
        localFin.unshift(
          {
            record_id: Date.now(),
            type: 'sale',
            category: 'Customer Order Payment',
            description: `Confirmed Order ${order.order_no} (${order.customer_name}) [Split Payment — Cash Portion: KES ${splitCash.toLocaleString()}]${finBalanceNote}: ${itemSummary} [Cashier: ${cleanCashier}]`,
            amount: splitCash,
            payment_method: 'Cash',
            reference_no: `CASH-${stamp}`,
            status: 'confirmed',
            created_at: servedAtIso
          },
          {
            record_id: Date.now() + 1,
            type: 'sale',
            category: 'Customer Order Payment',
            description: `Confirmed Order ${order.order_no} (${order.customer_name}) [Split Payment — M-Pesa Portion: KES ${splitMpesa.toLocaleString()}]${finBalanceNote}: ${itemSummary} [Cashier: ${cleanCashier}]`,
            amount: splitMpesa,
            payment_method: 'M-Pesa',
            reference_no: refCode,
            status: 'confirmed',
            created_at: servedAtIso
          }
        );
      } else {
        const subRefUpper = String(order.submitted_payment_ref || '').trim().toUpperCase();
        const existingFinLocal = localFin.find(f => {
          const fRef = String(f.reference_no || '').trim().toUpperCase();
          return fRef === String(order.order_no).toUpperCase() ||
            fRef === String(refCode).toUpperCase() ||
            (subRefUpper && fRef === subRefUpper);
        });
        if (existingFinLocal) {
          existingFinLocal.status = 'confirmed';
          existingFinLocal.amount = amountPaid;
          existingFinLocal.payment_method = cleanMethod;
          existingFinLocal.reference_no = refCode;
          existingFinLocal.description = `${String(existingFinLocal.description || '').replace(/\s*\[UNPAID BALANCE:[^\]]*\]/gi, '').replace(/\s*\[Paid in Full[^\]]*\]/gi, '').replace(/\s*\[Customer Ref:[^\]]*\]/gi, '').replace(/\s*\[Pending Cashier\]/gi, '')}${finBalanceNote}${!/\[Cashier:/i.test(existingFinLocal.description || '') ? ` [Cashier: ${cleanCashier}]` : ''}`;
        } else {
          localFin.unshift({
            record_id: Date.now(),
            type: 'sale',
            category: 'Customer Order Payment',
            description: `Confirmed Order ${order.order_no} (${order.customer_name}) [Paid: KES ${amountPaid.toLocaleString()} via ${cleanMethod}]${finBalanceNote}: ${itemSummary} [Cashier: ${cleanCashier}]`,
            amount: amountPaid,
            payment_method: cleanMethod,
            reference_no: refCode,
            status: 'confirmed',
            created_at: servedAtIso
          });
        }
      }
      writeFinanceRecords(localFin);

      try {
        const refCandidates = [order.order_no, refCode, order.submitted_payment_ref].filter(Boolean);
        let existingFin = null;
        for (const cand of refCandidates) {
          const { data: foundFin } = await supabase
            .from('finance_records')
            .select('record_id, description')
            .eq('reference_no', cand)
            .maybeSingle();
          if (foundFin) {
            existingFin = foundFin;
            break;
          }
        }

        if (existingFin) {
          const baseDesc = String(existingFin.description || '').replace(/\s*\[UNPAID BALANCE:[^\]]*\]/gi, '').replace(/\s*\[Paid in Full[^\]]*\]/gi, '').replace(/\s*\[Customer Ref:[^\]]*\]/gi, '').replace(/\s*\[Pending Cashier\]/gi, '');
          const descWithCashier = `${baseDesc}${finBalanceNote}${/\[Cashier:/i.test(baseDesc) ? '' : ` [Cashier: ${cleanCashier}]`}`;
          await supabase
            .from('finance_records')
            .update({
              status: 'confirmed',
              amount: amountPaid,
              payment_method: cleanMethod,
              reference_no: refCode,
              description: descWithCashier
            })
            .eq('record_id', existingFin.record_id);
        } else {
          await supabase.from('finance_records').insert([{
            type: 'sale',
            category: 'Customer Order Payment',
            description: `Confirmed Order ${order.order_no} (${order.customer_name}) [Paid: KES ${amountPaid.toLocaleString()} via ${cleanMethod}]${finBalanceNote}: ${itemSummary} [Cashier: ${cleanCashier}]`,
            amount: amountPaid,
            payment_method: cleanMethod,
            reference_no: refCode,
            status: 'confirmed'
          }]);
        }
      } catch (e) {}

      // 3. Customer Booking Connection: Update Customer Booking if linked
      const bookingRefToFind = order.booking_ref || (order.order_no.startsWith('BK-') ? order.order_no : null);
      if (bookingRefToFind || order.booking_id) {
        try {
          const bookings = await interModuleSync.getBookings();
          const b = bookings.find(item =>
            (bookingRefToFind && String(item.booking_ref).toUpperCase() === String(bookingRefToFind).toUpperCase()) ||
            (order.booking_id && Number(item.booking_id) === Number(order.booking_id))
          );
          if (b) {
            b.status = 'completed';
            b.confirmation_note = `Served by Cashier ${cleanCashier} (${hasUnpaid ? `Paid KES ${amountPaid.toLocaleString()}, Balance Due KES ${balanceDue.toLocaleString()}` : `Paid KES ${amountPaid.toLocaleString()}`}, Ref: ${refCode}). Passed to Finance for confirmation.`;
            writeJsonFile(BOOKINGS_PATH, bookings);
          }
        } catch (e) {}

        try {
          if (order.booking_id) {
            await supabase
              .from('bookings')
              .update({ status: 'completed' })
              .eq('booking_id', order.booking_id);
          }
        } catch (e) {}
      }

      // 4. Dispatch Connection: Create dispatch only if order is already released by Finance
      if (order.fulfillment_mode === 'delivery' && order.finance_release_status === 'released') {
        await interModuleSync.createDispatchForOrder(order);
      }

      writeCashierOrders(orders);

      appendAuditLog(
        'Cashier Served Order — Passed to Finance',
        `Order ${order.order_no} (${order.customer_name}): Paid KES ${amountPaid.toLocaleString()} of KES ${totalAmount.toLocaleString()} (${cleanMethod} Ref: ${refCode})${hasUnpaid ? ` • Balance Due: KES ${balanceDue.toLocaleString()}` : ' • Settled in full'}. Passed to Finance for confirmation.`,
        `${cleanCashier} (Cashier)`,
        'Cashier & Sales'
      );

      moduleNotifications.notify({
        targetModules: ['finance', 'finance_releases'],
        sourceModule: 'cashier',
        senderName: cleanCashier,
        title: hasUnpaid
          ? `⚠️ Order ${order.order_no} Passed to Finance — Balance Due: KES ${balanceDue.toLocaleString()}`
          : `Order ${order.order_no} Passed to Finance for Confirmation`,
        message: `Cashier ${cleanCashier} served ${order.customer_name}: Paid KES ${amountPaid.toLocaleString()} of KES ${totalAmount.toLocaleString()} (${cleanMethod} Ref: ${refCode}).${hasUnpaid ? ` Unpaid Balance: KES ${balanceDue.toLocaleString()}.${order.balance_note ? ` Note: ${order.balance_note}` : ''}` : ' Settled in full.'}`,
        severity: hasUnpaid ? 'warning' : 'info',
        refNo: order.order_no,
        actionModule: 'finance_releases'
      });

      moduleNotifications.notify({
        targetModules: ['customer'],
        sourceModule: 'cashier',
        senderName: cleanCashier,
        title: `Payment Recorded for Order ${order.order_no}`,
        message: hasUnpaid
          ? `Cashier confirmed KES ${amountPaid.toLocaleString()}. Remaining balance due: KES ${balanceDue.toLocaleString()}. Sent to Finance confirmation.`
          : `Payment of KES ${amountPaid.toLocaleString()} settled in full (${order.receipt_no}). Sent to Finance confirmation.`,
        severity: hasUnpaid ? 'warning' : 'success',
        refNo: order.order_no,
        recipientPhone: order.customer_phone || '',
        recipientName: order.customer_name || ''
      });

      res.json({ success: true, order });
    } catch (err) {
      console.error('confirmOrderPayment error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  sendPaidOrderFulfillment: async (req, res) => {
    try {
      const targetNo = String(req.params.orderNo || '').trim();
      const { action, delivery_address, driver_notes, cashier_name } = req.body;
      const cleanCashier = String(cashier_name || 'Esther Karimi').trim();

      const orders = readCashierOrders();
      let order = orders.find(o => String(o.order_no || o.order_number || '').toUpperCase() === targetNo.toUpperCase());

      // Allow handoff for historical finance_records orders as well
      if (!order) {
        const { data: finRow } = await supabase
          .from('finance_records')
          .select('*')
          .eq('reference_no', targetNo)
          .maybeSingle();

        if (finRow) {
          order = {
            order_no: targetNo,
            receipt_no: `RCP-${finRow.record_id}`,
            source: finRow.category || 'Shop Sale',
            customer_name: req.body.customer_name || 'Shop Customer',
            customer_phone: req.body.customer_phone || '',
            customer_location: delivery_address || 'Meru Town, Meru County',
            items: [{ product_id: null, product_name: String(finRow.description || 'Paid Order').replace(/\s*\[Cashier:[^\]]+\]/i, ''), quantity: 1, unit_price: Number(finRow.amount || 0) }],
            subtotal: Number(finRow.amount || 0),
            delivery_fee: 0,
            total_amount: Number(finRow.amount || 0),
            amount_paid: Number(finRow.amount || 0),
            balance_due: 0,
            unpaid_balance: false,
            payment_status: 'paid',
            payment_method: finRow.payment_method || 'M-Pesa',
            payment_ref: finRow.reference_no || targetNo,
            fulfillment_type: 'product_collection',
            fulfillment_mode: 'collection',
            fulfillment_stage: 'collection',
            fulfillment_status: 'ready_for_collection',
            finance_release_status: 'released',
            finance_release_notes: 'Historical payment verified in Finance records.',
            cashier_name: cleanCashier,
            stock_deducted: true,
            created_at: finRow.created_at || new Date().toISOString(),
            paid_at: finRow.created_at || new Date().toISOString()
          };
          orders.unshift(order);
        }
      }

      if (!order) {
        return res.status(404).json({ success: false, message: `Order ${targetNo} not found.` });
      }

      // Enforce Finance Gate:
      // An order CANNOT proceed to delivery dispatch or customer collection until Finance releases it.
      // Rule 5: Product with unpaid balance: Finance checks credit/payment policy before release.
      if (order.finance_release_status !== 'released') {
        return res.status(403).json({
          success: false,
          message: order.unpaid_balance
            ? `Finance Credit Review Required: Order ${targetNo} has an unpaid balance of KES ${(order.balance_due || 0).toLocaleString()}. Finance must check credit/payment policy before release.`
            : `Finance Release Required: Order ${targetNo} must be verified and released by Finance before fulfillment handoff.`
        });
      }

      if (action === 'send_delivery') {
        const cleanAddr = String(delivery_address || order.customer_location || 'Meru Town, Meru County').trim();
        const notes = driver_notes
          ? `${driver_notes} • Paid (${order.payment_method} ${order.payment_ref})`
          : `PAID (${order.payment_method} Ref: ${order.payment_ref}) • Released by Cashier ${cleanCashier}`;

        // DISPATCH MANAGER CONNECTION: Create or update dispatch record in dispatches.json & Supabase
        await interModuleSync.createDispatchForOrder({
          order_no: order.order_no,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone || 'N/A',
          customer_location: cleanAddr,
          payment_method: order.payment_method,
          payment_ref: order.payment_ref,
          cashier_name: cleanCashier,
          fulfillment_type: order.fulfillment_type
        });

        order.customer_location = cleanAddr;
        order.fulfillment_mode = 'delivery';
        order.fulfillment_stage = 'delivery';
        order.fulfillment_status = 'sent_to_dispatch';

        appendAuditLog(
          'Paid Order Sent to Dispatch Manager',
          `Order ${order.order_no} (${order.customer_name}) sent to Dispatch for Meru delivery at ${cleanAddr}.`,
          `${cleanCashier} (Cashier)`,
          'Dispatch & Delivery'
        );

        moduleNotifications.notify({
          targetModules: ['dispatch'],
          sourceModule: 'cashier',
          senderName: cleanCashier,
          title: `Order ${order.order_no} Dispatched by Cashier`,
          message: `Cashier forwarded Order ${order.order_no} (${order.customer_name}) to Dispatch for delivery at ${cleanAddr}.`,
          severity: 'info',
          refNo: order.order_no,
          actionModule: 'dispatch'
        });

        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'dispatch',
          senderName: cleanCashier,
          title: `Order ${order.order_no} Sent to Delivery Dispatch`,
          message: `Your order ${order.order_no} is queued with Dispatch for delivery to ${cleanAddr}.`,
          severity: 'info',
          refNo: order.order_no,
          recipientPhone: order.customer_phone || '',
          recipientName: order.customer_name || ''
        });
      } else if (action === 'ready_collection') {
        order.fulfillment_mode = 'collection';
        order.fulfillment_stage = 'collection';
        order.fulfillment_status = 'ready_for_collection';

        appendAuditLog(
          'Paid Order Queued for Shop Collection',
          `Order ${order.order_no} (${order.customer_name}) marked Ready for Collection at Meru shop counter.`,
          `${cleanCashier} (Cashier)`,
          'Cashier & Sales'
        );

        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'cashier',
          senderName: cleanCashier,
          title: `Order ${order.order_no} Ready for Collection`,
          message: `Your order ${order.order_no} is ready for collection at Elight Electrical Shop counter.`,
          severity: 'success',
          refNo: order.order_no,
          recipientPhone: order.customer_phone || '',
          recipientName: order.customer_name || ''
        });
      } else if (action === 'mark_collected') {
        order.fulfillment_mode = 'collection';
        order.fulfillment_status = 'collected';
        order.delivery_status = 'delivered';
        order.site_ready_for_installation = true;

        const needsInstallation = Boolean(
          order.requires_installation ||
          order.fulfillment_type === 'product_delivery_install' ||
          order.fulfillment_type === 'product_install_later' ||
          (order.installation_status && !['not_requested', 'completed', 'cancelled'].includes(order.installation_status))
        );

        if (needsInstallation) {
          order.fulfillment_stage = 'installation';
          order.order_status = 'processing';
          order.status = 'processing';
          if (!order.installation_status || order.installation_status === 'not_requested') {
            order.installation_status = 'approved';
          }
          const sRequests = readServiceRequests();
          const existingReq = sRequests.find(r => r.booking_ref === `INS-${order.order_no}` || r.booking_ref === `SCH-${order.order_no}`);
          if (existingReq) {
            existingReq.site_ready = true;
            existingReq.site_ready_for_installation = true;
            writeServiceRequests(sRequests);
          }
        } else {
          order.installation_status = 'not_requested';
          order.fulfillment_stage = 'completed';
          order.order_status = 'completed';
          order.status = 'completed';
          await interModuleSync.createCustomerCareTaskForOrder(order, { driver_name: 'Shop Counter Collection' });
        }

        appendAuditLog(
          'Order Collected by Customer',
          `Customer ${order.customer_name} collected paid Order ${order.order_no} at shop counter.`,
          `${cleanCashier} (Cashier)`,
          'Cashier & Sales'
        );
      } else {
        return res.status(400).json({ success: false, message: 'Invalid fulfillment action.' });
      }

      writeCashierOrders(orders);
      res.json({ success: true, order });
    } catch (err) {
      console.error('sendPaidOrderFulfillment error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getOrderInvoice: async (req, res) => {
    try {
      const orderNo = String(req.params.orderNo || '').trim().replace(/^#/, '');
      const upperNo = orderNo.toUpperCase();
      if (!upperNo) {
        return res.status(400).json({ success: false, message: 'Order number is required.' });
      }

      const orders = readCashierOrders();
      let order = orders.find(o => {
        const candidates = [
          o.order_no,
          o.order_number,
          o.receipt_no,
          o.invoice_no,
          o.payment_ref,
          o.split_details?.mpesa_ref
        ];
        return candidates.some(v => String(v || '').trim().toUpperCase() === upperNo);
      });

      // Fallback 1: Lookup historical sale records from finance_records (Supabase or local store)
      if (!order) {
        let finRecords = [];
        try {
          const { data } = await supabase
            .from('finance_records')
            .select('*')
            .eq('type', 'sale')
            .order('record_id', { ascending: false })
            .limit(100);
          if (Array.isArray(data) && data.length > 0) finRecords = data;
        } catch (e) {}
        if (finRecords.length === 0) {
          finRecords = readFinanceRecords().filter(f => String(f.type || '').toLowerCase() === 'sale');
        }

        const matchedFin = finRecords.find(r => {
          const ref = String(r.reference_no || `SALE-${r.record_id}`).trim().toUpperCase();
          const saleIdRef = `SALE-${r.record_id}`.toUpperCase();
          return ref === upperNo || saleIdRef === upperNo;
        });

        if (matchedFin) {
          let linkedDisp = null;
          try {
            const { data: dRows } = await supabase
              .from('dispatches')
              .select('*')
              .ilike('order_no', orderNo)
              .limit(1);
            if (Array.isArray(dRows) && dRows.length > 0) linkedDisp = dRows[0];
          } catch (e) {}
          if (!linkedDisp) {
            linkedDisp = readDispatches().find(d => String(d.order_no || '').trim().toUpperCase() === upperNo) || null;
          }

          const cashierMatch = String(matchedFin.description || '').match(/\[Cashier:\s*([^\]]+)\]/i);
          const cleanDesc = String(matchedFin.description || 'Shop Sale').replace(/\s*\[Cashier:[^\]]+\]/i, '').trim();
          const amt = Number(matchedFin.amount || 0);
          const ref = String(matchedFin.reference_no || `SALE-${matchedFin.record_id}`);

          order = {
            order_no: ref,
            receipt_no: `RCP-${matchedFin.record_id}`,
            source: matchedFin.category || 'Shop Sale',
            customer_name: linkedDisp?.customer_name || 'Walk-In / Shop Customer',
            customer_phone: linkedDisp?.customer_phone || '-',
            customer_location: linkedDisp?.delivery_address || 'Meru Town Showroom',
            items: [{ product_id: null, product_name: cleanDesc || 'Electrical Purchase', quantity: 1, unit_price: amt }],
            subtotal: amt,
            delivery_fee: 0,
            installation_fee: 0,
            total_amount: amt,
            amount_paid: String(matchedFin.status || 'confirmed').toLowerCase() === 'pending' ? 0 : amt,
            balance_due: String(matchedFin.status || 'confirmed').toLowerCase() === 'pending' ? amt : 0,
            payment_status: String(matchedFin.status || 'confirmed').toLowerCase() === 'pending' ? 'pending' : 'paid',
            payment_method: matchedFin.payment_method || 'M-Pesa',
            payment_ref: ref,
            order_status: 'completed',
            fulfillment_mode: linkedDisp ? 'delivery' : 'collection',
            fulfillment_type: linkedDisp ? 'product_delivery' : 'product_collection',
            delivery_status: linkedDisp ? (linkedDisp.status || 'pending_dispatch') : 'collected',
            installation_status: 'not_requested',
            cashier_name: cashierMatch ? cashierMatch[1].trim() : 'Esther Karimi',
            created_at: matchedFin.created_at || new Date().toISOString()
          };
        }
      }

      // Fallback 2: Lookup customer bookings (Supabase or local store)
      if (!order) {
        let bookingsList = [];
        try {
          const { data } = await supabase
            .from('bookings')
            .select('*')
            .order('booking_id', { ascending: false })
            .limit(100);
          if (Array.isArray(data) && data.length > 0) bookingsList = data;
        } catch (e) {}
        if (bookingsList.length === 0) {
          bookingsList = readJsonFile(BOOKINGS_PATH, []);
        }

        const bk = (Array.isArray(bookingsList) ? bookingsList : []).find(b => {
          const bRef = String(b.booking_ref || `BK-${b.booking_id}`).trim().toUpperCase();
          return bRef === upperNo || `BK-${b.booking_id}`.toUpperCase() === upperNo;
        });

        if (bk) {
          const isPaid = String(bk.status || '').toLowerCase() === 'completed';
          const amt = Number(bk.estimated_amount || 0);
          const qty = Number(bk.quantity || 1);
          const ref = String(bk.booking_ref || `BK-${bk.booking_id}`);

          order = {
            order_no: ref,
            receipt_no: isPaid ? `RCP-${ref}` : '',
            source: bk.booking_type === 'product' ? 'Customer Product Booking' : 'Customer Service Booking',
            customer_name: bk.customer_name || 'Customer',
            customer_phone: bk.customer_phone || '-',
            customer_location: bk.location_or_notes || 'Meru County',
            items: [{
              product_id: bk.product_id || null,
              product_name: bk.item_or_service_name || 'Electrical Order',
              quantity: qty,
              unit_price: qty > 0 ? amt / qty : amt
            }],
            subtotal: amt,
            delivery_fee: 0,
            installation_fee: 0,
            total_amount: amt,
            amount_paid: isPaid ? amt : 0,
            balance_due: isPaid ? 0 : amt,
            payment_status: isPaid ? 'paid' : 'pending',
            payment_method: 'M-Pesa / Cash',
            payment_ref: isPaid ? ref : 'Pending Confirmation',
            order_status: isPaid ? 'completed' : 'processing',
            fulfillment_mode: bk.booking_type === 'product' ? 'collection' : 'service',
            fulfillment_type: bk.booking_type === 'product' ? 'product_collection' : 'installation_only',
            delivery_status: isPaid ? 'collected' : 'not_scheduled',
            installation_status: bk.booking_type === 'service' ? (isPaid ? 'completed' : 'pending') : 'not_requested',
            created_at: bk.created_at || bk.preferred_date || new Date().toISOString()
          };
        }
      }

      // Fallback 3: Lookup standalone dispatch records by order_no
      if (!order) {
        let dispRow = null;
        try {
          const { data } = await supabase
            .from('dispatches')
            .select('*')
            .ilike('order_no', orderNo)
            .limit(1);
          if (Array.isArray(data) && data.length > 0) dispRow = data[0];
        } catch (e) {}
        if (!dispRow) {
          dispRow = readDispatches().find(d => String(d.order_no || '').trim().toUpperCase() === upperNo) || null;
        }
        if (dispRow) {
          const amt = Number(dispRow.total_amount || 0);
          order = {
            order_no: dispRow.order_no,
            receipt_no: `RCP-${dispRow.order_no}`,
            customer_name: dispRow.customer_name || 'Customer',
            customer_phone: dispRow.customer_phone || '-',
            customer_location: dispRow.delivery_address || 'Meru County',
            items: Array.isArray(dispRow.items) && dispRow.items.length > 0
              ? dispRow.items
              : [{ product_id: null, product_name: dispRow.item_summary || 'Order Dispatch', quantity: 1, unit_price: amt }],
            subtotal: amt,
            delivery_fee: 0,
            installation_fee: 0,
            total_amount: amt,
            amount_paid: amt,
            balance_due: 0,
            payment_status: 'paid',
            payment_method: 'M-Pesa / Cash',
            payment_ref: dispRow.order_no,
            order_status: dispRow.status === 'delivered' ? 'completed' : 'processing',
            fulfillment_mode: 'delivery',
            fulfillment_type: 'product_delivery',
            delivery_status: dispRow.status || 'pending_dispatch',
            installation_status: 'not_requested',
            created_at: dispRow.created_at || new Date().toISOString()
          };
        }
      }

      if (!order) return res.status(404).json({ success: false, message: `Order #${orderNo} not found.` });

      const normalizedOrder = normalizeOrderDualStatuses(order);
      if (!normalizedOrder.invoice_no) {
        normalizedOrder.invoice_no = `INV-${String(normalizedOrder.order_no).replace(/^EL-/, '') || Date.now().toString().slice(-6)}`;
        if (orders.includes(order)) {
          order.invoice_no = normalizedOrder.invoice_no;
          writeCashierOrders(orders);
        }
      }

      const cleanItems = (normalizedOrder.items || []).map(it => {
        const qty = Number(it.quantity || 1);
        const unit = Number(it.unit_price ?? it.selling_price ?? 0);
        return {
          ...it,
          product_name: it.product_name || 'Electrical Item',
          quantity: qty,
          unit_price: unit,
          total: it.total !== undefined ? Number(it.total) : qty * unit
        };
      });

      const invoiceData = {
        invoice_no: normalizedOrder.invoice_no,
        order_no: normalizedOrder.order_no,
        receipt_no: normalizedOrder.receipt_no || '',
        customer_name: normalizedOrder.customer_name || 'Walk-in Customer',
        customer_phone: normalizedOrder.customer_phone || '-',
        customer_location: normalizedOrder.customer_location || 'Meru County',
        items: cleanItems,
        subtotal: normalizedOrder.subtotal || normalizedOrder.total_amount,
        delivery_fee: normalizedOrder.delivery_fee || 0,
        installation_fee: normalizedOrder.installation_fee || 0,
        total_amount: normalizedOrder.total_amount,
        amount_paid: normalizedOrder.amount_paid || 0,
        balance_due: normalizedOrder.balance_due || 0,
        payment_status: normalizedOrder.payment_status || 'unpaid',
        payment_method: normalizedOrder.payment_method || 'M-Pesa / Cash',
        payment_ref: normalizedOrder.payment_ref || (normalizedOrder.payment_status === 'paid' ? 'Verified' : 'Pending'),
        order_status: normalizedOrder.order_status || 'processing',
        delivery_status: normalizedOrder.delivery_status || 'not_scheduled',
        installation_status: normalizedOrder.installation_status || 'not_requested',
        fulfillment_mode: normalizedOrder.fulfillment_mode || (normalizedOrder.fulfillment_type === 'product_delivery' ? 'delivery' : 'collection'),
        fulfillment_type: normalizedOrder.fulfillment_type || 'product_delivery',
        created_at: normalizedOrder.created_at || new Date().toISOString()
      };

      res.json({ success: true, invoice: invoiceData, order: normalizedOrder });
    } catch (err) {
      console.error('getOrderInvoice error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  cancelCashierOrder: async (req, res) => {
    try {
      const orderNo = String(req.params.orderNo || '').trim();
      const reason = String(req.body.reason || 'Customer cancellation').trim();
      const actor = String(req.body.cashier_name || req.body.actor || 'Cashier').trim();

      const orders = readCashierOrders();
      const order = orders.find(o => String(o.order_no || o.order_number || '').toUpperCase() === orderNo.toUpperCase());
      if (!order) return res.status(404).json({ success: false, message: `Order #${orderNo} not found.` });

      order.order_status = 'cancelled';
      order.status = 'cancelled';
      order.payment_status = 'cancelled';
      order.delivery_status = 'cancelled';
      order.installation_status = 'cancelled';
      order.finance_release_status = 'cancelled';
      order.cancellation_reason = reason;
      writeCashierOrders(orders);

      // Cancel linked dispatch run if active
      const dispatches = readDispatches();
      const disp = dispatches.find(d => String(d.order_no).toUpperCase() === orderNo.toUpperCase());
      if (disp) {
        disp.status = 'cancelled';
        disp.driver_notes = `Order cancelled: ${reason}`;
        writeDispatches(dispatches);
      }

      // Cancel linked installation job if active
      const sRequests = readServiceRequests();
      const reqRow = sRequests.find(r => r.booking_ref === `INS-${orderNo}` || r.booking_ref === `SCH-${orderNo}`);
      if (reqRow) {
        reqRow.status = 'cancelled';
        writeServiceRequests(sRequests);
      }

      appendAuditLog(
        'Order Cancelled',
        `Order #${orderNo} (${order.customer_name}) was cancelled. Reason: ${reason}.`,
        actor,
        'Cashier & Sales'
      );

      res.json({ success: true, order, message: `Order #${orderNo} successfully cancelled.` });
    } catch (err) {
      console.error('cancelCashierOrder error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  updateDispatchPacking: async (req, res) => {
    try {
      const dispatchId = Number(req.params.id);
      const { packing_status, actor } = req.body;
      const cleanStatus = packing_status || 'ready';

      const dispatches = readDispatches();
      const disp = dispatches.find(d => Number(d.dispatch_id) === dispatchId);
      if (!disp) return res.status(404).json({ success: false, message: 'Dispatch record not found.' });

      disp.packing_status = cleanStatus;
      writeDispatches(dispatches);

      if (disp.order_no) {
        const orders = readCashierOrders();
        const order = orders.find(o => String(o.order_no || o.order_number || '').toUpperCase() === String(disp.order_no).toUpperCase());
        if (order) {
          order.packing_status = cleanStatus;
          writeCashierOrders(orders);
        }
      }

      appendAuditLog(
        'Packing Readiness Updated',
        `Dispatch #DSP-${dispatchId} (${disp.order_no}) marked ${cleanStatus.toUpperCase()} by ${actor || 'Dispatch Manager'}.`,
        actor || 'Dispatch Manager',
        'Dispatch & Delivery'
      );

      moduleNotifications.notify({
        targetModules: ['driver'],
        sourceModule: 'dispatch',
        senderName: actor || 'Dispatch Manager',
        title: `Dispatch #DSP-${dispatchId} (${disp.order_no}) Packing: ${cleanStatus.toUpperCase()}`,
        message: `Order ${disp.order_no} (${disp.customer_name}) at ${disp.delivery_address} marked packing ${cleanStatus}.`,
        severity: cleanStatus === 'ready' || cleanStatus === 'packed' ? 'success' : 'info',
        refNo: `#DSP-${dispatchId}`,
        actionModule: 'driver'
      });

      if (cleanStatus === 'ready' || cleanStatus === 'packed') {
        moduleNotifications.notify({
          targetModules: ['customer'],
          sourceModule: 'dispatch',
          senderName: actor || 'Dispatch Manager',
          title: `Order ${disp.order_no} Packed & Ready for Delivery`,
          message: `Your order ${disp.order_no} has been packed and is preparing for delivery.`,
          severity: 'info',
          refNo: disp.order_no,
          recipientPhone: disp.customer_phone || '',
          recipientName: disp.customer_name || ''
        });
      }

      res.json({ success: true, dispatch: disp, message: `Packing readiness updated to ${cleanStatus}.` });
    } catch (err) {
      console.error('updateDispatchPacking error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  rescheduleDispatchRun: async (req, res) => {
    try {
      const dispatchId = Number(req.params.id);
      const newDate = req.body.rescheduled_date || req.body.new_date;
      const { reason, actor } = req.body;
      if (!newDate) {
        return res.status(400).json({ success: false, message: 'Please specify a rescheduled delivery date.' });
      }

      const updated = await interModuleSync.rescheduleDispatch(dispatchId, newDate, reason, actor);
      if (!updated) return res.status(404).json({ success: false, message: 'Dispatch record not found.' });

      res.json({ success: true, dispatch: updated, message: `Delivery rescheduled to ${newDate}.` });
    } catch (err) {
      console.error('rescheduleDispatchRun error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  approveServiceCompletion: async (req, res) => {
    try {
      const callerRole = String(req.body.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      const allowed = ['service_manager', 'service', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowed.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Service Manager can approve completion or return jobs for rework.'
        });
      }

      const requestId = Number(req.params.id);
      const { action, actor, approved_by, approval_notes, inspection_notes, return_reason, service_fee } = req.body;

      const updated = await interModuleSync.reviewServiceCompletion(requestId, {
        action: action || 'approve',
        approval_notes: approval_notes || inspection_notes,
        return_reason,
        service_fee,
        actor: actor || approved_by || 'Service Manager'
      });
      if (!updated) return res.status(404).json({ success: false, message: 'Service request not found.' });

      const msg = updated.status === 'returned_for_rework'
        ? `Service job #SR-${requestId} returned to technician for further work.`
        : `Service job #SR-${requestId} approved and customer charged KES ${Number(updated.service_fee || 0).toLocaleString()}.`;

      res.json({ success: true, request: updated, message: msg });
    } catch (err) {
      console.error('approveServiceCompletion error:', err);
      res.status(400).json({ success: false, message: err.message });
    }
  },

  getCustomerCareTasks: async (req, res) => {
    try {
      const tasks = await interModuleSync.getCustomerCareTasks();
      res.json({ success: true, count: tasks.length, tasks });
    } catch (err) {
      console.error('getCustomerCareTasks error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  completeCustomerCareTask: async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const updated = await interModuleSync.completeCustomerCareTask(taskId, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Customer Care follow-up task not found.' });

      res.json({ success: true, task: updated, message: `Customer care review logged for Order #${updated.order_no}.` });
    } catch (err) {
      console.error('completeCustomerCareTask error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ==========================================
  // MODULE NOTIFICATIONS CENTER (Role-Scoped)
  // ==========================================
  getModuleNotifications: async (req, res) => {
    try {
      const moduleName = String(req.query.module || 'all').trim().toLowerCase();

      if (moduleName === 'customer') {
        const customerPhone = String(req.query.customer_phone || '').trim();
        const customerEmail = String(req.query.customer_email || '').trim();
        const customerName = String(req.query.customer_name || '').trim();
        if (!customerPhone && !customerEmail && !customerName) {
          return res.json({ success: true, notifications: [], unread_count: 0, counts_by_module: {} });
        }
        const result = moduleNotifications.getNotifications({
          module: 'customer',
          customerPhone,
          customerEmail,
          customerName,
          limit: Number(req.query.limit || 50)
        });
        return res.json({ success: true, ...result });
      }

      const rawRole = String(req.headers?.['x-user-role'] || req.query?.user_role || '').trim().toLowerCase();
      const normRole = (() => {
        if (rawRole === 'administrator' || rawRole === 'superadmin' || rawRole === 'admin' || rawRole === 'owner') return rawRole === 'owner' ? 'owner' : 'admin';
        if (rawRole === 'service' || rawRole === 'service_manager') return 'service_manager';
        if (rawRole === 'inventory' || rawRole === 'inventory_manager' || rawRole === 'storekeeper') return 'inventory_manager';
        if (rawRole === 'finance' || rawRole === 'finance_manager' || rawRole === 'accountant') return 'finance_manager';
        if (rawRole === 'dispatch' || rawRole === 'dispatch_manager') return 'dispatch_manager';
        if (rawRole === 'tech' || rawRole === 'technician' || rawRole === 'service_tech') return 'technician';
        if (rawRole === 'cashier' || rawRole === 'cashier_manager') return 'cashier';
        if (rawRole === 'driver' || rawRole === 'rider' || rawRole === 'delivery') return 'driver';
        if (rawRole === 'customer_care' || rawRole === 'support' || rawRole === 'care' || rawRole === 'cs') return 'customer_care';
        return rawRole;
      })();
      const isAdmin = normRole === 'admin' || normRole === 'owner';

      if (!isAdmin) {
        if (!normRole || normRole === 'customer') {
          return res.status(403).json({
            success: false,
            message: 'Access Denied: Staff role required to view ERP module notifications.'
          });
        }
        const cfg = readSystemConfig();
        const defaultRoleMap = {
          cashier: ['cashier', 'new_sale', 'feedback', 'help'],
          service_manager: ['services', 'bookings', 'feedback', 'help'],
          technician: ['technicians', 'feedback', 'help'],
          finance_manager: ['finance', 'finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments', 'reports', 'feedback', 'help'],
          dispatch_manager: ['dispatch', 'bookings', 'feedback', 'help'],
          driver: ['driver', 'feedback', 'help'],
          inventory_manager: ['inventory', 'inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices', 'feedback', 'help'],
          customer_care: ['customers', 'customer_care', 'feedback', 'help']
        };
        const cfgPerms = (cfg.role_permissions && Array.isArray(cfg.role_permissions[normRole]) && cfg.role_permissions[normRole].length > 0)
          ? [...cfg.role_permissions[normRole]]
          : [...(defaultRoleMap[normRole] || [])];

        if (cfgPerms.includes('cashier') && !cfgPerms.includes('new_sale')) cfgPerms.push('new_sale');
        if (cfgPerms.includes('finance')) {
          ['finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments'].forEach(sub => {
            if (!cfgPerms.includes(sub)) cfgPerms.push(sub);
          });
        }
        if (cfgPerms.includes('inventory')) {
          ['inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices'].forEach(sub => {
            if (!cfgPerms.includes(sub)) cfgPerms.push(sub);
          });
        }

        const allowedModules = Array.from(new Set(cfgPerms.map(m => String(m).trim().toLowerCase())));
        if (moduleName !== 'all' && !allowedModules.includes(moduleName)) {
          return res.status(403).json({
            success: false,
            message: `Access Denied: Your role cannot access notifications for module "${moduleName}".`
          });
        }

        const deptMap = {
          cashier: 'cashier',
          finance_manager: 'finance',
          inventory_manager: 'inventory',
          service_manager: 'services',
          technician: 'services',
          dispatch_manager: 'dispatch',
          driver: 'driver',
          customer_care: 'customer_care'
        };

        const result = moduleNotifications.getNotifications({
          module: moduleName,
          allowedModules,
          isAdmin: false,
          userDepartment: deptMap[normRole] || normRole,
          limit: Number(req.query.limit || 60)
        });
        return res.json({ success: true, is_admin_scope: false, ...result });
      }

      const rawAllowed = String(req.query.allowed_modules || '').trim();
      const allowedModules = rawAllowed
        ? rawAllowed.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : null;

      const result = moduleNotifications.getNotifications({
        module: moduleName,
        allowedModules,
        isAdmin: true,
        limit: Number(req.query.limit || 60)
      });
      res.json({ success: true, is_admin_scope: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  markModuleNotificationRead: async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const rawRole = String(req.headers?.['x-user-role'] || req.body?.user_role || '').trim().toLowerCase();
      const isAdmin = ['admin', 'administrator', 'owner', 'superadmin'].includes(rawRole);
      const isCust = String(req.body?.module || '').toLowerCase() === 'customer';

      let nonAdminOpts = {};
      if (!isCust && rawRole && !isAdmin) {
        const cfg = readSystemConfig();
        const roleKey = rawRole === 'service' ? 'service_manager'
          : (rawRole === 'inventory' || rawRole === 'storekeeper' ? 'inventory_manager'
            : (rawRole === 'finance' || rawRole === 'accountant' ? 'finance_manager'
              : (rawRole === 'tech' || rawRole === 'service_tech' ? 'technician'
                : (rawRole === 'rider' || rawRole === 'delivery' ? 'driver' : rawRole))));
        const defaultMap = {
          cashier: ['cashier', 'new_sale', 'feedback', 'help'],
          service_manager: ['services', 'bookings', 'feedback', 'help'],
          technician: ['technicians', 'feedback', 'help'],
          finance_manager: ['finance', 'finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments', 'reports', 'feedback', 'help'],
          dispatch_manager: ['dispatch', 'bookings', 'feedback', 'help'],
          driver: ['driver', 'feedback', 'help'],
          inventory_manager: ['inventory', 'inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices', 'feedback', 'help'],
          customer_care: ['customers', 'customer_care', 'feedback', 'help']
        };
        const perms = (cfg.role_permissions && Array.isArray(cfg.role_permissions[roleKey]))
          ? [...cfg.role_permissions[roleKey]]
          : [...(defaultMap[roleKey] || [])];
        if (perms.includes('finance')) perms.push('finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments');
        if (perms.includes('inventory')) perms.push('inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices');
        if (perms.includes('cashier')) perms.push('new_sale');
        nonAdminOpts = {
          isAdmin: false,
          allowedModules: Array.from(new Set(perms)),
          userDepartment: roleKey === 'finance_manager' ? 'finance' : (roleKey === 'inventory_manager' ? 'inventory' : (roleKey === 'service_manager' || roleKey === 'technician' ? 'services' : (roleKey === 'dispatch_manager' ? 'dispatch' : roleKey)))
        };
      }

      const updated = moduleNotifications.markNotificationRead(id, {
        module: req.body?.module || req.query?.module || '',
        customerPhone: req.body?.customer_phone || '',
        customerEmail: req.body?.customer_email || '',
        customerName: req.body?.customer_name || '',
        ...nonAdminOpts
      });
      if (updated === false) {
        return res.status(403).json({ success: false, message: 'Access Denied: Notification does not belong to your module.' });
      }
      if (!updated) return res.status(404).json({ success: false, message: 'Notification not found.' });
      res.json({ success: true, notification: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  markAllModuleNotificationsRead: async (req, res) => {
    try {
      const moduleName = String(req.body?.module || 'all').trim().toLowerCase();
      if (moduleName === 'customer') {
        const count = moduleNotifications.markAllRead({
          module: 'customer',
          customerPhone: req.body?.customer_phone || '',
          customerEmail: req.body?.customer_email || '',
          customerName: req.body?.customer_name || ''
        });
        return res.json({ success: true, marked_count: count });
      }

      const rawRole = String(req.headers?.['x-user-role'] || req.body?.user_role || '').trim().toLowerCase();
      const isAdmin = ['admin', 'administrator', 'owner', 'superadmin'].includes(rawRole);
      let allowedModules = null;
      let userDept = '';

      if (!isAdmin) {
        if (!rawRole || rawRole === 'customer') {
          return res.status(403).json({ success: false, message: 'Access Denied.' });
        }
        const cfg = readSystemConfig();
        const roleKey = rawRole === 'service' ? 'service_manager'
          : (rawRole === 'inventory' || rawRole === 'storekeeper' ? 'inventory_manager'
            : (rawRole === 'finance' || rawRole === 'accountant' ? 'finance_manager'
              : (rawRole === 'tech' || rawRole === 'service_tech' ? 'technician'
                : (rawRole === 'rider' || rawRole === 'delivery' ? 'driver' : rawRole))));
        const defaultMap = {
          cashier: ['cashier', 'new_sale', 'feedback', 'help'],
          service_manager: ['services', 'bookings', 'feedback', 'help'],
          technician: ['technicians', 'feedback', 'help'],
          finance_manager: ['finance', 'finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments', 'reports', 'feedback', 'help'],
          dispatch_manager: ['dispatch', 'bookings', 'feedback', 'help'],
          driver: ['driver', 'feedback', 'help'],
          inventory_manager: ['inventory', 'inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices', 'feedback', 'help'],
          customer_care: ['customers', 'customer_care', 'feedback', 'help']
        };
        const perms = (cfg.role_permissions && Array.isArray(cfg.role_permissions[roleKey]))
          ? [...cfg.role_permissions[roleKey]]
          : [...(defaultMap[roleKey] || [])];
        if (perms.includes('finance')) perms.push('finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments');
        if (perms.includes('inventory')) perms.push('inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices');
        if (perms.includes('cashier')) perms.push('new_sale');
        allowedModules = Array.from(new Set(perms));
        userDept = roleKey === 'finance_manager' ? 'finance' : (roleKey === 'inventory_manager' ? 'inventory' : (roleKey === 'service_manager' || roleKey === 'technician' ? 'services' : (roleKey === 'dispatch_manager' ? 'dispatch' : roleKey)));
      } else {
        const rawAllowed = req.body?.allowed_modules;
        allowedModules = Array.isArray(rawAllowed)
          ? rawAllowed
          : (typeof rawAllowed === 'string' && rawAllowed.trim() ? rawAllowed.split(',').map(s => s.trim()) : null);
      }

      const count = moduleNotifications.markAllRead({
        module: moduleName,
        allowedModules,
        isAdmin,
        userDepartment: userDept
      });
      res.json({ success: true, marked_count: count });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = erpController;

