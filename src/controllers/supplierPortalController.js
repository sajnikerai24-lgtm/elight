const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');
const { buildOfficialReceiptPdf } = require('../utils/pdfReceiptGenerator');
const { readJsonFile, writeJsonFile } = require('../utils/jsonStore');
const { validatePaymentReference, validateBankAccountNumber } = require('../utils/paymentValidation');
const { sortByLatest } = require('../utils/sortLatest');
const moduleNotifications = require('../utils/moduleNotifications');

const BUCKET_NAME = 'supplier-documents';
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_QUOTATION_UNIT_PRICE = 1500; // Fallback cap only for legacy PO items without an explicit max_unit_price
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'doc', 'docx']);
const FINANCE_RECORDS_PATH = path.join(__dirname, '../config/finance_records.json');

function formatKshNumber(val) {
  return Number(val || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function resolvePurchaseItemBounds(poItem) {
  const rawMax = poItem && poItem.max_unit_price !== null && poItem.max_unit_price !== undefined
    ? Number(poItem.max_unit_price)
    : null;
  const hasExplicitMax = rawMax !== null && !Number.isNaN(rawMax) && rawMax > 0;
  return {
    min_unit_price: null,
    max_unit_price: hasExplicitMax ? Number(rawMax.toFixed(2)) : MAX_QUOTATION_UNIT_PRICE,
    has_explicit_limits: hasExplicitMax
  };
}

function evaluateQuotationPrice(productName, unitPrice, maxLimit) {
  const price = Number(unitPrice);
  const maxVal = Number(maxLimit);
  if (Number.isNaN(price) || price <= 0) {
    return {
      valid: false,
      status: 'invalid',
      message: `Unit price for "${productName}" must be greater than KSh 0.`
    };
  }
  if (!Number.isNaN(maxVal) && maxVal > 0 && price > maxVal + 0.0001) {
    return {
      valid: false,
      status: 'above_max',
      message: `Unit price for "${productName}" (KSh ${formatKshNumber(price)}) exceeds the maximum permitted price of KSh ${formatKshNumber(maxVal)}.`
    };
  }
  return {
    valid: true,
    status: 'within_range',
    message: price === maxVal ? 'Accepted (at maximum limit)' : 'Accepted (below maximum limit)'
  };
}

function findMatchingPurchaseItem(poItems, candidate) {
  if (!Array.isArray(poItems) || poItems.length === 0) return null;
  const cid = candidate?.product_id ? Number(candidate.product_id) : null;
  const cname = String(candidate?.product_name || '').trim().toLowerCase();
  return poItems.find(pi =>
    (cid && pi.product_id && Number(pi.product_id) === cid) ||
    (cname && String(pi.product_name || '').trim().toLowerCase() === cname)
  ) || null;
}

function genRef(prefix) {
  const year = new Date().getFullYear();
  const tail = String(Date.now()).slice(-5) + String(Math.floor(10 + Math.random() * 90));
  return `${prefix}-${year}-${tail}`;
}

function parseDocumentPayload(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const rawName = String(doc.fileName || doc.name || 'document.pdf').trim();
  const dataUrl = String(doc.dataUrl || doc.base64 || '').trim();
  if (!dataUrl) return null;

  let mimeType = String(doc.mimeType || 'application/octet-stream').trim();
  let base64Body = dataUrl;
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (match) {
    mimeType = match[1];
    base64Body = match[2];
  }

  const buffer = Buffer.from(base64Body, 'base64');
  if (!buffer.length || buffer.length > MAX_DOC_BYTES) {
    throw new Error('Document must be non-empty and under 5 MB.');
  }

  const extMatch = /\.([a-z0-9]+)$/i.exec(rawName);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file extension ".${ext}". Allowed: PDF, PNG, JPG, WEBP, DOC, DOCX, TXT, CSV.`);
  }

  const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return { buffer, mimeType, safeName: safeBase };
}

async function uploadSupplierDocument(supplierId, folder, docPayload) {
  const parsed = parseDocumentPayload(docPayload);
  if (!parsed) return { document_name: null, document_path: null };

  const storagePath = `${Number(supplierId)}/${folder}/${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${parsed.safeName}`;
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: false
    });

  if (error) {
    throw new Error(`Document upload failed: ${error.message}`);
  }

  return {
    document_name: parsed.safeName,
    document_path: storagePath
  };
}

async function createSupplierNotification(supplierId, payload) {
  moduleNotifications.notify({
    targetModules: ['supplier'],
    supplierId: Number(supplierId),
    sourceModule: 'erp',
    senderName: payload.sender_name || 'Elight Procurement & Finance',
    title: String(payload.title || 'Supplier Portal Update').slice(0, 180),
    message: String(payload.message || '').slice(0, 1000),
    severity: /reject|hold|warn/i.test(String(payload.notification_type || '')) ? 'warning' : 'info',
    refNo: payload.related_id ? String(payload.related_id) : ''
  });
  try {
    await supabase.from('supplier_notifications').insert([{
      supplier_id: Number(supplierId),
      title: String(payload.title || 'Supplier Portal Update').slice(0, 180),
      message: String(payload.message || '').slice(0, 1000),
      notification_type: String(payload.notification_type || 'info'),
      related_type: payload.related_type || null,
      related_id: payload.related_id ? Number(payload.related_id) : null,
      is_read: false
    }]);
  } catch (err) {
    console.warn('Notification insert warning:', err.message);
  }
}

function appendFinanceRecordLocal(entry) {
  try {
    let records = readJsonFile(FINANCE_RECORDS_PATH, []);
    if (!Array.isArray(records)) records = [];
    records.unshift(entry);
    writeJsonFile(FINANCE_RECORDS_PATH, records);
  } catch (err) {
    console.warn('finance_records.json sync warning:', err.message);
  }
}

async function streamStoredDocument(res, storagePath, fallbackName) {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storagePath);
  if (error || !data) {
    return res.status(404).json({ success: false, message: 'Stored document file not found.' });
  }
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileName = String(fallbackName || path.basename(storagePath)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const contentType = data.type || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  return res.send(buffer);
}

// =========================================================================
// 1. SUPPLIER AUTHENTICATION ENDPOINTS
// =========================================================================

function generateSupplierUsername(rawName, supplierId) {
  const slug = String(rawName || '')
    .toLowerCase()
    .replace(/\b(ltd|limited|kenya|east africa|dist|enterprise|ent)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  return slug || `supplier${supplierId || Date.now().toString().slice(-4)}`;
}

exports.supplierLogin = async (req, res) => {
  try {
    const rawIdentifier = String(req.body.username || req.body.identifier || req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!rawIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Supplier username or email and password are required.' });
    }

    const cleanId = rawIdentifier.toLowerCase();

    // Resolve supplier record by username, email, supplier_code, or phone
    const { data: allSuppliers } = await supabase
      .from('suppliers')
      .select('supplier_id, username, email, supplier_code, phone, password, status, auth_user_id');

    const matchedSup = (allSuppliers || []).find(s =>
      String(s.username || '').trim().toLowerCase() === cleanId ||
      String(s.email || '').trim().toLowerCase() === cleanId ||
      String(s.supplier_code || '').trim().toLowerCase() === cleanId ||
      String(s.phone || '').trim().toLowerCase() === cleanId
    );

    const authEmail = String(matchedSup?.email || (cleanId.includes('@') ? cleanId : '')).trim().toLowerCase();
    if (!authEmail) {
      return res.status(401).json({
        success: false,
        message: 'Invalid supplier username or password.'
      });
    }

    // Authenticate via Supabase Auth using resolved supplier email
    const { data, error } = await supabase.createAuthClient().auth.signInWithPassword({
      email: authEmail,
      password
    });

    if (error || !data?.session || !data?.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid supplier username/email or password.'
      });
    }

    const role = String(data.user.app_metadata?.role || '').toLowerCase();
    if (role && role !== 'supplier') {
      return res.status(403).json({
        success: false,
        message: 'This login is exclusively for registered Suppliers. Staff must use Staff ERP Login.'
      });
    }

    const token = data.session.access_token;
    const supplierDb = supabase.createUserClient(token);
    const { data: supplier, error: supErr } = await supplierDb
      .from('suppliers')
      .select('*')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();

    if (supErr || !supplier) {
      return res.status(403).json({
        success: false,
        message: 'Supplier account is inactive or unlinked. Contact the shop Administrator.'
      });
    }

    if (String(supplier.status || '').toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your supplier account has been deactivated. Contact the shop Administrator.'
      });
    }

    await supabase
      .from('suppliers')
      .update({ last_login_at: new Date().toISOString() })
      .eq('supplier_id', supplier.supplier_id);

    const safeSupplier = { ...supplier };
    delete safeSupplier.password;

    return res.json({
      success: true,
      message: `Welcome back, ${safeSupplier.contact_person || safeSupplier.supplier_name}`,
      session: {
        access_token: token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      },
      supplier: safeSupplier
    });
  } catch (err) {
    console.error('supplierLogin error:', err);
    return res.status(500).json({ success: false, message: 'Server error during supplier sign in.' });
  }
};

exports.supplierRefreshSession = async (req, res) => {
  try {
    const refreshToken = String(req.body.refresh_token || '').trim();
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refresh_token is required.' });
    }
    const { data, error } = await supabase.createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session || !data?.user) {
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
    }
    if (String(data.user.app_metadata?.role || '').toLowerCase() !== 'supplier') {
      return res.status(403).json({ success: false, message: 'Forbidden account type.' });
    }
    const supplierDb = supabase.createUserClient(data.session.access_token);
    const { data: supplier } = await supplierDb
      .from('suppliers')
      .select('*')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    if (!supplier || String(supplier.status || '').toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, message: 'Supplier account is deactivated.' });
    }
    return res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      },
      supplier
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed refreshing supplier session.' });
  }
};

exports.supplierForgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please enter your supplier account email.' });
    }

    const { data: supplier } = await supabase
      .from('suppliers')
      .select('supplier_id, supplier_name, email, auth_user_id, status')
      .ilike('email', email)
      .maybeSingle();

    if (supplier && supplier.auth_user_id && String(supplier.status).toLowerCase() === 'active') {
      try {
        await supabase.auth.admin.generateLink({
          type: 'recovery',
          email
        });
        await createSupplierNotification(supplier.supplier_id, {
          title: 'Password Reset Requested',
          message: 'A password recovery request was initiated for your account. If you need direct assistance, contact the shop Administrator.',
          notification_type: 'security'
        });
      } catch (e) { }
    }

    return res.json({
      success: true,
      message: 'If an active supplier account is registered with that email, a secure Supabase recovery process has been triggered. You may also request an Admin password reset.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not process password recovery request.' });
  }
};

exports.supplierChangePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.current_password || '');
    const newPassword = String(req.body.new_password || '');
    if (!currentPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Current password and a new password (at least 8 characters) are required.'
      });
    }

    const { error: verifyErr } = await supabase.createAuthClient().auth.signInWithPassword({
      email: req.authUser.email,
      password: currentPassword
    });
    if (verifyErr) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(req.authUser.id, {
      password: newPassword
    });
    if (updateErr) {
      return res.status(400).json({ success: false, message: updateErr.message });
    }

    await supabase
      .from('suppliers')
      .update({ password: newPassword, updated_at: new Date().toISOString() })
      .eq('supplier_id', req.supplierId);

    await createSupplierNotification(req.supplierId, {
      title: 'Account Password Updated',
      message: 'Your Supplier Portal login password was changed successfully.',
      notification_type: 'security'
    });

    return res.json({ success: true, message: 'Password updated securely via Supabase Auth.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed updating password.' });
  }
};

exports.getSupplierMe = async (req, res) => {
  return res.json({ success: true, supplier: req.supplier });
};

// =========================================================================
// 2. SUPPLIER PORTAL ENDPOINTS (STRICTLY ISOLATED BY JWT + POSTGRES RLS)
// =========================================================================

exports.getSupplierDashboard = async (req, res) => {
  try {
    const db = req.supplierDb;
    const [posRes, quotesRes, delRes, invRes, payRes, notifRes, prodRes] = await Promise.all([
      db.from('purchase_orders').select('*').order('po_id', { ascending: false }),
      db.from('quotations').select('*').order('quotation_id', { ascending: false }),
      db.from('supplier_deliveries').select('*').order('delivery_id', { ascending: false }),
      db.from('supplier_invoices').select('*').order('invoice_id', { ascending: false }),
      db.from('payments').select('*').order('payment_id', { ascending: false }),
      db.from('supplier_notifications').select('*').order('created_at', { ascending: false }).limit(25),
      db.from('inventory').select('product_id, product_name, sku, category').order('product_name', { ascending: true })
    ]);

    const firstErr = posRes.error || quotesRes.error || delRes.error || invRes.error || payRes.error || notifRes.error;
    if (firstErr) {
      return res.status(500).json({ success: false, message: firstErr.message });
    }

    const pos = posRes.data || [];
    const quotes = quotesRes.data || [];
    const deliveries = delRes.data || [];
    const invoices = invRes.data || [];
    const payments = payRes.data || [];
    const notifications = notifRes.data || [];

    const totalPOsReceived = pos.length;
    const pendingQuotations = quotes.filter(q => ['submitted', 'pending'].includes(String(q.status).toLowerCase())).length;
    const approvedStatuses = new Set(['approved', 'approved_awaiting_delivery', 'partially_delivered', 'delivered', 'received']);
    const dispatchableStatuses = new Set(['approved', 'approved_awaiting_delivery', 'partially_delivered']);
    const approvedPOs = pos.filter(p => approvedStatuses.has(String(p.status || '').toLowerCase())).length;
    const pendingDeliveries = pos.filter(p => {
      const st = String(p.status || '').toLowerCase();
      const ds = String(p.delivery_status || '').toLowerCase();
      return dispatchableStatuses.has(st) && ds !== 'received' && ds !== 'confirmed';
    }).length;
    const completedDeliveries = Math.max(
      deliveries.filter(d => d.inventory_confirmed === true).length,
      pos.filter(p => String(p.delivery_status || '').toLowerCase() === 'received').length
    );
    const pendingPayments = invoices
      .filter(i => String(i.status || '').toLowerCase() !== 'rejected')
      .reduce((sum, i) => sum + Number(i.balance_due ?? Math.max(0, Number(i.total_amount || 0) - Number(i.amount_paid || 0))), 0);
    const totalPaymentsReceived = payments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
    const unreadNotifications = notifications.filter(n => !n.is_read).length;

    return res.json({
      success: true,
      supplier: req.supplier,
      kpis: {
        total_pos_received: totalPOsReceived,
        pending_quotations: pendingQuotations,
        approved_pos: approvedPOs,
        pending_deliveries: pendingDeliveries,
        completed_deliveries: completedDeliveries,
        pending_payments: Number(pendingPayments.toFixed(2)),
        total_payments_received: Number(totalPaymentsReceived.toFixed(2)),
        unread_notifications: unreadNotifications
      },
      recent_purchase_orders: pos.slice(0, 6),
      recent_notifications: notifications,
      catalog: prodRes.data || []
    });
  } catch (err) {
    console.error('getSupplierDashboard error:', err);
    return res.status(500).json({ success: false, message: 'Failed loading supplier dashboard.' });
  }
};

exports.getSupplierPurchaseOrders = async (req, res) => {
  try {
    const db = req.supplierDb;
    const [posRes, itemsRes] = await Promise.all([
      db.from('purchase_orders').select('*').order('po_id', { ascending: false }),
      db.from('purchase_items').select('*').order('purchase_item_id', { ascending: true })
    ]);
    if (posRes.error) return res.status(500).json({ success: false, message: posRes.error.message });
    if (itemsRes.error) return res.status(500).json({ success: false, message: itemsRes.error.message });

    const itemsByPo = {};
    for (const item of itemsRes.data || []) {
      const k = Number(item.po_id);
      if (!itemsByPo[k]) itemsByPo[k] = [];
      const bounds = resolvePurchaseItemBounds(item);
      itemsByPo[k].push({
        ...item,
        min_unit_price: bounds.min_unit_price,
        max_unit_price: bounds.max_unit_price
      });
    }

    const enriched = (posRes.data || []).map(po => ({
      ...po,
      items: itemsByPo[Number(po.po_id)] || []
    }));

    return res.json({ success: true, purchase_orders: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed fetching purchase orders.' });
  }
};

exports.getSupplierPurchaseOrderById = async (req, res) => {
  try {
    const poId = Number(req.params.poId);
    if (!poId) return res.status(400).json({ success: false, message: 'Invalid PO ID.' });
    const db = req.supplierDb;

    const { data: po, error } = await db
      .from('purchase_orders')
      .select('*')
      .eq('po_id', poId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, message: error.message });
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found for your supplier account.' });
    }

    const [itemsRes, quotesRes, delRes, invRes] = await Promise.all([
      db.from('purchase_items').select('*').eq('po_id', poId).order('purchase_item_id', { ascending: true }),
      db.from('quotations').select('*').eq('po_id', poId).order('quotation_id', { ascending: false }),
      db.from('supplier_deliveries').select('*').eq('po_id', poId).order('delivery_id', { ascending: false }),
      db.from('supplier_invoices').select('*').eq('po_id', poId).order('invoice_id', { ascending: false })
    ]);

    return res.json({
      success: true,
      purchase_order: {
        ...po,
        items: (itemsRes.data || []).map(item => {
          const bounds = resolvePurchaseItemBounds(item);
          return {
            ...item,
            min_unit_price: bounds.min_unit_price,
            max_unit_price: bounds.max_unit_price
          };
        }),
        quotations: quotesRes.data || [],
        deliveries: delRes.data || [],
        invoices: invRes.data || []
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed retrieving purchase order details.' });
  }
};

exports.acknowledgeSupplierPO = async (req, res) => {
  try {
    const poId = Number(req.params.poId);
    if (!poId) return res.status(400).json({ success: false, message: 'Invalid PO ID.' });
    const db = req.supplierDb;

    const { data: po, error: findErr } = await db
      .from('purchase_orders')
      .select('*')
      .eq('po_id', poId)
      .maybeSingle();

    if (findErr) return res.status(500).json({ success: false, message: findErr.message });
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found or belongs to another supplier.' });
    }

    const currStatus = String(po.status || '').toLowerCase();
    const nextStatus = currStatus === 'pending' || currStatus === 'sent' ? 'acknowledged' : po.status;

    const { data: updated, error: updErr } = await db
      .from('purchase_orders')
      .update({
        acknowledged_by_supplier: true,
        acknowledged_at: new Date().toISOString(),
        status: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq('po_id', poId)
      .select()
      .single();

    if (updErr) return res.status(400).json({ success: false, message: updErr.message });

    moduleNotifications.notify({
      targetModules: ['inventory_pos', 'inventory'],
      sourceModule: 'supplier',
      senderName: req.supplier?.supplier_name || `Supplier #${req.supplierId}`,
      title: `Purchase Order ${updated.po_number || `#${poId}`} Acknowledged`,
      message: `${req.supplier?.supplier_name || 'Supplier'} acknowledged ${updated.po_number || `PO-${poId}`}.`,
      severity: 'success',
      refNo: updated.po_number || `PO-${poId}`,
      actionModule: 'inventory_pos'
    });

    return res.json({
      success: true,
      message: `Purchase Order ${updated.po_number || `#${poId}`} acknowledged.`,
      purchase_order: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed acknowledging purchase order.' });
  }
};

exports.getSupplierQuotations = async (req, res) => {
  try {
    const db = req.supplierDb;
    const [qRes, qiRes] = await Promise.all([
      db.from('quotations').select('*').order('quotation_id', { ascending: false }),
      db.from('quotation_items').select('*').order('quotation_item_id', { ascending: true })
    ]);
    if (qRes.error) return res.status(500).json({ success: false, message: qRes.error.message });
    if (qiRes.error) return res.status(500).json({ success: false, message: qiRes.error.message });

    const byQuote = {};
    for (const item of qiRes.data || []) {
      const k = Number(item.quotation_id);
      if (!byQuote[k]) byQuote[k] = [];
      byQuote[k].push(item);
    }

    const quotations = (qRes.data || []).map(q => ({
      ...q,
      items: byQuote[Number(q.quotation_id)] || []
    }));

    return res.json({ success: true, quotations });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed loading quotations.' });
  }
};

exports.submitSupplierQuotation = async (req, res) => {
  try {
    const db = req.supplierDb;
    const poId = req.body.po_id ? Number(req.body.po_id) : null;
    const expectedDeliveryDate = req.body.expected_delivery_date || req.body.expected_supply_date || null;
    const notes = String(req.body.notes || req.body.supplier_notes || '').trim();
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const fallbackTitle = poId
      ? `Quotation for PO-${poId}`
      : (rawItems.map(i => String(i.product_name || '').trim()).filter(Boolean).slice(0, 2).join(', ') || 'Supplier Quotation');
    const title = String(req.body.title || '').trim() || fallbackTitle;

    if (rawItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Please include at least one quoted product item.' });
    }

    let poItemsForOrder = [];
    if (poId) {
      const { data: ownPo } = await db
        .from('purchase_orders')
        .select('po_id')
        .eq('po_id', poId)
        .maybeSingle();
      if (!ownPo) {
        return res.status(403).json({
          success: false,
          message: 'Referenced Purchase Order does not belong to your supplier account.'
        });
      }
      const { data: poItemRows, error: piFetchErr } = await db
        .from('purchase_items')
        .select('*')
        .eq('po_id', poId);
      if (piFetchErr) {
        return res.status(500).json({ success: false, message: piFetchErr.message });
      }
      poItemsForOrder = poItemRows || [];
    }

    const normalizedItems = [];
    const validationErrors = [];
    let totalAmount = 0;

    for (const item of rawItems) {
      const productName = String(item.product_name || '').trim();
      const requestedQty = Math.max(0, parseInt(item.requested_qty ?? item.quantity ?? item.available_qty ?? 0, 10) || 0);
      const availableQty = Math.max(1, parseInt(item.available_qty ?? item.quantity ?? 0, 10) || 0);
      const rawPrice = item.unit_price ?? item.quoted_unit_price;
      const unitPrice = Number(rawPrice);

      if (!productName) {
        return res.status(400).json({
          success: false,
          message: 'Each quotation item requires a product name.'
        });
      }

      // Strictly use DB maximum price limit (never trust any limits submitted by supplier client)
      const matchedPoItem = poId ? findMatchingPurchaseItem(poItemsForOrder, item) : null;
      if (poId && poItemsForOrder.length > 0 && !matchedPoItem) {
        return res.status(400).json({
          success: false,
          message: `Product "${productName}" does not belong to Purchase Order #PO-${poId}.`
        });
      }

      const bounds = resolvePurchaseItemBounds(matchedPoItem);
      if (rawPrice === undefined || rawPrice === null || String(rawPrice).trim() === '' || Number.isNaN(unitPrice)) {
        validationErrors.push(`Enter a valid numeric unit price for "${productName}" (Maximum permitted: KSh ${formatKshNumber(bounds.max_unit_price)}).`);
        continue;
      }

      const check = evaluateQuotationPrice(productName, unitPrice, bounds.max_unit_price);
      if (!check.valid) {
        validationErrors.push(check.message);
        continue;
      }

      const cleanPrice = Number(unitPrice.toFixed(2));
      const lineTotal = Number((availableQty * cleanPrice).toFixed(2));
      totalAmount += lineTotal;
      normalizedItems.push({
        supplier_id: req.supplierId,
        product_id: matchedPoItem?.product_id ? Number(matchedPoItem.product_id) : (item.product_id ? Number(item.product_id) : null),
        product_name: matchedPoItem?.product_name || productName,
        requested_qty: matchedPoItem ? Number(matchedPoItem.ordered_qty || requestedQty) : requestedQty,
        available_qty: availableQty,
        unit_price: cleanPrice,
        line_total: lineTotal,
        min_unit_price: null,
        max_unit_price: bounds.max_unit_price,
        price_validation_status: check.status
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors.join(' '),
        validation_errors: validationErrors
      });
    }

    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quotation total amount must be greater than KSh 0.'
      });
    }

    const paymentCreds = (req.body.payment_credentials && typeof req.body.payment_credentials === 'object') ? req.body.payment_credentials : {};
    const preferredMethod = String(req.body.preferred_payment_method || req.body.payment_method || paymentCreds.payment_method || 'M-Pesa Send Money (Phone Number)').trim();
    const payeeName = String(req.body.payee_name || req.body.account_name || paymentCreds.payee_name || req.supplier?.contact_name || req.supplier?.supplier_name || '').trim();
    const paymentAccount = String(req.body.payment_account || req.body.account_number || paymentCreds.account_number || req.supplier?.phone || '').trim();
    const bankProvider = String(req.body.bank_provider || req.body.bank_name || paymentCreds.bank_name || 'Safaricom M-Pesa').trim();

    const bankAccCheck = validateBankAccountNumber(paymentAccount, preferredMethod, { required: true, label: 'Bank account number' });
    if (!bankAccCheck.valid) {
      return res.status(400).json({ success: false, message: bankAccCheck.message });
    }

    const credNote = `Payment Credentials: [Method: ${preferredMethod} | Payee: ${payeeName} | Acc: ${bankAccCheck.value} | Provider: ${bankProvider}]`;
    const fullNotes = [notes, credNote].filter(Boolean).join(' | ');

    let docMeta = { document_name: null, document_path: null };
    if (req.body.document) {
      docMeta = await uploadSupplierDocument(req.supplierId, 'quotations', req.body.document);
    }

    const { data: insertedQuote, error: qErr } = await db
      .from('quotations')
      .insert([{
        quotation_number: genRef('QT'),
        supplier_id: req.supplierId,
        po_id: poId,
        title,
        total_amount: Number(totalAmount.toFixed(2)),
        expected_delivery_date: expectedDeliveryDate,
        notes: fullNotes,
        document_name: docMeta.document_name,
        document_path: docMeta.document_path,
        status: 'submitted'
      }])
      .select()
      .single();

    if (qErr) {
      return res.status(400).json({ success: false, message: qErr.message });
    }

    const itemRows = normalizedItems.map(it => ({
      ...it,
      quotation_id: insertedQuote.quotation_id
    }));
    const { data: insertedItems, error: qiErr } = await db
      .from('quotation_items')
      .insert(itemRows)
      .select();

    if (qiErr) {
      return res.status(400).json({ success: false, message: qiErr.message });
    }

    // Populate PO Target Unit Cost & Total from the supplier's submitted quotation and mark PO for Inventory Manager review
    // (Using service-role `supabase` after `ownPo` ownership check, since suppliers only have SELECT RLS on purchase_items)
    if (poId) {
      const { data: existingPo } = await supabase
        .from('purchase_orders')
        .select('po_id, status, expected_date, notes')
        .eq('po_id', poId)
        .eq('supplier_id', req.supplierId)
        .maybeSingle();

      const poCurrStatus = String(existingPo?.status || '').toLowerCase();
      const canMoveToQuoteSubmitted = ['pending', 'pending_supplier_quotation', 'acknowledged', 'quotation_submitted'].includes(poCurrStatus);
      await supabase
        .from('purchase_orders')
        .update({
          quotation_id: insertedQuote.quotation_id,
          total_amount: insertedQuote.total_amount,
          expected_date: expectedDeliveryDate || existingPo?.expected_date || null,
          notes: (existingPo?.notes ? existingPo.notes + ' | ' : '') + credNote,
          ...(canMoveToQuoteSubmitted ? { status: 'quotation_submitted' } : {}),
          updated_at: new Date().toISOString()
        })
        .eq('po_id', poId)
        .eq('supplier_id', req.supplierId);

      const { data: poItems } = await supabase
        .from('purchase_items')
        .select('*')
        .eq('po_id', poId)
        .eq('supplier_id', req.supplierId);

      for (const poItem of poItems || []) {
        const match = normalizedItems.find(ni =>
          (ni.product_id && poItem.product_id && Number(ni.product_id) === Number(poItem.product_id)) ||
          ni.product_name.toLowerCase() === String(poItem.product_name || '').toLowerCase()
        );
        if (match) {
          const orderedQty = Math.max(1, Number(poItem.ordered_qty || match.requested_qty || 1));
          await supabase
            .from('purchase_items')
            .update({
              unit_cost: match.unit_price,
              line_total: Number((orderedQty * match.unit_price).toFixed(2))
            })
            .eq('purchase_item_id', poItem.purchase_item_id);
        }
      }
    }

    moduleNotifications.notify({
      targetModules: ['inventory_quotations', 'inventory'],
      sourceModule: 'supplier',
      senderName: req.supplier?.supplier_name || `Supplier #${req.supplierId}`,
      title: `New Supplier Quotation ${insertedQuote.quotation_number}`,
      message: `${req.supplier?.supplier_name || 'Supplier'} submitted quotation ${insertedQuote.quotation_number} (KES ${Number(insertedQuote.total_amount || 0).toLocaleString()}) to Inventory Manager.`,
      severity: 'info',
      refNo: insertedQuote.quotation_number,
      actionModule: 'inventory_quotations'
    });

    return res.status(201).json({
      success: true,
      message: `Quotation ${insertedQuote.quotation_number} submitted to Inventory Manager.`,
      quotation: {
        ...insertedQuote,
        items: insertedItems || itemRows
      }
    });
  } catch (err) {
    console.error('submitSupplierQuotation error:', err);
    return res.status(400).json({ success: false, message: err.message || 'Failed submitting quotation.' });
  }
};

