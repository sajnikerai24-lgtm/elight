const path = require('path');
const { readJsonFile, writeJsonFile } = require('./jsonStore');
const { sortByLatest } = require('./sortLatest');

const NOTIFICATIONS_PATH = path.join(__dirname, '../config/module_notifications.json');
const MAX_NOTIFICATIONS = 400;

function normalizePhoneTail(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

function readAllNotifications() {
  const list = readJsonFile(NOTIFICATIONS_PATH, []);
  return Array.isArray(list) ? sortByLatest(list, 'notification_id') : [];
}

function writeAllNotifications(list) {
  const trimmed = sortByLatest(Array.isArray(list) ? list : [], 'notification_id').slice(0, MAX_NOTIFICATIONS);
  writeJsonFile(NOTIFICATIONS_PATH, trimmed);
  return trimmed;
}

function buildScopeKey({ module, customerPhone, customerEmail, customerName, supplierId }) {
  if (supplierId) return `sup:${Number(supplierId)}`;
  if (customerPhone || customerEmail || customerName) {
    const tail = normalizePhoneTail(customerPhone);
    const mail = String(customerEmail || '').trim().toLowerCase();
    const nm = String(customerName || '').trim().toLowerCase();
    return `cust:${tail || mail || nm}`;
  }
  const mod = String(module || '').trim().toLowerCase();
  if (mod && mod !== 'all' && mod !== 'overview') {
    return `erp:${mod}`;
  }
  return 'erp:global';
}

function isReadInScope(notif, scopeKey, targetModule) {
  if (!notif) return true;
  if (notif.is_read) return true;
  if (!Array.isArray(notif.read_by)) return false;
  if (scopeKey && notif.read_by.includes(scopeKey)) return true;
  if (targetModule && notif.read_by.includes(`erp:${String(targetModule).toLowerCase()}`)) return true;
  return false;
}

function matchesCustomer(notif, { customerPhone, customerEmail, customerName }) {
  const mods = Array.isArray(notif.target_modules) ? notif.target_modules : [notif.target_module];
  if (!mods.includes('customer')) return false;

  const qTail = normalizePhoneTail(customerPhone);
  const qEmail = String(customerEmail || '').trim().toLowerCase();
  const qName = String(customerName || '').trim().toLowerCase();

  const rTail = normalizePhoneTail(notif.recipient_phone);
  const rEmail = String(notif.recipient_email || '').trim().toLowerCase();
  const rName = String(notif.recipient_name || '').trim().toLowerCase();

  if (qTail && rTail && qTail === rTail) return true;
  if (qEmail && rEmail && qEmail === rEmail) return true;
  if (qName && rName && qName === rName) return true;
  return false;
}

function notify({
  targetModule,
  targetModules,
  sourceModule = 'system',
  senderName = 'Elight System',
  title = 'Module Notification',
  message = '',
  severity = 'info',
  refNo = '',
  actionModule = '',
  actionUrl = '',
  department = '',
  recipientPhone = '',
  recipientEmail = '',
  recipientName = '',
  supplierId = null
} = {}) {
  const rawMods = Array.isArray(targetModules)
    ? targetModules
    : (targetModule ? [targetModule] : []);
  const cleanMods = Array.from(new Set(
    rawMods.map(m => String(m || '').trim().toLowerCase()).filter(Boolean)
  ));

  if (cleanMods.length === 0) return null;

  const entry = {
    notification_id: `NTF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    target_module: cleanMods[0],
    target_modules: cleanMods,
    source_module: String(sourceModule || 'system').trim().toLowerCase(),
    sender_name: String(senderName || 'Elight System').trim(),
    title: String(title || 'Notification').trim(),
    message: String(message || '').trim(),
    severity: ['info', 'success', 'warning', 'danger'].includes(severity) ? severity : 'info',
    ref_no: String(refNo || '').trim(),
    action_module: String(actionModule || cleanMods[0] || '').trim().toLowerCase(),
    action_url: String(actionUrl || '').trim(),
    department: String(department || '').trim().toLowerCase(),
    recipient_phone: String(recipientPhone || '').trim(),
    recipient_email: String(recipientEmail || '').trim(),
    recipient_name: String(recipientName || '').trim(),
    supplier_id: supplierId ? Number(supplierId) : null,
    is_read: false,
    read_by: [],
    created_at: new Date().toISOString()
  };

  const list = readAllNotifications();
  list.unshift(entry);
  writeAllNotifications(list);
  return entry;
}

function canNonAdminAccessErpNotification(n, allowedSet, userDepartment) {
  const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
  const erpMods = mods.filter(m => m !== 'customer' && m !== 'supplier');
  if (erpMods.length === 0) return false;
  if (!allowedSet || allowedSet.size === 0) return false;
  if (!erpMods.some(m => allowedSet.has(m))) return false;

  // For feedback notifications with a specific department tag, isolate non-admins to their own department
  if (mods.includes('feedback') && n.department && n.department !== 'general') {
    const dept = String(n.department).toLowerCase();
    const mappedUserDept = userDepartment === 'driver' ? 'dispatch' : userDepartment;
    const matchDept = allowedSet.has(dept) || (mappedUserDept && (mappedUserDept === dept || mappedUserDept === 'customer_care'));
    if (!matchDept) return false;
  }
  return true;
}

function getNotifications({
  module = 'all',
  allowedModules = null,
  isAdmin = true,
  userDepartment = '',
  customerPhone = '',
  customerEmail = '',
  customerName = '',
  supplierId = null,
  limit = 60
} = {}) {
  const all = readAllNotifications();
  const cleanMod = String(module || 'all').trim().toLowerCase();

  // Customer scope
  if (cleanMod === 'customer' || customerPhone || customerEmail || customerName) {
    const scopeKey = buildScopeKey({ customerPhone, customerEmail, customerName });
    const custNotifs = all
      .filter(n => matchesCustomer(n, { customerPhone, customerEmail, customerName }))
      .map(n => ({ ...n, is_read: isReadInScope(n, scopeKey, 'customer') }));
    return {
      notifications: custNotifs.slice(0, limit),
      unread_count: custNotifs.filter(n => !n.is_read).length,
      counts_by_module: { customer: custNotifs.filter(n => !n.is_read).length }
    };
  }

  // Supplier scope
  if (cleanMod === 'supplier' || supplierId) {
    const scopeKey = buildScopeKey({ supplierId });
    const supNotifs = all
      .filter(n => {
        const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
        return mods.includes('supplier') && Number(n.supplier_id) === Number(supplierId);
      })
      .map(n => ({ ...n, is_read: isReadInScope(n, scopeKey, 'supplier') }));
    return {
      notifications: supNotifs.slice(0, limit),
      unread_count: supNotifs.filter(n => !n.is_read).length,
      counts_by_module: { supplier: supNotifs.filter(n => !n.is_read).length }
    };
  }

  // ERP staff modules scope
  const allowedSet = Array.isArray(allowedModules) && allowedModules.length > 0
    ? new Set(allowedModules.map(m => String(m).trim().toLowerCase()))
    : null;

  const erpList = all.filter(n => {
    const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
    const erpMods = mods.filter(m => m !== 'customer' && m !== 'supplier');
    if (erpMods.length === 0) return false;
    if (isAdmin) {
      return !allowedSet || erpMods.some(m => allowedSet.has(m));
    }
    return canNonAdminAccessErpNotification(n, allowedSet, userDepartment);
  });

  const countsByModule = {};
  for (const n of erpList) {
    const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
    for (const m of mods) {
      if (m === 'customer' || m === 'supplier') continue;
      if (allowedSet && !allowedSet.has(m)) continue;
      if (!isReadInScope(n, `erp:${m}`, m)) {
        countsByModule[m] = (countsByModule[m] || 0) + 1;
      }
    }
  }

  const filtered = (cleanMod === 'all' || (isAdmin && cleanMod === 'overview') || !cleanMod)
    ? erpList
    : erpList.filter(n => {
        const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
        return mods.includes(cleanMod);
      });

  const scopeKey = buildScopeKey({ module: cleanMod });
  const mapped = filtered.map(n => {
    const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
    const visibleMods = allowedSet ? mods.filter(m => allowedSet.has(m)) : mods;
    const preferredMod = (visibleMods.includes(n.action_module) ? n.action_module : visibleMods[0]) || n.action_module || '';
    return {
      ...n,
      action_module: preferredMod,
      is_read: cleanMod === 'all' || cleanMod === 'overview'
        ? Boolean(n.is_read || (visibleMods.length > 0 && visibleMods.every(m => isReadInScope(n, `erp:${m}`, m))))
        : isReadInScope(n, scopeKey, cleanMod)
    };
  });

  const uniqueUnreadIds = new Set();
  for (const n of erpList) {
    const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
    const erpMods = mods.filter(m => m !== 'customer' && m !== 'supplier' && (!allowedSet || allowedSet.has(m)));
    const anyUnread = erpMods.some(m => !isReadInScope(n, `erp:${m}`, m));
    if (anyUnread) uniqueUnreadIds.add(n.notification_id);
  }

  return {
    notifications: mapped.slice(0, limit),
    unread_count: uniqueUnreadIds.size,
    module_unread_count: mapped.filter(n => !n.is_read).length,
    counts_by_module: countsByModule
  };
}

function markNotificationRead(notificationId, options = {}) {
  const list = readAllNotifications();
  const target = list.find(n => String(n.notification_id) === String(notificationId));
  if (!target) return null;

  const mods = Array.isArray(target.target_modules) ? target.target_modules : [target.target_module];
  if (options.isAdmin === false && Array.isArray(options.allowedModules)) {
    const allowedSet = new Set(options.allowedModules.map(m => String(m).trim().toLowerCase()));
    if (!canNonAdminAccessErpNotification(target, allowedSet, options.userDepartment || '')) {
      return false;
    }
  }

  const cleanMod = String(options.module || '').trim().toLowerCase();
  const scopeKey = buildScopeKey(options);
  if (!Array.isArray(target.read_by)) target.read_by = [];
  if (scopeKey && !target.read_by.includes(scopeKey)) {
    target.read_by.push(scopeKey);
  }

  // Also mark global is_read when viewed from its primary target module or explicit clear
  if (!cleanMod || cleanMod === 'all' || cleanMod === 'overview' || mods.includes(cleanMod)) {
    target.is_read = true;
    for (const m of mods) {
      const k = `erp:${m}`;
      if (!target.read_by.includes(k)) target.read_by.push(k);
    }
  }

  writeAllNotifications(list);
  return target;
}

function markAllRead({
  module = 'all',
  allowedModules = null,
  isAdmin = true,
  userDepartment = '',
  customerPhone = '',
  customerEmail = '',
  customerName = '',
  supplierId = null
} = {}) {
  const list = readAllNotifications();
  const cleanMod = String(module || 'all').trim().toLowerCase();
  const scopeKey = buildScopeKey({ module: cleanMod, customerPhone, customerEmail, customerName, supplierId });
  const allowedSet = Array.isArray(allowedModules) && allowedModules.length > 0
    ? new Set(allowedModules.map(m => String(m).trim().toLowerCase()))
    : null;
  let updated = 0;

  for (const n of list) {
    const mods = Array.isArray(n.target_modules) ? n.target_modules : [n.target_module];
    let hit = false;

    if (cleanMod === 'customer' || customerPhone || customerEmail || customerName) {
      hit = matchesCustomer(n, { customerPhone, customerEmail, customerName });
    } else if (cleanMod === 'supplier' || supplierId) {
      hit = mods.includes('supplier') && Number(n.supplier_id) === Number(supplierId);
    } else if (!isAdmin) {
      hit = canNonAdminAccessErpNotification(n, allowedSet, userDepartment) &&
        (cleanMod === 'all' ? true : mods.includes(cleanMod));
    } else if (cleanMod === 'all' || cleanMod === 'overview') {
      hit = mods.some(m => m !== 'customer' && m !== 'supplier' && (!allowedSet || allowedSet.has(m)));
    } else {
      hit = mods.includes(cleanMod);
    }

    if (hit) {
      if (!Array.isArray(n.read_by)) n.read_by = [];
      if (scopeKey && !n.read_by.includes(scopeKey)) n.read_by.push(scopeKey);
      if (cleanMod === 'all' || cleanMod === 'overview' || mods.includes(cleanMod)) {
        n.is_read = true;
        for (const m of mods) {
          if (isAdmin || (allowedSet && allowedSet.has(m))) {
            const k = `erp:${m}`;
            if (!n.read_by.includes(k)) n.read_by.push(k);
          }
        }
      }
      updated += 1;
    }
  }

  if (updated > 0) writeAllNotifications(list);
  return updated;
}

module.exports = {
  notify,
  getNotifications,
  markNotificationRead,
  markAllRead,
  NOTIFICATIONS_PATH
};
