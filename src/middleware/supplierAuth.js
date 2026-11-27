const supabase = require('../config/supabase');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Authenticates a supplier request using Supabase Auth JWT, verifies `role === 'supplier'`,
 * resolves `supplier_id` strictly from the authenticated `auth.uid()` via RLS-scoped PostgREST,
 * and rejects inactive accounts or cross-supplier spoofing attempts.
 */
async function authenticateSupplier(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Supplier authentication required. Missing Bearer access token.'
      });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired supplier session. Please sign in again.'
      });
    }

    const authUser = data.user;
    const appRole = normalizeRole(authUser.app_metadata && authUser.app_metadata.role);
    if (appRole !== 'supplier') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: this portal is restricted to verified supplier accounts.'
      });
    }

    // Create an RLS-enforced Supabase client bound to the supplier's verified JWT
    const supplierDb = supabase.createUserClient(token);
    const { data: supplier, error: supErr } = await supplierDb
      .from('suppliers')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({
        success: false,
        message: `Failed verifying supplier ownership: ${supErr.message}`
      });
    }

    if (!supplier) {
      return res.status(403).json({
        success: false,
        message: 'Supplier profile is not linked or not accessible for this account.'
      });
    }

    if (String(supplier.status || '').toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your supplier account is currently deactivated. Please contact the shop Administrator.'
      });
    }

    // Never allow a supplier to specify another supplier's ID in query/body
    const bodySupplierId = req.body && req.body.supplier_id !== undefined ? Number(req.body.supplier_id) : null;
    const querySupplierId = req.query && req.query.supplier_id !== undefined ? Number(req.query.supplier_id) : null;
    if (
      (bodySupplierId !== null && !Number.isNaN(bodySupplierId) && bodySupplierId !== Number(supplier.supplier_id)) ||
      (querySupplierId !== null && !Number.isNaN(querySupplierId) && querySupplierId !== Number(supplier.supplier_id))
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cross-supplier access or supplier ID spoofing is strictly prohibited.'
      });
    }

    req.supplierToken = token;
    req.authUser = authUser;
    req.supplier = supplier;
    req.supplierId = Number(supplier.supplier_id);
    req.supplierDb = supplierDb;
    return next();
  } catch (err) {
    console.error('authenticateSupplier error:', err);
    return res.status(500).json({ success: false, message: 'Supplier authentication verification failed.' });
  }
}

/**
 * Prevents authenticated suppliers (via Supabase JWT or role header/body) from calling
 * internal staff, inventory mutation, finance, or admin endpoints.
 */
async function blockSuppliersFromStaff(req, res, next) {
  try {
    const headerRole = normalizeRole(req.headers['x-user-role'] || (req.body && req.body.user_role));
    if (headerRole === 'supplier') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Supplier accounts cannot access internal staff endpoints.'
      });
    }

    const token = extractBearerToken(req);
    if (token) {
      if (token.startsWith('demo-supplier-token-')) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Supplier demo tokens cannot access internal staff endpoints.'
        });
      }
      const { data } = await supabase.auth.getUser(token);
      const tokenRole = normalizeRole(data?.user?.app_metadata?.role);
      if (tokenRole === 'supplier') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Supplier credentials cannot access internal staff endpoints.'
        });
      }
    }

    return next();
  } catch (err) {
    return next();
  }
}

/**
 * Guards internal ERP supplier management / procurement / finance endpoints by allowed staff roles.
 */
function requireErpRoles(allowedRoles) {
  const allowed = new Set(allowedRoles.map(normalizeRole));
  return [
    blockSuppliersFromStaff,
    async (req, res, next) => {
      const role = normalizeRole(req.headers['x-user-role'] || (req.body && req.body.user_role) || (req.query && req.query.user_role));
      if (!role || role === 'customer' || role === 'supplier' || !allowed.has(role)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Insufficient ERP role permissions for this operation.'
        });
      }
      req.erpActor = {
        role,
        name: String(req.headers['x-user-name'] || (req.body && req.body.actor_name) || role).trim(),
        email: String(req.headers['x-user-email'] || '').trim().toLowerCase()
      };
      return next();
    }
  ];
}

module.exports = {
  extractBearerToken,
  normalizeRole,
  authenticateSupplier,
  blockSuppliersFromStaff,
  requireErpRoles
};