exports.getSupplierDeliveries = async (req, res) => {
  try {
    const db = req.supplierDb;
    const [delRes, posRes, itemsRes] = await Promise.all([
      db.from('supplier_deliveries').select('*').order('delivery_id', { ascending: false }),
      db.from('purchase_orders').select('*').order('po_id', { ascending: false }),
      db.from('purchase_items').select('*').order('purchase_item_id', { ascending: true })
    ]);
    if (delRes.error) return res.status(500).json({ success: false, message: delRes.error.message });
    if (posRes.error) return res.status(500).json({ success: false, message: posRes.error.message });

    const dispatchableStatuses = new Set(['approved', 'approved_awaiting_delivery', 'partially_delivered']);
    const approvedPOs = (posRes.data || []).filter(p =>
      dispatchableStatuses.has(String(p.status || '').toLowerCase())
    );
    return res.json({
      success: true,
      deliveries: delRes.data || [],
      approved_purchase_orders: approvedPOs,
      purchase_items: itemsRes.data || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed loading deliveries.' });
  }
};

exports.createSupplierDelivery = async (req, res) => {
  try {
    const db = req.supplierDb;
    const poId = Number(req.body.po_id);
    const dispatchedQty = Math.max(1, parseInt(req.body.dispatched_qty ?? 0, 10) || 0);
    const expectedDeliveryDate = req.body.expected_delivery_date || null;
    const requestedStatus = String(req.body.delivery_status || 'dispatched').toLowerCase();
    const allowedSupplierStatuses = new Set(['pending', 'preparing', 'dispatched', 'in_transit', 'arrived_at_shop']);
    const deliveryStatus = allowedSupplierStatuses.has(requestedStatus) ? requestedStatus : 'dispatched';
    const deliveryNoteRef = String(req.body.delivery_note_ref || '').trim();
    const supplierNotes = String(req.body.supplier_notes || '').trim();
    const itemsDispatched = Array.isArray(req.body.items_dispatched) ? req.body.items_dispatched : [];

    if (!poId) {
      return res.status(400).json({ success: false, message: 'Approved Purchase Order (po_id) is required.' });
    }

    const { data: po, error: poErr } = await db
      .from('purchase_orders')
      .select('*')
      .eq('po_id', poId)
      .maybeSingle();

    if (poErr) return res.status(500).json({ success: false, message: poErr.message });
    if (!po) {
      return res.status(403).json({ success: false, message: 'Purchase order not found for your supplier account.' });
    }
    if (!['approved', 'approved_awaiting_delivery', 'partially_delivered'].includes(String(po.status || '').toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Deliveries can only be submitted after Inventory Manager approves the supplier quotation (Approved – Awaiting Delivery).' });
    }

    let docMeta = { document_name: null, document_path: null };
    if (req.body.document) {
      docMeta = await uploadSupplierDocument(req.supplierId, 'delivery-notes', req.body.document);
    }

    // Explicitly enforce inventory_confirmed = false; ONLY Inventory Manager can confirm received qty & update stock
    const { data: delivery, error: insErr } = await db
      .from('supplier_deliveries')
      .insert([{
        delivery_number: genRef('DEL'),
        po_id: poId,
        supplier_id: req.supplierId,
        dispatched_qty: dispatchedQty,
        items_dispatched: itemsDispatched,
        expected_delivery_date: expectedDeliveryDate,
        delivery_status: deliveryStatus,
        delivery_note_ref: deliveryNoteRef,
        delivery_note_doc_name: docMeta.document_name,
        delivery_note_doc_path: docMeta.document_path,
        supplier_notes: supplierNotes,
        inventory_confirmed: false,
        confirmed_received_qty: 0
      }])
      .select()
      .single();

    if (insErr) return res.status(400).json({ success: false, message: insErr.message });

    await db
      .from('purchase_orders')
      .update({
        delivery_status: deliveryStatus,
        expected_date: expectedDeliveryDate || po.expected_date,
        updated_at: new Date().toISOString()
      })
      .eq('po_id', poId);

    moduleNotifications.notify({
      targetModules: ['inventory_deliveries', 'inventory'],
      sourceModule: 'supplier',
      senderName: req.supplier?.supplier_name || `Supplier #${req.supplierId}`,
      title: `Supplier Delivery ${delivery.delivery_number} Dispatched`,
      message: `${req.supplier?.supplier_name || 'Supplier'} logged delivery ${delivery.delivery_number} (${dispatchedQty} units) for PO-${poId}.`,
      severity: 'info',
      refNo: delivery.delivery_number,
      actionModule: 'inventory_deliveries'
    });

    return res.status(201).json({
      success: true,
      message: `Delivery ${delivery.delivery_number} logged. Awaiting Inventory Manager confirmation upon receipt.`,
      delivery
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || 'Failed creating delivery update.' });
  }
};

exports.updateSupplierDelivery = async (req, res) => {
  try {
    const db = req.supplierDb;
    const deliveryId = Number(req.params.deliveryId);
    if (!deliveryId) return res.status(400).json({ success: false, message: 'Invalid delivery ID.' });

    const { data: existing, error: findErr } = await db
      .from('supplier_deliveries')
      .select('*')
      .eq('delivery_id', deliveryId)
      .maybeSingle();

    if (findErr) return res.status(500).json({ success: false, message: findErr.message });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Delivery record not found for your account.' });
    }
    if (existing.inventory_confirmed) {
      return res.status(403).json({
        success: false,
        message: 'Confirmed deliveries are locked by Inventory Management and cannot be modified.'
      });
    }

    const allowedStatuses = new Set(['pending', 'preparing', 'dispatched', 'in_transit', 'arrived_at_shop']);
    const updates = { updated_at: new Date().toISOString() };
    if (req.body.delivery_status && allowedStatuses.has(String(req.body.delivery_status).toLowerCase())) {
      updates.delivery_status = String(req.body.delivery_status).toLowerCase();
    }
    if (req.body.dispatched_qty !== undefined) {
      updates.dispatched_qty = Math.max(1, parseInt(req.body.dispatched_qty, 10) || existing.dispatched_qty);
    }
    if (req.body.expected_delivery_date !== undefined) {
      updates.expected_delivery_date = req.body.expected_delivery_date || existing.expected_delivery_date;
    }
    if (req.body.delivery_note_ref !== undefined) {
      updates.delivery_note_ref = String(req.body.delivery_note_ref || '').trim();
    }
    if (req.body.supplier_notes !== undefined) {
      updates.supplier_notes = String(req.body.supplier_notes || '').trim();
    }
    if (req.body.document) {
      const docMeta = await uploadSupplierDocument(req.supplierId, 'delivery-notes', req.body.document);
      updates.delivery_note_doc_name = docMeta.document_name;
      updates.delivery_note_doc_path = docMeta.document_path;
    }

    const { data: updated, error: updErr } = await db
      .from('supplier_deliveries')
      .update(updates)
      .eq('delivery_id', deliveryId)
      .select()
      .single();

    if (updErr) return res.status(400).json({ success: false, message: updErr.message });

    if (updates.delivery_status && updated.po_id) {
      await db
        .from('purchase_orders')
        .update({ delivery_status: updates.delivery_status, updated_at: new Date().toISOString() })
        .eq('po_id', updated.po_id);
    }

    moduleNotifications.notify({
      targetModules: ['inventory_deliveries', 'inventory'],
      sourceModule: 'supplier',
      senderName: req.supplier?.supplier_name || `Supplier #${req.supplierId}`,
      title: `Supplier Delivery ${updated.delivery_number || `#${deliveryId}`} Updated (${updated.delivery_status || 'updated'})`,
      message: `Delivery ${updated.delivery_number || `#${deliveryId}`} updated to status: ${updated.delivery_status || 'updated'}.`,
      severity: 'info',
      refNo: updated.delivery_number || `DEL-${deliveryId}`,
      actionModule: 'inventory_deliveries'
    });

    return res.json({ success: true, message: 'Delivery status updated.', delivery: updated });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || 'Failed updating delivery.' });
  }
};

exports.getSupplierInvoices = async (req, res) => {
  try {
    const db = req.supplierDb;
    const [invRes, payRes, poRes] = await Promise.all([
      db.from('supplier_invoices').select('*').order('invoice_id', { ascending: false }),
      db.from('payments').select('*').order('payment_id', { ascending: false }),
      db.from('purchase_orders').select('po_id, po_number, total_amount, status, delivery_status').order('po_id', { ascending: false })
    ]);
    if (invRes.error) return res.status(500).json({ success: false, message: invRes.error.message });
    if (payRes.error) return res.status(500).json({ success: false, message: payRes.error.message });

    return res.json({
      success: true,
      invoices: invRes.data || [],
      payments: payRes.data || [],
      purchase_orders: poRes.data || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed fetching invoices.' });
  }
};

exports.uploadSupplierInvoice = async (req, res) => {
  try {
    const db = req.supplierDb;
    const invoiceNumber = String(req.body.invoice_number || '').trim();
    const poId = req.body.po_id ? Number(req.body.po_id) : null;
    const totalAmount = Number(req.body.total_amount ?? 0);
    const invoiceDate = req.body.invoice_date || new Date().toISOString().split('T')[0];
    const dueDate = req.body.due_date || null;
    const supplierNotes = String(req.body.supplier_notes || '').trim();

    if (!invoiceNumber || Number.isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number and a positive invoice amount are required.'
      });
    }

    if (poId) {
      const { data: ownPo } = await db
        .from('purchase_orders')
        .select('po_id')
        .eq('po_id', poId)
        .maybeSingle();
      if (!ownPo) {
        return res.status(403).json({
          success: false,
          message: 'Referenced Purchase Order does not belong to your supplier account.'
        });
      }
    }

    let docMeta = { document_name: null, document_path: null };
    if (req.body.document) {
      docMeta = await uploadSupplierDocument(req.supplierId, 'invoices', req.body.document);
    }

    // Strict server + RLS enforcement: always pending_review & amount_paid = 0
    const { data: invoice, error: insErr } = await db
      .from('supplier_invoices')
      .insert([{
        invoice_number: invoiceNumber,
        supplier_id: req.supplierId,
        po_id: poId,
        invoice_date: invoiceDate,
        due_date: dueDate,
        total_amount: Number(totalAmount.toFixed(2)),
        amount_paid: 0,
        status: 'pending_review',
        document_name: docMeta.document_name,
        document_path: docMeta.document_path,
        supplier_notes: supplierNotes
      }])
      .select()
      .single();

    if (insErr) {
      const status = insErr.code === '23505' ? 409 : 400;
      return res.status(status).json({
        success: false,
        message: insErr.code === '23505'
          ? `Invoice number "${invoiceNumber}" has already been submitted for your account.`
          : insErr.message
      });
    }

    // Automatically add/increment product stock when Inventory Manager receives the invoice (unless already added via GRN)
    const stockAdditions = [];
    if (poId) {
      const { data: existingGrn } = await supabase
        .from('purchases')
        .select('purchase_id')
        .eq('po_id', poId)
        .limit(1)
        .maybeSingle();

      if (!existingGrn) {
        const { data: poItems } = await supabase
          .from('purchase_items')
          .select('*')
          .eq('po_id', poId);

        for (const item of poItems || []) {
          const qtyToAdd = Math.max(0, Number(item.ordered_qty || 0));
          if (qtyToAdd <= 0) continue;

          let adj = await interModuleSync.adjustProductStock({
            productId: item.product_id,
            productName: item.product_name,
            deltaQuantity: qtyToAdd,
            type: 'STOCK_IN',
            reason: `Supplier Invoice Received (${invoice.invoice_number} / PO-${poId})`,
            actor: 'Inventory Manager'
          });

          // If product is brand new and not yet in catalog, add it automatically
          if (!adj.success) {
            const allProds = await interModuleSync.getProducts();
            const maxId = allProds.reduce((m, p) => Math.max(m, Number(p.product_id) || 0), 0);
            const unitCost = Number(item.unit_cost || 0);
            const newProd = {
              product_id: maxId + 1,
              product_name: item.product_name,
              category_id: 1,
              category_name: 'General',
              buying_price: unitCost,
              selling_price: unitCost > 0 ? Math.ceil(unitCost * 1.25) : 100,
              quantity_in_stock: qtyToAdd,
              reorder_level: 5,
              image_url: 'images/bulb.jpg'
            };
            allProds.push(newProd);
            const prodPath = path.join(__dirname, '../config/products_data.json');
            try { fs.writeFileSync(prodPath, JSON.stringify(allProds, null, 2), 'utf8'); } catch (e) {}
            try { await supabase.from('inventory').insert([newProd]); } catch (e) {}
            adj = { success: true, product: newProd };
          }
          stockAdditions.push({ product_name: item.product_name, added: qtyToAdd, result: adj });
        }
      }
    }

    moduleNotifications.notify({
      targetModules: ['inventory_invoices', 'inventory', 'finance_invoices'],
      sourceModule: 'supplier',
      senderName: req.supplier?.supplier_name || `Supplier #${req.supplierId}`,
      title: `New Supplier Invoice ${invoice.invoice_number}`,
      message: `${req.supplier?.supplier_name || 'Supplier'} uploaded invoice ${invoice.invoice_number} (KES ${Number(invoice.total_amount || 0).toLocaleString()}) awaiting verification & payment.`,
      severity: 'warning',
      refNo: invoice.invoice_number,
      actionModule: 'inventory_invoices'
    });

    return res.status(201).json({
      success: true,
      message: `Invoice ${invoice.invoice_number} submitted to Inventory Manager for verification${stockAdditions.length ? ' & inventory stock updated' : ''}.`,
      invoice,
      stock_additions: stockAdditions
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || 'Failed uploading invoice.' });
  }
};

exports.getSupplierPayments = async (req, res) => {
  try {
    const db = req.supplierDb;
    const [payRes, invRes, poRes] = await Promise.all([
      db.from('payments').select('*').order('payment_id', { ascending: false }),
      db.from('supplier_invoices').select('*').order('invoice_id', { ascending: false }),
      db.from('purchase_orders').select('po_id, po_number, status, total_amount').order('po_id', { ascending: false })
    ]);
    if (payRes.error) return res.status(500).json({ success: false, message: payRes.error.message });

    const invMap = {};
    for (const inv of (invRes.data || [])) {
      invMap[Number(inv.invoice_id)] = inv;
    }
    const poMap = {};
    for (const po of (poRes.data || [])) {
      poMap[Number(po.po_id)] = po;
    }

    const payments = (payRes.data || []).map(p => {
      const inv = p.invoice_id ? invMap[Number(p.invoice_id)] : null;
      const po = p.po_id ? poMap[Number(p.po_id)] : null;
      const payNum = p.payment_number || `PAY-${p.payment_id}`;
      return {
        ...p,
        receipt_number: `RCP-${payNum}`,
        invoice_number: inv?.invoice_number || null,
        invoice_total: inv?.total_amount ?? null,
        po_number: po?.po_number || null,
        confirmed_by_supplier: /confirmed received/i.test(p.notes || '')
      };
    });

    return res.json({
      success: true,
      payments,
      invoices: invRes.data || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed fetching payment records.' });
  }
};

exports.confirmSupplierPaymentReceived = async (req, res) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'Valid payment ID is required.' });
    }
    const db = req.supplierDb;

    // Verify ownership strictly through RLS-scoped supplierDb first
    const { data: payment, error: findErr } = await db
      .from('payments')
      .select('*')
      .eq('payment_id', paymentId)
      .maybeSingle();

    if (findErr || !payment || Number(payment.supplier_id) !== req.supplierId) {
      return res.status(404).json({ success: false, message: 'Payment record not found for your account.' });
    }

    const alreadyConfirmed = /confirmed received/i.test(payment.notes || '');
    if (alreadyConfirmed) {
      return res.json({
        success: true,
        already_confirmed: true,
        message: `Payment ${payment.payment_number || `PAY-${paymentId}`} is already confirmed received.`,
        payment: {
          ...payment,
          receipt_number: `RCP-${payment.payment_number || `PAY-${paymentId}`}`,
          confirmed_by_supplier: true
        }
      });
    }

    const confirmDate = new Date().toISOString().slice(0, 10);
    const noteAdd = `[Confirmed received by supplier on ${confirmDate}]`;
    const updatedNotes = payment.notes ? `${payment.notes.trim()} ${noteAdd}` : noteAdd;

    // Persist using service role after verifying ownership (payments RLS has SELECT only for authenticated, and no updated_at column)
    const { data: updatedPayment, error: updateErr } = await supabase
      .from('payments')
      .update({ notes: updatedNotes })
      .eq('payment_id', paymentId)
      .eq('supplier_id', req.supplierId)
      .select('*')
      .single();

    if (updateErr) {
      return res.status(500).json({ success: false, message: `Failed saving payment confirmation: ${updateErr.message}` });
    }

    // Also update local finance_records if matching
    try {
      const finRecs = readJsonFile(FINANCE_RECORDS_PATH, []);
      const match = finRecs.find(f => f.reference_no === payment.transaction_ref || f.reference_no === `PAY-${paymentId}`);
      if (match) {
        match.description = `${match.description || ''} ${noteAdd}`.trim();
        writeJsonFile(FINANCE_RECORDS_PATH, finRecs);
      }
    } catch (e) {}

    await createSupplierNotification(req.supplierId, {
      title: 'Payment Confirmed Received',
      message: `You confirmed receipt of payment ${payment.payment_number || `PAY-${paymentId}`} for KES ${Number(payment.amount_paid || 0).toLocaleString()}.`,
      notification_type: 'payment'
    });

    moduleNotifications.notify({
      targetModules: ['finance_payments', 'finance'],
      sourceModule: 'supplier',
      senderName: req.supplier?.supplier_name || `Supplier #${req.supplierId}`,
      title: `Supplier Confirmed Payment Receipt (${payment.payment_number || `PAY-${paymentId}`})`,
      message: `${req.supplier?.supplier_name || 'Supplier'} confirmed receiving KES ${Number(payment.amount_paid || 0).toLocaleString()}.`,
      severity: 'success',
      refNo: payment.payment_number || `PAY-${paymentId}`,
      actionModule: 'finance_payments'
    });

    return res.json({
      success: true,
      message: `Payment ${payment.payment_number || `PAY-${paymentId}`} confirmed received! Your receipt is ready to download.`,
      payment: {
        ...updatedPayment,
        receipt_number: `RCP-${updatedPayment.payment_number || `PAY-${paymentId}`}`,
        confirmed_by_supplier: true
      }
    });
  } catch (err) {
    console.error('confirmSupplierPaymentReceived error:', err);
    return res.status(500).json({ success: false, message: 'Failed confirming payment receipt.' });
  }
};

exports.downloadSupplierPaymentReceipt = async (req, res) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'Invalid payment ID.' });
    }
    const db = req.supplierDb;

    const { data: payment, error: findErr } = await db
      .from('payments')
      .select('*')
      .eq('payment_id', paymentId)
      .maybeSingle();

    if (findErr || !payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found for your supplier account.' });
    }

    const [invRes, poRes] = await Promise.all([
      payment.invoice_id
        ? db.from('supplier_invoices').select('invoice_id, invoice_number, total_amount, amount_paid, status').eq('invoice_id', payment.invoice_id).maybeSingle()
        : Promise.resolve({ data: null }),
      payment.po_id
        ? db.from('purchase_orders').select('po_id, po_number, status, total_amount').eq('po_id', payment.po_id).maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const payNum = payment.payment_number || `PAY-${paymentId}`;
    const receiptNumber = `RCP-${payNum}`;
    const isConfirmed = /confirmed received/i.test(payment.notes || '');

    const pdfBuffer = buildOfficialReceiptPdf({
      documentTitle: 'OFFICIAL SUPPLIER PAYMENT RECEIPT',
      metaLeft: [
        `Receipt No: ${receiptNumber}`,
        `Payment Voucher: ${payNum}`,
        `Disbursement Date: ${String(payment.payment_date || payment.created_at || '').slice(0, 10) || 'N/A'}`
      ],
      metaRight: [
        `Status: ${isConfirmed ? 'CONFIRMED RECEIVED BY SUPPLIER' : 'DISBURSED BY FINANCE'}`,
        `Transaction Ref: ${payment.transaction_ref || 'N/A'}`,
        `Payment Method: ${payment.payment_method || 'Bank Transfer / M-Pesa'}`
      ],
      statusPositive: isConfirmed,
      sectionTitle: 'PAYEE & SETTLEMENT DETAILS',
      detailRows: [
        ['Supplier / Payee:', req.supplier?.supplier_name || `Supplier #${req.supplierId}`, 'Purchase Order:', poRes.data?.po_number || (payment.po_id ? `PO-${payment.po_id}` : 'N/A')],
        ['Contact Person:', req.supplier?.contact_name || '-', 'Supplier Invoice:', invRes.data?.invoice_number || (payment.invoice_id ? `INV-${payment.invoice_id}` : 'N/A')],
        ['Supplier Phone:', req.supplier?.phone || '-', 'Supplier Email:', req.supplier?.email || '-'],
        ['Disbursed By:', payment.recorded_by || 'Finance Manager', 'Receipt Verified:', isConfirmed ? 'Yes (Supplier Confirmed)' : 'Awaiting Confirmation']
      ],
      amountLabel: 'TOTAL AMOUNT PAID TO SUPPLIER',
      amountSubtext: 'Settled in full/part per verified Finance Manager disbursement record',
      amountValue: Number(payment.amount_paid || 0),
      notesTitle: 'PAYMENT NOTES & CONFIRMATION LOG',
      notesBody: payment.notes || 'Finance Manager disbursed payment via verified supplier credentials.',
      footerLine: 'This is an official electronic payment receipt issued for verified supplier disbursement records.'
    });

    const safeFileName = `Payment-Receipt-${payNum.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
    const disposition = req.query.preview === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('downloadSupplierPaymentReceipt error:', err);
    return res.status(500).json({ success: false, message: 'Failed generating payment receipt.' });
  }
};

exports.getSupplierNotifications = async (req, res) => {
  try {
    let dbRows = [];
    try {
      const { data, error } = await req.supplierDb
        .from('supplier_notifications')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) dbRows = data;
    } catch (e) {}

    const localRes = moduleNotifications.getNotifications({
      module: 'supplier',
      supplierId: req.supplierId,
      limit: 50
    });
    const combined = dbRows.length > 0 ? dbRows : localRes.notifications;
    const unreadCount = combined.filter(n => !n.is_read).length;
    return res.json({ success: true, notifications: combined, unread_count: unreadCount });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed loading notifications.' });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    if (rawId.startsWith('NTF-')) {
      const updated = moduleNotifications.markNotificationRead(rawId, { module: 'supplier', supplierId: req.supplierId });
      if (!updated) return res.status(404).json({ success: false, message: 'Notification not found.' });
      return res.json({ success: true, notification: updated });
    }
    const id = Number(rawId);
    const { data, error } = await req.supplierDb
      .from('supplier_notifications')
      .update({ is_read: true })
      .eq('notification_id', id)
      .select()
      .maybeSingle();
    if (error) return res.status(400).json({ success: false, message: error.message });
    if (!data) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.json({ success: true, notification: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed updating notification.' });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    moduleNotifications.markAllRead({ module: 'supplier', supplierId: req.supplierId });
    try {
      await req.supplierDb
        .from('supplier_notifications')
        .update({ is_read: true })
        .eq('is_read', false);
    } catch (e) {}
    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed marking notifications read.' });
  }
};

exports.downloadOwnSupplierDocument = async (req, res) => {
  try {
    const db = req.supplierDb;
    const docType = String(req.params.docType || '').toLowerCase();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid document record ID.' });

    let storagePath = null;
    let fileName = null;

    if (docType === 'quotation') {
      const { data } = await db.from('quotations').select('document_path, document_name').eq('quotation_id', id).maybeSingle();
      storagePath = data?.document_path;
      fileName = data?.document_name;
    } else if (docType === 'delivery') {
      const { data } = await db.from('supplier_deliveries').select('delivery_note_doc_path, delivery_note_doc_name').eq('delivery_id', id).maybeSingle();
      storagePath = data?.delivery_note_doc_path;
      fileName = data?.delivery_note_doc_name;
    } else if (docType === 'invoice') {
      const { data } = await db.from('supplier_invoices').select('document_path, document_name').eq('invoice_id', id).maybeSingle();
      storagePath = data?.document_path;
      fileName = data?.document_name;
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported document type.' });
    }

    if (!storagePath) {
      return res.status(404).json({ success: false, message: 'Document not found for your supplier account.' });
    }
    return await streamStoredDocument(res, storagePath, fileName);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed downloading document.' });
  }
};

// =========================================================================
// 3. INTERNAL ERP ADMIN ENDPOINTS (SUPPLIER ACCOUNT MANAGEMENT)
// =========================================================================

exports.erpListSuppliers = async (req, res) => {
  try {
    const [supRes, posRes, invRes, payRes, authListRes] = await Promise.all([
      supabase.from('suppliers').select('*').order('supplier_id', { ascending: false }),
      supabase.from('purchase_orders').select('po_id, supplier_id, total_amount, status'),
      supabase.from('supplier_invoices').select('invoice_id, supplier_id, total_amount, amount_paid, status'),
      supabase.from('payments').select('payment_id, supplier_id, amount_paid'),
      supabase.auth.admin.listUsers({ perPage: 1000 })
    ]);

    if (supRes.error) return res.status(500).json({ success: false, message: supRes.error.message });

    const authMap = {};
    for (const u of authListRes?.data?.users || []) {
      authMap[u.id] = {
        email: u.email,
        last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until,
        email_confirmed_at: u.email_confirmed_at
      };
    }

    const pos = posRes.data || [];
    const invs = invRes.data || [];
    const pays = payRes.data || [];

    const suppliers = (supRes.data || []).map(s => {
      const myPos = pos.filter(p => Number(p.supplier_id) === Number(s.supplier_id));
      const myInvs = invs.filter(i => Number(i.supplier_id) === Number(s.supplier_id) && String(i.status).toLowerCase() !== 'rejected');
      const myPays = pays.filter(p => Number(p.supplier_id) === Number(s.supplier_id));
      const totalBilled = myInvs.reduce((acc, i) => acc + Number(i.total_amount || 0), 0);
      const totalPaid = myPays.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0);

      return {
        ...s,
        has_auth_account: Boolean(s.auth_user_id),
        auth_info: s.auth_user_id ? (authMap[s.auth_user_id] || null) : null,
        stats: {
          po_count: myPos.length,
          invoice_count: myInvs.length,
          total_billed: Number(totalBilled.toFixed(2)),
          total_paid: Number(totalPaid.toFixed(2)),
          balance_payable: Number(Math.max(0, totalBilled - totalPaid).toFixed(2))
        }
      };
    });

    return res.json({ success: true, suppliers });
  } catch (err) {
    console.error('erpListSuppliers error:', err);
    return res.status(500).json({ success: false, message: 'Failed listing suppliers.' });
  }
};

exports.erpGetSupplierDetails = async (req, res) => {
  try {
    const supplierId = Number(req.params.supplierId);
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('supplier_id', supplierId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, message: error.message });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });

    const [posRes, quotesRes, delRes, invRes, payRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('supplier_id', supplierId).order('po_id', { ascending: false }),
      supabase.from('quotations').select('*').eq('supplier_id', supplierId).order('quotation_id', { ascending: false }),
      supabase.from('supplier_deliveries').select('*').eq('supplier_id', supplierId).order('delivery_id', { ascending: false }),
      supabase.from('supplier_invoices').select('*').eq('supplier_id', supplierId).order('invoice_id', { ascending: false }),
      supabase.from('payments').select('*').eq('supplier_id', supplierId).order('payment_id', { ascending: false })
    ]);

    return res.json({
      success: true,
      supplier,
      purchase_orders: posRes.data || [],
      quotations: quotesRes.data || [],
      deliveries: delRes.data || [],
      invoices: invRes.data || [],
      payments: payRes.data || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed retrieving supplier details.' });
  }
};

exports.erpRegisterSupplier = async (req, res) => {
  try {
    const supplierName = String(req.body.supplier_name || '').trim();
    const contactPerson = String(req.body.contact_person || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const address = String(req.body.address || '').trim();
    const kraPin = String(req.body.kra_pin || '').trim();
    const businessDescription = String(req.body.business_description || '').trim();
    const status = String(req.body.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const initialPassword = String(req.body.initial_password || '').trim();
    const rawUsername = String(req.body.username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

    if (!supplierName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Supplier name, login email, and phone number are required.'
      });
    }
    if (initialPassword && initialPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Initial password must be at least 8 characters.'
      });
    }

    const effectivePassword = initialPassword || `${crypto.randomBytes(9).toString('base64url')}#A9`;
    let effectiveUsername = rawUsername || generateSupplierUsername(supplierName || email);

    const { data: usernameHit } = await supabase
      .from('suppliers')
      .select('supplier_id')
      .ilike('username', effectiveUsername)
      .maybeSingle();
    if (usernameHit) {
      if (rawUsername) {
        return res.status(409).json({ success: false, message: `Username "${rawUsername}" is already taken.` });
      }
      effectiveUsername = `${effectiveUsername}${String(Date.now()).slice(-3)}`;
    }

    // Check email collision on suppliers first
    const { data: existingSup } = await supabase
      .from('suppliers')
      .select('supplier_id')
      .ilike('email', email)
      .maybeSingle();
    if (existingSup) {
      return res.status(409).json({ success: false, message: `A supplier with email ${email} already exists.` });
    }

    // Check existing Supabase Auth user collision
    const { data: usersPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingAuth = (usersPage?.users || []).find(u => String(u.email || '').toLowerCase() === email);
    if (existingAuth) {
      return res.status(409).json({ success: false, message: `Email ${email} is already registered in authentication.` });
    }

    // Step 1: Insert supplier record and sync username & password into public.suppliers
    const tempCode = `SUP-${String(Date.now()).slice(-6)}`;
    const { data: createdSup, error: supErr } = await supabase
      .from('suppliers')
      .insert([{
        supplier_name: supplierName,
        contact_person: contactPerson,
        email,
        username: effectiveUsername,
        password: effectivePassword,
        phone,
        address,
        kra_pin: kraPin,
        business_description: businessDescription,
        supplier_code: tempCode,
        status,
        account_created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (supErr) return res.status(400).json({ success: false, message: supErr.message });

    const finalCode = `SUP-${String(createdSup.supplier_id).padStart(4, '0')}`;

    // Step 2: Provision dedicated Supabase Auth account linked cleanly to supplier_id
    const { data: createdAuth, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: effectivePassword,
      email_confirm: true,
      ban_duration: status === 'active' ? 'none' : '876000h',
      app_metadata: { role: 'supplier', supplier_id: Number(createdSup.supplier_id) },
      user_metadata: { full_name: contactPerson || supplierName, company_name: supplierName }
    });

    if (authErr || !createdAuth?.user) {
      await supabase.from('suppliers').delete().eq('supplier_id', createdSup.supplier_id);
      return res.status(400).json({
        success: false,
        message: `Supabase Auth creation failed: ${authErr?.message || 'unknown error'}`
      });
    }

    const { data: finalSup } = await supabase
      .from('suppliers')
      .update({
        auth_user_id: createdAuth.user.id,
        supplier_code: finalCode,
        updated_at: new Date().toISOString()
      })
      .eq('supplier_id', createdSup.supplier_id)
      .select()
      .single();

    // Generate secure recovery link so the supplier can also set/reset their own password securely
    let recoveryLink = null;
    try {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email
      });
      recoveryLink = linkData?.properties?.action_link || null;
    } catch (e) { }

    return res.status(201).json({
      success: true,
      message: `Supplier "${supplierName}" registered with Supabase Auth account (${finalCode}).`,
      supplier: finalSup || createdSup,
      recovery_link: recoveryLink
    });
  } catch (err) {
    console.error('erpRegisterSupplier error:', err);
    return res.status(500).json({ success: false, message: 'Failed registering supplier account.' });
  }
};

exports.erpUpdateSupplier = async (req, res) => {
  try {
    const supplierId = Number(req.params.supplierId);
    const { data: existing, error: findErr } = await supabase
      .from('suppliers')
      .select('*')
      .eq('supplier_id', supplierId)
      .maybeSingle();

    if (findErr) return res.status(500).json({ success: false, message: findErr.message });
    if (!existing) return res.status(404).json({ success: false, message: 'Supplier not found.' });

    const updates = { updated_at: new Date().toISOString() };
    for (const field of ['supplier_name', 'contact_person', 'phone', 'address', 'kra_pin', 'business_description']) {
      if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
    }
    if (req.body.status !== undefined) {
      const st = String(req.body.status).toLowerCase();
      updates.status = st === 'inactive' || st === 'suspended' ? st : 'active';
    }

    const { data: updated, error: updErr } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('supplier_id', supplierId)
      .select()
      .single();
    if (updErr) return res.status(400).json({ success: false, message: updErr.message });

    if (existing.auth_user_id && updates.status) {
      await supabase.auth.admin.updateUserById(existing.auth_user_id, {
        ban_duration: updates.status === 'active' ? 'none' : '876000h',
        user_metadata: {
          full_name: updated.contact_person || updated.supplier_name,
          company_name: updated.supplier_name
        }
      });
    }

    return res.json({ success: true, message: 'Supplier details updated.', supplier: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed updating supplier.' });
  }
};

exports.erpToggleSupplierStatus = async (req, res) => {
  try {
    const supplierId = Number(req.params.supplierId);
    const { data: existing } = await supabase
      .from('suppliers')
      .select('*')
      .eq('supplier_id', supplierId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Supplier not found.' });

    const desired = req.body.status
      ? String(req.body.status).toLowerCase()
      : (String(existing.status).toLowerCase() === 'active' ? 'inactive' : 'active');
    const nextStatus = desired === 'active' ? 'active' : 'inactive';

    const { data: updated, error } = await supabase
      .from('suppliers')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('supplier_id', supplierId)
      .select()
      .single();
    if (error) return res.status(400).json({ success: false, message: error.message });

    if (existing.auth_user_id) {
      await supabase.auth.admin.updateUserById(existing.auth_user_id, {
        ban_duration: nextStatus === 'active' ? 'none' : '876000h'
      });
    }

    return res.json({
      success: true,
      message: `${updated.supplier_name} account is now ${nextStatus.toUpperCase()}.`,
      supplier: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed toggling supplier account status.' });
  }
};

exports.erpResetSupplierPassword = async (req, res) => {
  try {
    const supplierId = Number(req.params.supplierId);
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('*')
      .eq('supplier_id', supplierId)
      .maybeSingle();

    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
    if (!supplier.auth_user_id || !supplier.email) {
      return res.status(400).json({ success: false, message: 'Supplier does not have a linked Supabase Auth login yet.' });
    }

    const tempPassword = String(req.body.temporary_password || '').trim();
    if (tempPassword) {
      if (tempPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Temporary password must be at least 8 characters.' });
      }
      const { error: pwdErr } = await supabase.auth.admin.updateUserById(supplier.auth_user_id, {
        password: tempPassword
      });
      if (pwdErr) return res.status(400).json({ success: false, message: pwdErr.message });

      await supabase
        .from('suppliers')
        .update({ password: tempPassword, updated_at: new Date().toISOString() })
        .eq('supplier_id', supplierId);
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: supplier.email
    });
    if (linkErr) {
      return res.status(400).json({ success: false, message: linkErr.message });
    }

    await createSupplierNotification(supplierId, {
      title: 'Password Reset Processed by Administrator',
      message: 'An Administrator initiated a secure Supabase password reset for your Supplier Portal login.',
      notification_type: 'security'
    });

    return res.json({
      success: true,
      message: tempPassword
        ? `Temporary password applied via Supabase Auth and recovery link generated for ${supplier.email}.`
        : `Secure Supabase password recovery link generated for ${supplier.email}.`,
      recovery_link: linkData?.properties?.action_link || null
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed resetting supplier password.' });
  }
};

// =========================================================================
// 4. INTERNAL INVENTORY MANAGER ENDPOINTS (POs, QUOTATIONS, DELIVERY CONFIRM)
// =========================================================================

exports.erpGetProcurementOverview = async (req, res) => {
  try {
    const [supRes, posRes, piRes, qRes, qiRes, delRes, purRes, invRes, prodRes] = await Promise.all([
      supabase.from('suppliers').select('supplier_id, supplier_name, supplier_code, email, phone, status').order('supplier_name'),
      supabase.from('purchase_orders').select('*').order('po_id', { ascending: false }),
      supabase.from('purchase_items').select('*').order('purchase_item_id', { ascending: true }),
      supabase.from('quotations').select('*').order('quotation_id', { ascending: false }),
      supabase.from('quotation_items').select('*').order('quotation_item_id', { ascending: true }),
      supabase.from('supplier_deliveries').select('*').order('delivery_id', { ascending: false }),
      supabase.from('purchases').select('*').order('purchase_id', { ascending: false }),
      supabase.from('supplier_invoices').select('*').order('invoice_id', { ascending: false }),
      interModuleSync.getProducts()
    ]);

    const purchaseItems = (piRes.data || []).map(pi => {
      const bounds = resolvePurchaseItemBounds(pi);
      return {
        ...pi,
        min_unit_price: bounds.min_unit_price,
        max_unit_price: bounds.max_unit_price,
        has_explicit_limits: bounds.has_explicit_limits
      };
    });

    const quoteById = {};
    for (const q of qRes.data || []) quoteById[Number(q.quotation_id)] = q;

    const poItemsByPoId = {};
    for (const pi of purchaseItems) {
      const key = Number(pi.po_id);
      if (!poItemsByPoId[key]) poItemsByPoId[key] = [];
      poItemsByPoId[key].push(pi);
    }

    const enrichedQuotationItems = (qiRes.data || []).map(qi => {
      const parentQuote = quoteById[Number(qi.quotation_id)];
      const poItems = parentQuote?.po_id ? (poItemsByPoId[Number(parentQuote.po_id)] || []) : [];
      const matchedPoItem = findMatchingPurchaseItem(poItems, qi);

      const hasOwnMax = qi.max_unit_price !== null && qi.max_unit_price !== undefined && Number(qi.max_unit_price) > 0;
      const bounds = hasOwnMax
        ? { min_unit_price: null, max_unit_price: Number(qi.max_unit_price) }
        : resolvePurchaseItemBounds(matchedPoItem);

      const check = evaluateQuotationPrice(
        qi.product_name,
        qi.unit_price,
        bounds.max_unit_price
      );

      return {
        ...qi,
        min_unit_price: null,
        max_unit_price: bounds.max_unit_price,
        price_validation_status: check.status
      };
    });

    return res.json({
      success: true,
      suppliers: supRes.data || [],
      purchase_orders: sortByLatest(posRes.data || [], 'po_id'),
      purchase_items: purchaseItems,
      quotations: sortByLatest(qRes.data || [], 'quotation_id'),
      quotation_items: enrichedQuotationItems,
      deliveries: sortByLatest(delRes.data || [], 'delivery_id'),
      purchases: sortByLatest(purRes.data || [], 'purchase_id'),
      invoices: sortByLatest(invRes.data || [], 'invoice_id'),
      products: sortByLatest(prodRes || [], 'product_id')
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed loading procurement overview.' });
  }
};

exports.erpCreatePurchaseOrder = async (req, res) => {
  try {
    const supplierId = Number(req.body.supplier_id);
    const expectedDate = req.body.expected_date || null;
    // Enforce procurement workflow: POs MUST always start as Pending Supplier Quotation
    const status = 'pending_supplier_quotation';
    const notes = String(req.body.notes || '').trim();
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

    if (!supplierId || rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Supplier selection and at least one product line item are required.'
      });
    }

    const { data: supplier } = await supabase
      .from('suppliers')
      .select('supplier_id, supplier_name, status')
      .eq('supplier_id', supplierId)
      .maybeSingle();
    if (!supplier) return res.status(404).json({ success: false, message: 'Selected supplier not found.' });

    let totalAmount = 0;
    const summaryParts = [];
    const normalizedItems = [];
    for (const item of rawItems) {
      const productName = String(item.product_name || '').trim();
      const orderedQty = parseInt(item.ordered_qty ?? 0, 10);
      const unitCost = Math.max(0, Number(item.unit_cost ?? 0) || 0);
      const maxPrice = Number(item.max_unit_price);

      if (!productName) {
        return res.status(400).json({ success: false, message: 'Each PO line item must specify a product name.' });
      }
      if (Number.isNaN(orderedQty) || orderedQty < 1) {
        return res.status(400).json({ success: false, message: `Requested quantity for "${productName}" must be at least 1.` });
      }
      if (item.max_unit_price === undefined || item.max_unit_price === null || String(item.max_unit_price).trim() === '' || Number.isNaN(maxPrice) || maxPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: `Maximum acceptable unit price (KES) for "${productName}" must be greater than KSh 0.`
        });
      }

      const lineTotal = Number((orderedQty * unitCost).toFixed(2));
      totalAmount += lineTotal;
      summaryParts.push(`${orderedQty}x ${productName}`);
      normalizedItems.push({
        supplier_id: supplierId,
        product_id: item.product_id ? Number(item.product_id) : null,
        product_name: productName,
        ordered_qty: orderedQty,
        dispatched_qty: 0,
        received_qty: 0,
        outstanding_qty: orderedQty,
        unit_cost: Number(unitCost.toFixed(2)),
        line_total: lineTotal,
        min_unit_price: null,
        max_unit_price: Number(maxPrice.toFixed(2))
      });
    }

    const poNumber = genRef('PO');
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert([{
        po_number: poNumber,
        supplier_id: supplierId,
        supplier_name: supplier.supplier_name,
        items_summary: summaryParts.join(', '),
        total_amount: Number(totalAmount.toFixed(2)),
        order_date: new Date().toISOString().split('T')[0],
        expected_date: expectedDate,
        status,
        delivery_status: 'pending',
        payment_status: 'pending',
        notes,
        created_by: req.erpActor?.name || 'Inventory Manager'
      }])
      .select()
      .single();

    if (poErr) return res.status(400).json({ success: false, message: poErr.message });

    const { data: poItems, error: piErr } = await supabase
      .from('purchase_items')
      .insert(normalizedItems.map(it => ({ ...it, po_id: po.po_id })))
      .select();
    if (piErr) return res.status(400).json({ success: false, message: piErr.message });

    await createSupplierNotification(supplierId, {
      title: `New Purchase Order ${po.po_number} Assigned`,
      message: `Inventory Manager assigned ${po.po_number} (${po.items_summary}). Status: Pending Supplier Quotation — submit unit prices within each product's specified limits.`,
      notification_type: 'po_assigned',
      related_type: 'purchase_order',
      related_id: po.po_id
    });

    return res.status(201).json({
      success: true,
      message: `Purchase Order ${po.po_number} created as Pending Supplier Quotation and assigned to ${supplier.supplier_name}.`,
      purchase_order: { ...po, items: poItems || normalizedItems }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed creating Purchase Order.' });
  }
};

exports.erpReviewQuotation = async (req, res) => {
  try {
    const quotationId = Number(req.params.quotationId);
    const action = String(req.body.action || '').toLowerCase();
    const reviewNotes = String(req.body.review_notes || '').trim();
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be "approve" or "reject".' });
    }

    const { data: quote } = await supabase
      .from('quotations')
      .select('*')
      .eq('quotation_id', quotationId)
      .maybeSingle();
    if (!quote) return res.status(404).json({ success: false, message: 'Quotation not found.' });

    let preloadedQItems = null;
    if (action === 'approve') {
      const [{ data: qItems }, { data: poItems }] = await Promise.all([
        supabase.from('quotation_items').select('*').eq('quotation_id', quotationId),
        quote.po_id
          ? supabase.from('purchase_items').select('*').eq('po_id', quote.po_id)
          : Promise.resolve({ data: [] })
      ]);
      preloadedQItems = qItems || [];

      if (Number(quote.total_amount || 0) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot accept or approve a quotation with KSh 0 total amount.'
        });
      }
      if (preloadedQItems.some(i => Number(i.unit_price || 0) <= 0)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot accept or approve a quotation containing an item with KSh 0 unit price.'
        });
      }

      for (const qi of preloadedQItems) {
        const matchedPoItem = findMatchingPurchaseItem(poItems || [], qi);
        const hasOwnMax = qi.max_unit_price !== null && qi.max_unit_price !== undefined && Number(qi.max_unit_price) > 0;
        if (matchedPoItem || hasOwnMax) {
          const bounds = hasOwnMax
            ? { max_unit_price: Number(qi.max_unit_price) }
            : resolvePurchaseItemBounds(matchedPoItem);
          const check = evaluateQuotationPrice(qi.product_name, qi.unit_price, bounds.max_unit_price);
          if (!check.valid) {
            return res.status(400).json({
              success: false,
              message: `Cannot approve quotation: ${check.message}`
            });
          }
        }
      }
    }

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    const actorName = req.erpActor?.name || 'Inventory Manager';

    const { data: updatedQuote, error: qErr } = await supabase
      .from('quotations')
      .update({
        status: nextStatus,
        reviewed_by: actorName,
        review_notes: reviewNotes,
        reviewed_at: new Date().toISOString()
      })
      .eq('quotation_id', quotationId)
      .select()
      .single();
    if (qErr) return res.status(400).json({ success: false, message: qErr.message });

    let linkedPoId = quote.po_id;
    if (action === 'approve') {
      const qItems = preloadedQItems || [];

      if (linkedPoId) {
        await supabase
          .from('purchase_orders')
          .update({
            status: 'approved_awaiting_delivery',
            quotation_id: quotationId,
            total_amount: quote.total_amount,
            expected_date: quote.expected_delivery_date || undefined,
            updated_at: new Date().toISOString()
          })
          .eq('po_id', linkedPoId);

        // Sync approved unit prices onto PO items
        const { data: poItems } = await supabase
          .from('purchase_items')
          .select('*')
          .eq('po_id', linkedPoId);
        for (const poItem of poItems || []) {
          const match = (qItems || []).find(qi =>
            (qi.product_id && poItem.product_id && Number(qi.product_id) === Number(poItem.product_id)) ||
            String(qi.product_name || '').toLowerCase() === String(poItem.product_name || '').toLowerCase()
          );
          if (match) {
            const orderedQty = Math.max(1, Number(poItem.ordered_qty || match.available_qty || 1));
            await supabase
              .from('purchase_items')
              .update({
                unit_cost: Number(match.unit_price || 0),
                line_total: Number((orderedQty * Number(match.unit_price || 0)).toFixed(2))
              })
              .eq('purchase_item_id', poItem.purchase_item_id);
          }
        }
      } else {
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('supplier_name')
          .eq('supplier_id', quote.supplier_id)
          .maybeSingle();
        const summary = (qItems || []).map(i => `${i.available_qty}x ${i.product_name}`).join(', ') || quote.title;
        const { data: createdPo } = await supabase
          .from('purchase_orders')
          .insert([{
            po_number: genRef('PO'),
            supplier_id: quote.supplier_id,
            supplier_name: supplier?.supplier_name || 'Supplier',
            quotation_id: quotationId,
            items_summary: summary,
            total_amount: quote.total_amount,
            order_date: new Date().toISOString().split('T')[0],
            expected_date: quote.expected_delivery_date,
            status: 'approved_awaiting_delivery',
            delivery_status: 'pending',
            payment_status: 'pending',
            notes: `Approved from Quotation ${quote.quotation_number}`,
            created_by: actorName
          }])
          .select()
          .single();

        if (createdPo) {
          linkedPoId = createdPo.po_id;
          await supabase.from('quotations').update({ po_id: linkedPoId }).eq('quotation_id', quotationId);
          if (qItems && qItems.length > 0) {
            await supabase.from('purchase_items').insert(
              qItems.map(i => ({
                po_id: linkedPoId,
                supplier_id: quote.supplier_id,
                product_id: i.product_id,
                product_name: i.product_name,
                ordered_qty: i.available_qty,
                outstanding_qty: i.available_qty,
                unit_cost: i.unit_price,
                line_total: i.line_total
              }))
            );
          }
        }
      }
    } else if (action === 'reject' && linkedPoId) {
      await supabase
        .from('purchase_orders')
        .update({
          status: 'pending_supplier_quotation',
          updated_at: new Date().toISOString()
        })
        .eq('po_id', linkedPoId);
    }

    await createSupplierNotification(quote.supplier_id, {
      title: `Quotation ${quote.quotation_number} ${nextStatus === 'approved' ? 'Approved – Awaiting Delivery' : 'Rejected'}`,
      message: `${actorName} ${nextStatus} quotation "${quote.title}" (KES ${Number(quote.total_amount).toLocaleString()}). ${nextStatus === 'approved' ? 'PO status is now Approved – Awaiting Delivery.' : ''} ${reviewNotes ? `Notes: ${reviewNotes}` : ''}`,
      notification_type: nextStatus === 'approved' ? 'quotation_approved' : 'quotation_rejected',
      related_type: 'quotation',
      related_id: quotationId
    });

    return res.json({
      success: true,
      message: `Quotation ${quote.quotation_number} ${nextStatus}.`,
      quotation: updatedQuote,
      po_id: linkedPoId
    });
  } catch (err) {
    console.error('erpReviewQuotation error:', err);
    return res.status(500).json({ success: false, message: 'Failed reviewing quotation.' });
  }
};

exports.erpConfirmDeliveryReceived = async (req, res) => {
  try {
    const deliveryId = Number(req.params.deliveryId);
    const confirmationNotes = String(req.body.confirmation_notes || '').trim();
    const actorName = req.erpActor?.name || 'Inventory Manager';

    const { data: delivery } = await supabase
      .from('supplier_deliveries')
      .select('*')
      .eq('delivery_id', deliveryId)
      .maybeSingle();

    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery record not found.' });
    if (delivery.inventory_confirmed) {
      return res.status(409).json({ success: false, message: 'This delivery has already been confirmed and added to inventory.' });
    }

    const { data: po } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('po_id', delivery.po_id)
      .maybeSingle();
    const { data: poItems } = await supabase
      .from('purchase_items')
      .select('*')
      .eq('po_id', delivery.po_id)
      .order('purchase_item_id', { ascending: true });

    const confirmedQtyInput = req.body.confirmed_received_qty !== undefined
      ? parseInt(req.body.confirmed_received_qty, 10)
      : delivery.dispatched_qty;
    const confirmedQty = Math.max(0, Number.isNaN(confirmedQtyInput) ? delivery.dispatched_qty : confirmedQtyInput);
    if (confirmedQty <= 0) {
      return res.status(400).json({ success: false, message: 'Confirmed received quantity must be greater than 0.' });
    }

    // Build per-item confirmation map if provided
    const itemOverrides = {};
    if (Array.isArray(req.body.items)) {
      for (const it of req.body.items) {
        if (it.purchase_item_id) itemOverrides[Number(it.purchase_item_id)] = Math.max(0, parseInt(it.received_qty ?? 0, 10) || 0);
      }
    }

    // Step 1: Create official Goods Received Note (GRN) in public.purchases & forward to Finance Manager
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('supplier_name')
      .eq('supplier_id', delivery.supplier_id)
      .maybeSingle();

    const grnNumber = genRef('GRN');
    const grnAmount = (poItems && poItems.length === 1 && Number(poItems[0].unit_cost || 0) > 0)
      ? Number((confirmedQty * Number(poItems[0].unit_cost)).toFixed(2))
      : Number(po?.total_amount || 0);

    const { data: purchase, error: purErr } = await supabase
      .from('purchases')
      .insert([{
        purchase_number: genRef('PUR'),
        grn_number: grnNumber,
        po_id: delivery.po_id,
        delivery_id: deliveryId,
        quotation_id: po?.quotation_id || null,
        supplier_id: delivery.supplier_id,
        supplier_name: po?.supplier_name || supplier?.supplier_name || 'Supplier',
        purchase_date: new Date().toISOString().split('T')[0],
        total_amount: grnAmount,
        received_qty: confirmedQty,
        outstanding_qty: 0,
        delivery_status: 'received',
        confirmed_by: actorName,
        confirmation_notes: confirmationNotes || `GRN ${grnNumber} generated for delivery ${delivery.delivery_number}`,
        confirmed_at: new Date().toISOString(),
        forwarded_to_finance: true,
        forwarded_at: new Date().toISOString()
      }])
      .select()
      .single();
    if (purErr) return res.status(400).json({ success: false, message: purErr.message });

    // Step 2: Update shop's ACTUAL inventory stock ONLY for confirmed received quantities & track outstanding qty
    const stockAdjustments = [];
    let remainingToAllocate = confirmedQty;
    let totalOrderedAcrossPo = 0;
    let totalReceivedAcrossPo = 0;

    for (const item of poItems || []) {
      const prevReceived = Number(item.received_qty || 0);
      const ordered = Number(item.ordered_qty || 0);
      const prevOutstanding = Math.max(0, ordered - prevReceived);
      totalOrderedAcrossPo += ordered;

      let deltaReceived = 0;
      if (itemOverrides[Number(item.purchase_item_id)] !== undefined) {
        deltaReceived = itemOverrides[Number(item.purchase_item_id)];
      } else if ((poItems || []).length === 1) {
        deltaReceived = confirmedQty;
      } else {
        deltaReceived = Math.min(prevOutstanding, remainingToAllocate);
        remainingToAllocate = Math.max(0, remainingToAllocate - deltaReceived);
      }

      const newReceivedQty = prevReceived + deltaReceived;
      const newOutstandingQty = Math.max(0, ordered - newReceivedQty);
      totalReceivedAcrossPo += newReceivedQty;

      await supabase
        .from('purchase_items')
        .update({
          purchase_id: purchase.purchase_id,
          dispatched_qty: Number(item.dispatched_qty || 0) + deltaReceived,
          received_qty: newReceivedQty,
          outstanding_qty: newOutstandingQty
        })
        .eq('purchase_item_id', item.purchase_item_id);

      if (deltaReceived > 0) {
        const { data: alreadyAddedViaInvoice } = await supabase
          .from('stock_movements')
          .select('movement_id')
          .ilike('reason', `%Supplier Invoice Received%PO-${delivery.po_id}%`)
          .limit(1)
          .maybeSingle();

        if (!alreadyAddedViaInvoice) {
          const adj = await interModuleSync.adjustProductStock({
            productId: item.product_id,
            productName: item.product_name,
            deltaQuantity: deltaReceived,
            type: 'STOCK_IN',
            reason: `GRN ${grnNumber} Confirmed (${delivery.delivery_number} / ${po?.po_number || `PO-${delivery.po_id}`})`,
            actor: actorName
          });
          stockAdjustments.push({ product_name: item.product_name, added: deltaReceived, outstanding: newOutstandingQty, result: adj });
        }
      }
    }

    const totalOutstanding = Math.max(0, totalOrderedAcrossPo - totalReceivedAcrossPo);
    const poDeliveryState = totalOutstanding > 0 ? 'partially_delivered' : 'received';
    const poLifecycleState = totalOutstanding > 0 ? 'partially_delivered' : 'delivered';

    await supabase
      .from('purchases')
      .update({
        outstanding_qty: totalOutstanding,
        delivery_status: poDeliveryState
      })
      .eq('purchase_id', purchase.purchase_id);

    // Step 3: Lock delivery & update PO status + forward packet to Finance Manager
    const { data: confirmedDel, error: delErr } = await supabase
      .from('supplier_deliveries')
      .update({
        inventory_confirmed: true,
        confirmed_received_qty: confirmedQty,
        outstanding_qty: totalOutstanding,
        grn_number: grnNumber,
        delivery_status: 'confirmed',
        confirmed_by: actorName,
        confirmed_at: new Date().toISOString(),
        confirmation_notes: confirmationNotes,
        updated_at: new Date().toISOString()
      })
      .eq('delivery_id', deliveryId)
      .select()
      .single();
    if (delErr) return res.status(400).json({ success: false, message: delErr.message });

    await supabase
      .from('purchase_orders')
      .update({
        status: poLifecycleState,
        delivery_status: poDeliveryState,
        grn_number: grnNumber,
        forwarded_to_finance: true,
        forwarded_to_finance_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('po_id', delivery.po_id);

    // Automatically link & pass any pending_review supplier invoice for this PO to Finance Manager for payment
    await supabase
      .from('supplier_invoices')
      .update({
        purchase_id: purchase.purchase_id,
        grn_number: grnNumber,
        quotation_id: po?.quotation_id || null,
        status: 'approved',
        reviewed_by: actorName,
        reviewed_at: new Date().toISOString(),
        finance_notes: `Delivery confirmed (${grnNumber}) by ${actorName}; passed to Finance Manager for payment.`
      })
      .eq('po_id', delivery.po_id)
      .eq('status', 'pending_review');

    await createSupplierNotification(delivery.supplier_id, {
      title: `Delivery ${delivery.delivery_number} Confirmed (${grnNumber})`,
      message: `${actorName} confirmed receipt of ${confirmedQty} units for ${po?.po_number || `PO-${delivery.po_id}`} (GRN: ${grnNumber}). Outstanding qty: ${totalOutstanding}. Forwarded to Finance Manager.`,
      notification_type: 'delivery_confirmed',
      related_type: 'delivery',
      related_id: deliveryId
    });

    moduleNotifications.notify({
      targetModules: ['finance_invoices', 'finance'],
      sourceModule: 'inventory',
      senderName: actorName,
      title: `GRN ${grnNumber} Forwarded to Finance for Supplier Payment`,
      message: `${actorName} confirmed delivery ${delivery.delivery_number} (${confirmedQty} units) for ${po?.po_number || `PO-${delivery.po_id}`}. Forwarded to Finance Manager.`,
      severity: 'info',
      refNo: grnNumber,
      actionModule: 'finance_invoices'
    });

    return res.json({
      success: true,
      message: `Delivery ${delivery.delivery_number} confirmed (${confirmedQty} received, ${totalOutstanding} outstanding). GRN ${grnNumber} generated, stock updated & forwarded to Finance Manager.`,
      delivery: confirmedDel,
      purchase,
      grn_number: grnNumber,
      outstanding_qty: totalOutstanding,
      stock_adjustments: stockAdjustments
    });
  } catch (err) {
    console.error('erpConfirmDeliveryReceived error:', err);
    return res.status(500).json({ success: false, message: 'Failed confirming delivery receipt.' });
  }
};

// =========================================================================
// 5. INTERNAL FINANCE MANAGER ENDPOINTS (INVOICES & SUPPLIER PAYMENTS)
// =========================================================================

function extractPaymentCredentials(notes, supplier) {
  const raw = String(notes || '');
  const blockMatch = /Payment Credentials:\s*\[([^\]]+)\]/i.exec(raw);
  if (blockMatch && blockMatch[1]) {
    const parts = blockMatch[1].split('|').map(s => s.trim());
    const creds = {};
    for (const part of parts) {
      const idx = part.indexOf(':');
      if (idx > -1) {
        const k = part.slice(0, idx).trim().toLowerCase();
        const v = part.slice(idx + 1).trim();
        if (k === 'method') creds.method = v;
        else if (k === 'payee') creds.payee_name = v;
        else if (k === 'acc' || k === 'account') creds.account_number = v;
        else if (k === 'provider' || k === 'bank') creds.bank_provider = v;
      }
    }
    if (creds.method || creds.payee_name || creds.account_number || creds.bank_provider) {
      return {
        method: creds.method || 'M-Pesa Send Money (Phone Number)',
        payee_name: creds.payee_name || supplier?.supplier_name || '',
        account_number: creds.account_number || supplier?.phone || '',
        bank_provider: creds.bank_provider || 'Safaricom M-Pesa',
        source: 'quotation'
      };
    }
  }
  if (supplier) {
    return {
      method: 'M-Pesa Send Money (Phone Number)',
      payee_name: supplier.supplier_name || supplier.contact_person || '',
      account_number: supplier.phone || supplier.email || '',
      bank_provider: 'Safaricom M-Pesa (Supplier Profile)',
      source: 'supplier_profile'
    };
  }
  return null;
}

exports.erpGetFinanceOverview = async (req, res) => {
  try {
    const [invRes, payRes, supRes, poRes, qRes, grnRes] = await Promise.all([
      supabase.from('supplier_invoices').select('*').order('invoice_id', { ascending: false }),
      supabase.from('payments').select('*').order('payment_id', { ascending: false }),
      supabase.from('suppliers').select('supplier_id, supplier_name, supplier_code, contact_person, email, phone, address').order('supplier_name'),
      supabase.from('purchase_orders').select('*').order('po_id', { ascending: false }),
      supabase.from('quotations').select('*').order('quotation_id', { ascending: false }),
      supabase.from('purchases').select('*').order('purchase_id', { ascending: false })
    ]);

    const supMap = {};
    for (const s of (supRes.data || [])) supMap[Number(s.supplier_id)] = s;

    const enrichedQuotes = (qRes.data || []).map(q => ({
      ...q,
      payment_credentials: extractPaymentCredentials(q.notes, supMap[Number(q.supplier_id)])
    }));

    const quoteById = {};
    const quoteByPoId = {};
    const quoteBySupplier = {};
    for (const q of enrichedQuotes) {
      quoteById[Number(q.quotation_id)] = q;
      if (q.po_id && !quoteByPoId[Number(q.po_id)]) quoteByPoId[Number(q.po_id)] = q;
      if (q.supplier_id && q.payment_credentials?.source === 'quotation' && !quoteBySupplier[Number(q.supplier_id)]) {
        quoteBySupplier[Number(q.supplier_id)] = q;
      }
    }

    const enrichedPOs = (poRes.data || []).map(po => {
      const q = (po.quotation_id ? quoteById[Number(po.quotation_id)] : null)
        || quoteByPoId[Number(po.po_id)]
        || quoteBySupplier[Number(po.supplier_id)];
      return {
        ...po,
        payment_credentials: q?.payment_credentials || extractPaymentCredentials('', supMap[Number(po.supplier_id)])
      };
    });

    const passedInvoices = (invRes.data || [])
      .filter(i => String(i.status || '').toLowerCase() !== 'pending_review')
      .map(i => {
        const q = (i.quotation_id ? quoteById[Number(i.quotation_id)] : null)
          || (i.po_id ? quoteByPoId[Number(i.po_id)] : null)
          || quoteBySupplier[Number(i.supplier_id)];
        return {
          ...i,
          payment_credentials: q?.payment_credentials || extractPaymentCredentials('', supMap[Number(i.supplier_id)])
        };
      });

    return res.json({
      success: true,
      invoices: sortByLatest(passedInvoices, 'invoice_id'),
      payments: sortByLatest(payRes.data || [], 'payment_id'),
      suppliers: supRes.data || [],
      purchase_orders: sortByLatest(enrichedPOs, 'po_id'),
      quotations: sortByLatest(enrichedQuotes, 'quotation_id'),
      grns: sortByLatest(grnRes.data || [], 'purchase_id')
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed loading supplier finance overview.' });
  }
};

exports.erpReviewInvoice = async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId);
    const action = String(req.body.action || '').toLowerCase();
    const financeNotes = String(req.body.finance_notes || '').trim();
    if (!['approve', 'accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be "approve" or "reject".' });
    }

    const { data: inv } = await supabase
      .from('supplier_invoices')
      .select('*')
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found.' });

    if (action !== 'reject' && Number(inv.total_amount || 0) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot accept or approve an invoice with KSh 0 total amount.'
      });
    }

    let linkedPurchaseId = inv.purchase_id || null;
    let linkedGrnNumber = inv.grn_number || null;
    let linkedQuotationId = inv.quotation_id || null;

    if (action !== 'reject' && inv.po_id) {
      const [{ data: po }, { data: grn }] = await Promise.all([
        supabase.from('purchase_orders').select('po_id, po_number, forwarded_to_finance, grn_number, quotation_id').eq('po_id', inv.po_id).maybeSingle(),
        supabase.from('purchases').select('purchase_id, grn_number, quotation_id').eq('po_id', inv.po_id).order('purchase_id', { ascending: false }).limit(1).maybeSingle()
      ]);

      if (!po?.forwarded_to_finance && !grn) {
        return res.status(400).json({
          success: false,
          message: `Please confirm delivery receipt (GRN) for ${po?.po_number || `PO-${inv.po_id}`} before passing this invoice to Finance Manager for payment.`
        });
      }

      linkedPurchaseId = linkedPurchaseId || grn?.purchase_id || null;
      linkedGrnNumber = linkedGrnNumber || po?.grn_number || grn?.grn_number || null;
      linkedQuotationId = linkedQuotationId || po?.quotation_id || grn?.quotation_id || null;
    }

    const nextStatus = action === 'reject' ? 'rejected' : (Number(inv.amount_paid || 0) > 0 ? 'partially_paid' : 'approved');
    const actorName = req.erpActor?.name || 'Inventory Manager';

    const { data: updated, error } = await supabase
      .from('supplier_invoices')
      .update({
        status: nextStatus,
        purchase_id: linkedPurchaseId,
        grn_number: linkedGrnNumber,
        quotation_id: linkedQuotationId,
        finance_notes: financeNotes || (action === 'reject' ? 'Rejected by Inventory Manager' : `Delivery confirmed & invoice passed by ${actorName} to Finance Manager for payment.`),
        reviewed_by: actorName,
        reviewed_at: new Date().toISOString()
      })
      .eq('invoice_id', invoiceId)
      .select()
      .single();
    if (error) return res.status(400).json({ success: false, message: error.message });

    await createSupplierNotification(inv.supplier_id, {
      title: `Invoice ${inv.invoice_number} ${action === 'reject' ? 'Rejected' : 'Passed to Finance for Payment'}`,
      message: `${actorName} ${action === 'reject' ? 'rejected' : 'verified delivery and passed'} invoice ${inv.invoice_number} (KES ${Number(inv.total_amount).toLocaleString()}) ${action === 'reject' ? '' : 'to Finance Manager for payment'}. ${financeNotes ? `Notes: ${financeNotes}` : ''}`,
      notification_type: action === 'reject' ? 'invoice_rejected' : 'invoice_accepted',
      related_type: 'invoice',
      related_id: invoiceId
    });

    if (action !== 'reject') {
      moduleNotifications.notify({
        targetModules: ['finance_invoices', 'finance'],
        sourceModule: 'inventory',
        senderName: actorName,
        title: `Supplier Invoice ${inv.invoice_number} Passed to Finance`,
        message: `${actorName} verified invoice ${inv.invoice_number} (KES ${Number(inv.total_amount).toLocaleString()}) — Ready for Finance payment.`,
        severity: 'warning',
        refNo: inv.invoice_number,
        actionModule: 'finance_invoices'
      });
    }

    return res.json({
      success: true,
      message: action === 'reject'
        ? `Invoice ${inv.invoice_number} rejected.`
        : `Invoice ${inv.invoice_number} passed to Finance Manager for payment.`,
      invoice: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed reviewing invoice.' });
  }
};

exports.erpPaySupplierInvoice = async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId);
    const amountPaidNow = Number(req.body.amount_paid ?? 0);
    const paymentMethod = String(req.body.payment_method || 'Bank Transfer').trim();
    const rawRef = String(req.body.transaction_ref || '').trim();
    const paymentDate = req.body.payment_date || new Date().toISOString().split('T')[0];
    const notes = String(req.body.notes || '').trim();
    const actorName = req.erpActor?.name || 'Finance Manager';

    if (Number.isNaN(amountPaidNow) || amountPaidNow <= 0 || !rawRef) {
      return res.status(400).json({
        success: false,
        message: 'A positive payment amount and bank/M-Pesa transaction reference are required.'
      });
    }
    const refCheck = validatePaymentReference(paymentMethod, rawRef, { required: true, label: 'Transaction reference' });
    if (!refCheck.valid) {
      return res.status(400).json({ success: false, message: refCheck.message });
    }
    const transactionRef = refCheck.value;

    const { data: inv } = await supabase
      .from('supplier_invoices')
      .select('*')
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    if (!inv) return res.status(404).json({ success: false, message: 'Supplier invoice not found.' });
    if (String(inv.status).toLowerCase() === 'rejected') {
      return res.status(400).json({ success: false, message: 'Cannot process payment on a rejected invoice.' });
    }

    const alreadyPaid = Number(inv.amount_paid || 0);
    const totalAmt = Number(inv.total_amount || 0);
    if (totalAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Cannot accept or process payment for an invoice with KSh 0 total amount.' });
    }
    const remaining = Number(Math.max(0, totalAmt - alreadyPaid).toFixed(2));
    if (remaining <= 0) {
      return res.status(400).json({ success: false, message: 'This invoice is already fully paid.' });
    }
    if (amountPaidNow > remaining + 0.01) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (KES ${amountPaidNow}) exceeds remaining balance due (KES ${remaining}).`
      });
    }

    const { data: supplier } = await supabase
      .from('suppliers')
      .select('supplier_name')
      .eq('supplier_id', inv.supplier_id)
      .maybeSingle();

    const supplierName = supplier?.supplier_name || `Supplier #${inv.supplier_id}`;

    // Sync expense record into core ERP finance_records + local fallback JSON
    let financeRecordId = Date.now();
    const finDesc = `Supplier Payment to ${supplierName} — Invoice ${inv.invoice_number} [Ref: ${transactionRef}]`;
    try {
      const { data: finRow } = await supabase
        .from('finance_records')
        .insert([{
          type: 'expense',
          category: 'Supplier Payment',
          description: finDesc,
          amount: Number(amountPaidNow.toFixed(2)),
          payment_method: paymentMethod,
          reference_no: transactionRef,
          status: 'confirmed'
        }])
        .select()
        .single();
      if (finRow?.record_id) financeRecordId = finRow.record_id;
    } catch (e) { }

    appendFinanceRecordLocal({
      record_id: financeRecordId,
      type: 'expense',
      category: 'Supplier Payment',
      description: finDesc,
      amount: Number(amountPaidNow.toFixed(2)),
      payment_method: paymentMethod,
      reference_no: transactionRef,
      status: 'confirmed',
      created_at: new Date().toISOString()
    });

    // Record payment in public.payments
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert([{
        payment_number: genRef('PAY-SUP'),
        supplier_id: inv.supplier_id,
        invoice_id: invoiceId,
        po_id: inv.po_id,
        amount_paid: Number(amountPaidNow.toFixed(2)),
        payment_method: paymentMethod,
        transaction_ref: transactionRef,
        payment_date: paymentDate,
        status: 'confirmed',
        notes,
        recorded_by: actorName,
        finance_record_id: financeRecordId
      }])
      .select()
      .single();

    if (payErr) return res.status(400).json({ success: false, message: payErr.message });

    const newPaidTotal = Number(Math.min(totalAmt, alreadyPaid + amountPaidNow).toFixed(2));
    const nextInvStatus = newPaidTotal >= totalAmt - 0.01 ? 'paid' : 'partially_paid';

    const { data: updatedInv } = await supabase
      .from('supplier_invoices')
      .update({
        amount_paid: newPaidTotal,
        status: nextInvStatus,
        reviewed_by: inv.reviewed_by || actorName,
        reviewed_at: inv.reviewed_at || new Date().toISOString(),
        finance_notes: notes ? `${inv.finance_notes ? inv.finance_notes + ' | ' : ''}${notes}` : inv.finance_notes
      })
      .eq('invoice_id', invoiceId)
      .select()
      .single();

    if (inv.po_id) {
      await supabase
        .from('purchase_orders')
        .update({
          payment_status: nextInvStatus,
          updated_at: new Date().toISOString()
        })
        .eq('po_id', inv.po_id);
    }

    await createSupplierNotification(inv.supplier_id, {
      title: `Payment of KES ${amountPaidNow.toLocaleString()} Confirmed`,
      message: `${actorName} processed a ${paymentMethod} payment (Ref: ${transactionRef}) for invoice ${inv.invoice_number}. Status: ${nextInvStatus.replace('_', ' ').toUpperCase()}.`,
      notification_type: 'payment_made',
      related_type: 'payment',
      related_id: payment.payment_id
    });

    return res.status(201).json({
      success: true,
      message: `Payment ${payment.payment_number} recorded (KES ${amountPaidNow.toLocaleString()}). Invoice is now ${nextInvStatus}.`,
      payment,
      invoice: updatedInv
    });
  } catch (err) {
    console.error('erpPaySupplierInvoice error:', err);
    return res.status(500).json({ success: false, message: 'Failed recording supplier payment.' });
  }
};

exports.erpPayForwardedPO = async (req, res) => {
  try {
    const poId = Number(req.params.poId);
    const amountPaidNow = Number(req.body.amount_paid ?? 0);
    const paymentMethod = String(req.body.payment_method || 'Bank Transfer').trim();
    const rawRef = String(req.body.transaction_ref || '').trim();
    const paymentDate = req.body.payment_date || new Date().toISOString().split('T')[0];
    const notes = String(req.body.notes || '').trim();
    const actorName = req.erpActor?.name || 'Finance Manager';

    if (!poId || Number.isNaN(amountPaidNow) || amountPaidNow <= 0 || !rawRef) {
      return res.status(400).json({
        success: false,
        message: 'Valid Purchase Order, positive payment amount, and transaction reference are required.'
      });
    }
    const refCheck = validatePaymentReference(paymentMethod, rawRef, { required: true, label: 'Transaction reference' });
    if (!refCheck.valid) {
      return res.status(400).json({ success: false, message: refCheck.message });
    }
    const transactionRef = refCheck.value;

    const { data: po } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('po_id', poId)
      .maybeSingle();
    if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found.' });

    // Check if an invoice already exists for this PO; otherwise auto-create one from the forwarded GRN/PO packet
    let { data: inv } = await supabase
      .from('supplier_invoices')
      .select('*')
      .eq('po_id', poId)
      .neq('status', 'rejected')
      .order('invoice_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!inv) {
      const { data: grn } = await supabase
        .from('purchases')
        .select('*')
        .eq('po_id', poId)
        .order('purchase_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      const totalDue = Number(po.total_amount || grn?.total_amount || 0);
      if (totalDue <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot accept or process payment for a Purchase Order/GRN with KSh 0 total amount.'
        });
      }
      const { data: createdInv, error: invErr } = await supabase
        .from('supplier_invoices')
        .insert([{
          invoice_number: `INV-${po.po_number || `PO-${poId}`}`,
          supplier_id: po.supplier_id,
          po_id: poId,
          purchase_id: grn?.purchase_id || null,
          quotation_id: po.quotation_id || null,
          grn_number: po.grn_number || grn?.grn_number || null,
          invoice_date: new Date().toISOString().split('T')[0],
          total_amount: totalDue,
          amount_paid: 0,
          status: 'approved',
          supplier_notes: `Auto-generated from forwarded GRN ${po.grn_number || grn?.grn_number || po.po_number}`,
          reviewed_by: actorName,
          reviewed_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (invErr) return res.status(400).json({ success: false, message: invErr.message });
      inv = createdInv;
    }

    // Reuse erpPaySupplierInvoice logic via req.params.invoiceId
    req.params.invoiceId = String(inv.invoice_id);
    return exports.erpPaySupplierInvoice(req, res);
  } catch (err) {
    console.error('erpPayForwardedPO error:', err);
    return res.status(500).json({ success: false, message: 'Failed processing payment for forwarded PO.' });
  }
};

exports.erpDownloadSupplierDocument = async (req, res) => {
  try {
    const docType = String(req.params.docType || '').toLowerCase();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid ID.' });

    let storagePath = null;
    let fileName = null;
    if (docType === 'quotation') {
      const { data } = await supabase.from('quotations').select('document_path, document_name').eq('quotation_id', id).maybeSingle();
      storagePath = data?.document_path;
      fileName = data?.document_name;
    } else if (docType === 'delivery') {
      const { data } = await supabase.from('supplier_deliveries').select('delivery_note_doc_path, delivery_note_doc_name').eq('delivery_id', id).maybeSingle();
      storagePath = data?.delivery_note_doc_path;
      fileName = data?.delivery_note_doc_name;
    } else if (docType === 'invoice') {
      const { data } = await supabase.from('supplier_invoices').select('document_path, document_name').eq('invoice_id', id).maybeSingle();
      storagePath = data?.document_path;
      fileName = data?.document_name;
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported document type.' });
    }

    if (!storagePath) return res.status(404).json({ success: false, message: 'No document attached to this record.' });
    return await streamStoredDocument(res, storagePath, fileName);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed retrieving stored document.' });
  }
};
