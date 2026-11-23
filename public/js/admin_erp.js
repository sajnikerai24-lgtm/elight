/**
 * Elight Electrical Shop - Unified ERP Suite (9 Modules)
 */

let allUsers = [];
let allCustomers = [];
let allInventory = [];
let allSystemActivities = [];
let liveRolePermissions = null;

function formatKES(val) {
  return 'KES ' + Number(val || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function isMpesaMethodClient(method) {
  return /m-pesa|mpesa|paybill|till|buy\s*goods|send\s*money|split/i.test(String(method || ''));
}

function isBankMethodClient(method) {
  return /bank|eft|wire|rtgs/i.test(String(method || ''));
}

function applyPaymentRefInputRules(inputOrId, method, labelOrId = null, customLabels = {}) {
  const input = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
  const label = labelOrId
    ? (typeof labelOrId === 'string' ? document.getElementById(labelOrId) : labelOrId)
    : null;
  if (!input) return;

  if (isMpesaMethodClient(method)) {
    input.maxLength = 10;
    input.inputMode = 'text';
    input.setAttribute('pattern', '[A-Za-z0-9]{1,10}');
    input.style.textTransform = 'uppercase';
    input.placeholder = 'e.g. SLK884290Q';
    input.oninput = () => {
      input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
    };
    input.value = String(input.value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
    if (label && customLabels.mpesa) label.textContent = customLabels.mpesa;
  } else if (isBankMethodClient(method)) {
    input.maxLength = 12;
    input.inputMode = 'numeric';
    input.setAttribute('pattern', '[0-9]{1,12}');
    input.style.textTransform = 'none';
    input.placeholder = 'e.g. 123456789012 (max 12 digits)';
    input.oninput = () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 12);
    };
    input.value = String(input.value || '').replace(/[^0-9]/g, '').slice(0, 12);
    if (label && customLabels.bank) label.textContent = customLabels.bank;
  } else {
    input.maxLength = 40;
    input.inputMode = 'text';
    input.removeAttribute('pattern');
    input.style.textTransform = 'none';
    input.placeholder = 'Optional receipt / cheque reference';
    input.oninput = null;
    if (label && customLabels.cash) label.textContent = customLabels.cash;
  }
}

function validatePaymentRefClient(method, rawRef, { required = false, label = 'Transaction reference' } = {}) {
  const val = String(rawRef === undefined || rawRef === null ? '' : rawRef).trim();
  if (!val) {
    if (required) return { valid: false, value: '', message: `${label} is required.` };
    return { valid: true, value: '' };
  }
  if (isMpesaMethodClient(method)) {
    const upper = val.toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(upper)) {
      return {
        valid: false,
        value: upper,
        message: 'M-Pesa reference must be up to 10 alphanumeric characters (letters & numbers only, e.g. SLK884290Q).'
      };
    }
    return { valid: true, value: upper };
  }
  if (isBankMethodClient(method)) {
    if (!/^[0-9]{1,12}$/.test(val)) {
      return {
        valid: false,
        value: val,
        message: 'Bank reference must contain numbers only (0–9), up to 12 digits max.'
      };
    }
    return { valid: true, value: val };
  }
  return { valid: true, value: val };
}

window.applyPaymentRefInputRules = applyPaymentRefInputRules;
window.validatePaymentRefClient = validatePaymentRefClient;

window.syncFinanceEntryRefRules = function () {
  const method = document.getElementById('fin_payment')?.value || 'M-Pesa';
  applyPaymentRefInputRules('fin_ref', method, 'fin_ref_label', {
    mpesa: 'M-Pesa Reference Code',
    bank: 'Bank Transfer Reference (Max 12 digits)',
    cash: 'Cash Receipt / Voucher Reference'
  });
};

window.syncFinanceBalanceRefRules = function () {
  const method = document.getElementById('fin_balance_method')?.value || 'M-Pesa';
  applyPaymentRefInputRules('fin_balance_ref', method, 'fin_balance_ref_label', {
    mpesa: 'M-Pesa Reference Code *',
    bank: 'Bank Transfer Reference * (Max 12 digits)',
    cash: 'Cash Receipt / Reference Code *'
  });
};

window.syncServicePayRefRules = function () {
  const method = document.getElementById('fin_svc_pay_method')?.value || 'M-Pesa';
  applyPaymentRefInputRules('fin_svc_pay_ref', method, 'fin_svc_pay_ref_label', {
    mpesa: 'M-Pesa Reference # *',
    bank: 'Bank Transfer Reference # * (Max 12 digits)',
    cash: 'Cash Receipt Reference # *'
  });
};

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

// Module Tab Switching (Role-Checked; Admin accesses governance, reports & monitoring; staff access permitted operational modules)
function switchModule(moduleName) {
  if (currentUser) {
    const normRole = normalizeRole(currentUser.role);
    const allowed = getAllowedModulesForRole(normRole);
    if (allowed.length > 0 && !allowed.includes(moduleName)) {
      moduleName = allowed[0];
    }
  }

  // Update sidebar active button & parent category dropdown
  document.querySelectorAll('.erp-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.erp-nav-group').forEach(grp => grp.classList.remove('has-active'));
  const activeBtn = Array.from(document.querySelectorAll('.erp-nav-btn')).find(b => 
    b.getAttribute('onclick')?.includes(`'${moduleName}'`)
  );
  if (activeBtn) {
    activeBtn.classList.add('active');
    const parentGroup = activeBtn.closest('.erp-nav-group');
    document.querySelectorAll('.erp-nav-group').forEach(grp => {
      if (grp === parentGroup) {
        grp.classList.add('has-active', 'open');
      } else {
        grp.classList.remove('open');
      }
    });
  }

  if (typeof toggleMobileSidebar === 'function' && window.innerWidth <= 900) {
    toggleMobileSidebar(false);
  }

  // Update visible section
  currentActiveERPModule = moduleName;
  document.querySelectorAll('.erp-module-section').forEach(sec => sec.classList.remove('active'));
  const targetSec = document.getElementById(`module-${moduleName}`);
  if (targetSec) targetSec.classList.add('active');

  // Manage real-time report auto-refresh timer
  if (moduleName !== 'reports' && typeof reportsAutoRefreshTimer !== 'undefined' && reportsAutoRefreshTimer) {
    clearInterval(reportsAutoRefreshTimer);
    reportsAutoRefreshTimer = null;
  }

  loadERPModuleData(moduleName, false);
}

let currentActiveERPModule = 'overview';
const NON_BG_SYNC_MODULES = new Set(['new_sale', 'settings', 'help', 'about']);

function loadERPModuleData(moduleName, isBackground = false) {
  if (typeof refreshErpModuleNotifications === 'function') {
    refreshErpModuleNotifications(moduleName);
  }
  if (isBackground && NON_BG_SYNC_MODULES.has(moduleName)) return;

  if (moduleName === 'overview') loadOverviewKPIs();
  else if (moduleName === 'admin') loadUsers();
  else if (moduleName === 'suppliers' && typeof loadAdminSuppliers === 'function') loadAdminSuppliers();
  else if (moduleName === 'settings') loadSystemSettings();
  else if (moduleName === 'activity') loadSystemActivities();
  else if (moduleName === 'customers') loadCustomersAndWarranties();
  else if (moduleName === 'services') loadServiceRequests();
  else if (moduleName === 'technicians') loadTechnicianJobs();
  else if (moduleName === 'cashier') loadCashierDesk();
  else if (moduleName === 'new_sale') loadNewSaleModule();
  else if (moduleName === 'finance') loadFinanceRecords();
  else if (moduleName === 'finance_releases') loadFinanceReleases();
  else if (moduleName === 'finance_services') loadFinanceServiceCharges();
  else if (moduleName === 'finance_ledger') loadFinanceRecords();
  else if (moduleName === 'finance_invoices' && typeof loadFinanceInvoicesPage === 'function') loadFinanceInvoicesPage();
  else if (moduleName === 'finance_payments' && typeof loadFinancePaymentsPage === 'function') loadFinancePaymentsPage();
  else if (moduleName === 'dispatch') loadDispatches();
  else if (moduleName === 'driver') loadDriverDeliveries();
  else if (moduleName === 'inventory') loadInventoryAndMovements();
  else if (moduleName === 'inventory_materials') loadInventoryMaterialRequests();
  else if (moduleName === 'inventory_movements') loadInventoryAndMovements();
  else if (moduleName === 'inventory_pos' && typeof loadInventoryPurchaseOrdersPage === 'function') loadInventoryPurchaseOrdersPage();
  else if (moduleName === 'inventory_quotations' && typeof loadInventoryQuotationsPage === 'function') loadInventoryQuotationsPage();
  else if (moduleName === 'inventory_deliveries' && typeof loadInventoryDeliveriesPage === 'function') loadInventoryDeliveriesPage();
  else if (moduleName === 'inventory_invoices' && typeof loadInventoryInvoicesPage === 'function') loadInventoryInvoicesPage();
  else if (moduleName === 'bookings') loadAdminBookings();
  else if (moduleName === 'customer_care') loadCustomerCareDesk();
  else if (moduleName === 'help') loadAdminHelp();
  else if (moduleName === 'about') loadAdminAbout();
  else if (moduleName === 'feedback') loadAdminFeedback();
  else if (moduleName === 'contact') loadAdminContactInquiries();
  else if (moduleName === 'reports') {
    loadRealtimeReports(isBackground);
    if (!isBackground) syncReportsAutoRefresh();
  }
}

function openDepartmentReport(reportKey) {
  switchModule('reports');
  const sel = document.getElementById('reports-domain-select');
  if (sel) {
    sel.value = reportKey;
    if (typeof switchReportSubTab === 'function') {
      switchReportSubTab(reportKey);
    }
  }
}

// ========================================================
// 0. ADMIN CONTROL DASHBOARD
// ========================================================
async function loadOverviewKPIs() {
  try {
    const [finRes, usersRes, invRes, setRes, actRes] = await Promise.all([
      fetch('/api/finance/summary').then(r => r.json()).catch(() => ({})),
      fetch('/api/admin/users').then(r => r.json()).catch(() => ({})),
      fetch('/api/inventory').then(r => r.json()).catch(() => ({})),
      fetch('/api/admin/settings').then(r => r.json()).catch(() => ({})),
      fetch('/api/admin/activities').then(r => r.json()).catch(() => ({}))
    ]);

    if (finRes.success) {
      const revEl = document.getElementById('kpi-revenue');
      if (revEl) revEl.textContent = formatKES(finRes.summary.totalSales);
      if (finRes.balances) {
        updateTreasuryBalancesUI(finRes.balances, 'dash');
      }
    }

    const users = usersRes.users || [];
    allUsers = users;
    const activeUsersCount = users.filter(u => String(u.status || 'active').toLowerCase() === 'active').length;
    const usersKpiEl = document.getElementById('kpi-users-count');
    if (usersKpiEl) usersKpiEl.textContent = `${activeUsersCount} / ${users.length}`;

    const lowThreshold = Number(setRes.settings?.low_stock_threshold || 5);
    if (invRes.success) {
      const lowStockCount = (invRes.products || []).filter(p =>
        Number(p.quantity_in_stock) <= Math.max(Number(p.reorder_level || 0), lowThreshold)
      ).length;
      const lowEl = document.getElementById('kpi-lowstock');
      if (lowEl) lowEl.textContent = lowStockCount;
    }

    const activities = actRes.activities || [];
    allSystemActivities = activities;
    const actKpiEl = document.getElementById('kpi-activities-count');
    if (actKpiEl) actKpiEl.textContent = activities.length;

    const perms = setRes.role_permissions || liveRolePermissions || {};
    if (setRes.role_permissions) liveRolePermissions = setRes.role_permissions;

    // Render Connected Departments & Access Governance Table
    const govBody = document.getElementById('overview-dept-governance-body');
    if (govBody) {
      const deptRows = [
        { dept: '🧾 Cashier & Counter Sales', roles: ['cashier'], mod: 'cashier', report: 'cashier_summary' },
        { dept: '⚡ Field Technician Operations', roles: ['technician'], mod: 'technicians', report: 'staff' },
        { dept: '📦 Inventory & Stock Control', roles: ['inventory_manager'], mod: 'inventory', report: 'inventory' },
        { dept: '📋 Electrical Service Management', roles: ['service_manager'], mod: 'services', report: 'staff' },
        { dept: '💰 Finance & Accounting', roles: ['finance_manager'], mod: 'finance', report: 'profit_loss' },
        { dept: '🚚 Dispatch & Meru Deliveries', roles: ['dispatch_manager', 'driver'], mod: 'dispatch', report: 'sales' },
        { dept: '👤 Customer & Warranty', roles: ['customer'], mod: 'customers', report: 'customers' }
      ];

      govBody.innerHTML = deptRows.map(d => {
        const assignedUsers = users.filter(u =>
          d.roles.includes(normalizeRole(u.role)) && String(u.status || 'active').toLowerCase() === 'active'
        );
        const roleBadges = d.roles.map(r => `<span class="badge-tag" style="background:#e0e7ff; color:#1e3a8a; margin-right:4px;">${escapeHTML(ROLE_LABELS[r] || r)}</span>`).join('');
        const modList = d.roles.includes('customer')
          ? '<span style="font-size:0.8rem; color:#047857; font-weight:600;">Home &amp; /customer Portal</span>'
          : d.roles.flatMap(r => perms[r] || ROLE_ALLOWED_MODULES[r] || [])
              .filter((v, i, a) => a.indexOf(v) === i)
              .map(m => `<span style="display:inline-block; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 6px; font-size:0.75rem; margin:2px;">${escapeHTML(OPERATIONAL_MODULES_LABELS[m] || m)}</span>`)
              .join('') || '<em style="color:#94a3b8; font-size:0.8rem;">No modules enabled</em>';

        return `
          <tr>
            <td><strong>${d.dept}</strong></td>
            <td>${roleBadges}</td>
            <td><strong>${assignedUsers.length}</strong> active</td>
            <td>${modList}</td>
            <td style="white-space:nowrap;">
              <button class="btn-sm" style="background:#1e3a8a; color:#fff; padding:4px 8px; font-size:0.76rem;" onclick="switchModule('${d.mod}')">Open Module</button>
              <button class="btn-sm" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 8px; font-size:0.76rem;" onclick="switchModule('admin')">Users</button>
              <button class="btn-sm" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:4px 8px; font-size:0.76rem;" onclick="openDepartmentReport('${d.report}')">Dept Report</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Render Recent System Activity Preview (Top 8)
    const prevBody = document.getElementById('overview-activity-preview');
    if (prevBody) {
      if (activities.length === 0) {
        prevBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px;">No system activities recorded yet.</td></tr>';
      } else {
        prevBody.innerHTML = activities.slice(0, 8).map(a => `
          <tr>
            <td style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap;">${formatActivityTime(a.timestamp)}</td>
            <td>${renderDeptBadge(a.department)}</td>
            <td><strong>${escapeHTML(a.actor)}</strong></td>
            <td><span style="font-weight:600; color:#0f172a;">${escapeHTML(a.action)}</span></td>
            <td style="font-size:0.83rem; color:#334155;">${escapeHTML(a.details)}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('KPI error:', err);
  }
}

// ========================================================
// 1. USER ACCOUNTS & ROLE MANAGEMENT
// ========================================================
async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    allUsers = data.users || [];
    renderUsersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  const searchVal = (document.getElementById('users-search-input')?.value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('users-role-filter')?.value || 'all';

  const filtered = allUsers.filter(u => {
    const normR = normalizeRole(u.role);
    if (roleFilter !== 'all' && normR !== roleFilter) return false;
    if (!searchVal) return true;
    const hay = `${u.full_name || ''} ${u.username || ''} ${u.email || ''} ${u.phone || ''} ${u.role || ''}`.toLowerCase();
    return hay.includes(searchVal);
  });

  const badgeEl = document.getElementById('users-summary-badge');
  if (badgeEl) {
    const activeTotal = allUsers.filter(u => String(u.status || 'active').toLowerCase() === 'active').length;
    badgeEl.textContent = `Showing ${filtered.length} of ${allUsers.length} accounts (${activeTotal} Active)`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No matching user accounts found.</td></tr>';
    return;
  }

  const roleOptions = [
    { value: 'cashier', label: 'Cashier' },
    { value: 'technician', label: 'Technician' },
    { value: 'inventory_manager', label: 'Inventory Manager' },
    { value: 'service_manager', label: 'Service Manager' },
    { value: 'finance_manager', label: 'Finance Manager' },
    { value: 'dispatch_manager', label: 'Dispatch Manager' },
    { value: 'driver', label: 'Driver' },
    { value: 'admin', label: 'Administrator' },
    { value: 'owner', label: 'Shop Owner' },
    { value: 'customer', label: 'Customer' }
  ];

  tbody.innerHTML = filtered.map(u => {
    const normR = normalizeRole(u.role);
    const statusStr = String(u.status || 'active').toLowerCase();
    const isSuspended = statusStr === 'suspended';
    const roleLabel = ROLE_LABELS[normR] || u.role;
    const roleIcon = ROLE_ICONS[normR] || '👤';

    return `
      <tr>
        <td><strong>#${u.user_id}</strong></td>
        <td>
          <strong>${escapeHTML(u.full_name)}</strong><br>
          <small style="color:var(--text-muted); font-family:monospace;">@${escapeHTML(u.username || (u.email ? u.email.split('@')[0] : 'user'))}</small>
        </td>
        <td>
          <div>${escapeHTML(u.email || 'N/A')}</div>
          <small style="color:var(--text-muted);">${escapeHTML(u.phone || 'No phone')}</small>
        </td>
        <td>
          <span class="badge-tag" style="background:#e0e7ff; color:#1e3a8a; font-weight:700;">
            ${roleIcon} ${escapeHTML(roleLabel)}
          </span>
        </td>
        <td>
          <span class="badge-tag" style="background:${isSuspended ? '#fee2e2' : '#dcfce7'}; color:${isSuspended ? '#b91c1c' : '#15803d'}; font-weight:700;">
            ${isSuspended ? 'Suspended' : 'Active'}
          </span>
        </td>
        <td>
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            <select onchange="updateUserRole(${u.user_id}, this.value)" style="padding:5px 8px; border:1px solid #cbd5e1; border-radius:5px; font-size:0.78rem; background:#fff;">
              <option value="">Assign Role...</option>
              ${roleOptions.map(opt => `<option value="${opt.value}" ${normR === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </select>
            <button type="button" class="btn-sm" style="padding:4px 8px; font-size:0.75rem; background:${isSuspended ? '#dcfce7' : '#fef3c7'}; color:${isSuspended ? '#166534' : '#92400e'}; border:1px solid ${isSuspended ? '#86efac' : '#fde68a'};" onclick="toggleUserStatus(${u.user_id}, '${statusStr}')">
              ${isSuspended ? 'Activate' : 'Suspend'}
            </button>
            <button type="button" class="btn-sm" style="padding:4px 8px; font-size:0.75rem; background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1;" onclick="resetUserPassword(${u.user_id}, '${escapeHTML(u.full_name)}')">
              Reset Key
            </button>
            <button type="button" class="btn-sm" style="padding:4px 8px; font-size:0.75rem; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;" onclick="deleteUserAccount(${u.user_id}, '${escapeHTML(u.full_name)}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleCreateUser(e) {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('user_full_name').value.trim(),
    username: document.getElementById('user_username')?.value.trim() || '',
    email: document.getElementById('user_email').value.trim(),
    role: document.getElementById('user_role').value,
    phone: document.getElementById('user_phone').value.trim(),
    password: document.getElementById('user_password')?.value.trim() || 'elight123',
    actor: currentUser?.full_name || 'Administrator'
  };

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to create user');
    closeModal('user-modal');
    e.target.reset();
    const pwdField = document.getElementById('user_password');
    if (pwdField) pwdField.value = 'elight123';
    showToast(`Account created for ${payload.full_name} (${ROLE_LABELS[payload.role] || payload.role}).`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateUserRole(id, role) {
  if (!role) return;
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, actor: currentUser?.full_name || 'Administrator' })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Role update failed');
    showToast(`Assigned role updated to ${ROLE_LABELS[role] || role}.`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserStatus(id, currentStatus) {
  const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus, actor: currentUser?.full_name || 'Administrator' })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Status update failed');
    showToast(`Account status set to ${nextStatus.toUpperCase()}.`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function resetUserPassword(id, fullName) {
  const newPassword = window.prompt(`Enter new password for ${fullName}:`, 'elight123');
  if (!newPassword || !newPassword.trim()) return;
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword.trim(), actor: currentUser?.full_name || 'Administrator' })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Password reset failed');
    showToast(`Password updated for ${fullName}.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUserAccount(id, fullName) {
  if (!window.confirm(`Remove user account "${fullName}" (#${id}) from the system?`)) return;
  try {
    const actor = encodeURIComponent(currentUser?.full_name || 'Administrator');
    const res = await fetch(`/api/admin/users/${id}?actor=${actor}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete user');
    showToast(`Removed account ${fullName}.`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// SYSTEM SETTINGS & ROLE PERMISSIONS MATRIX
// ========================================================
const OPERATIONAL_MODULES_LABELS = {
  cashier: 'Cashier Module',
  new_sale: 'New Sale',
  finance: 'Finance Manager',
  finance_releases: 'Order Releases & Credit',
  technicians: 'Technician Portal',
  inventory: 'Inventory Manager',
  services: 'Service Manager',
  dispatch: 'Dispatch Manager',
  driver: 'Driver Deliveries',
  customers: 'Customer & Warranty',
  customer_care: 'Customer Care & Follow-Up',
  bookings: 'Booking Module',
  help: 'Help Guide',
  feedback: 'Feedback Module',
  contact: 'Contact Us Module',
  reports: 'Department Reports'
};

const PERMISSION_MATRIX_ROLES = [
  { key: 'cashier', label: '🧾 Cashier' },
  { key: 'technician', label: '⚡ Technician' },
  { key: 'inventory_manager', label: '📦 Inventory Manager' },
  { key: 'service_manager', label: '📋 Service Manager' },
  { key: 'finance_manager', label: '💰 Finance Manager' },
  { key: 'dispatch_manager', label: '🚚 Dispatch Manager' },
  { key: 'driver', label: '🚛 Driver' },
  { key: 'customer_care', label: '📞 Customer Care' }
];

const PERMISSION_MATRIX_MODULES = [
  { key: 'cashier', shortLabel: 'Cashier' },
  { key: 'new_sale', shortLabel: 'New Sale' },
  { key: 'finance', shortLabel: 'Finance' },
  { key: 'finance_releases', shortLabel: 'Releases' },
  { key: 'technicians', shortLabel: 'Technician' },
  { key: 'inventory', shortLabel: 'Inventory' },
  { key: 'services', shortLabel: 'Services' },
  { key: 'dispatch', shortLabel: 'Dispatch' },
  { key: 'driver', shortLabel: 'Driver' },
  { key: 'customers', shortLabel: 'Customers' },
  { key: 'customer_care', shortLabel: 'Customer Care' },
  { key: 'bookings', shortLabel: 'Bookings' },
  { key: 'help', shortLabel: 'Help' },
  { key: 'reports', shortLabel: 'Reports' }
];

async function loadSystemSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load settings');

    const s = data.settings || {};
    liveRolePermissions = data.role_permissions || {};

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    setVal('set_shop_name', s.shop_name || 'Elight Electrical Shop');
    setVal('set_operating_region', s.operating_region || 'Meru County Only');
    setVal('set_official_email', s.official_email || 'elightelectrical@ke.com');
    setVal('set_official_phone', s.official_phone || '+254 700 123 456');
    setVal('set_mpesa_till', s.mpesa_till || '5894210');
    setVal('set_low_stock_threshold', s.low_stock_threshold ?? 5);
    setVal('set_meru_town_fee', s.meru_town_delivery_fee ?? 300);
    setVal('set_meru_subcounty_fee', s.meru_subcounty_delivery_fee ?? 500);

    const regChk = document.getElementById('set_allow_registration');
    if (regChk) regChk.checked = s.allow_customer_registration !== false;
    const suspChk = document.getElementById('set_enforce_suspended');
    if (suspChk) suspChk.checked = s.enforce_suspended_block !== false;

    renderPermissionsMatrix(liveRolePermissions);
  } catch (err) {
    showToast('Error loading settings: ' + err.message, 'error');
  }
}

function renderPermissionsMatrix(perms) {
  const thead = document.getElementById('permissions-matrix-head');
  const tbody = document.getElementById('permissions-matrix-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `
    <tr>
      <th style="min-width:170px;">Staff Role</th>
      ${PERMISSION_MATRIX_MODULES.map(m => `<th style="text-align:center; font-size:0.76rem; padding:8px 6px;">${escapeHTML(m.shortLabel)}</th>`).join('')}
    </tr>
  `;

  tbody.innerHTML = PERMISSION_MATRIX_ROLES.map(r => {
    const allowed = Array.isArray(perms[r.key]) ? perms[r.key] : (ROLE_ALLOWED_MODULES[r.key] || []);
    return `
      <tr>
        <td><strong>${r.label}</strong></td>
        ${PERMISSION_MATRIX_MODULES.map(m => {
          const isChecked = allowed.includes(m.key);
          return `
            <td style="text-align:center;">
              <input type="checkbox"
                class="perm-matrix-chk"
                data-role="${r.key}"
                data-module="${m.key}"
                ${isChecked ? 'checked' : ''}
                style="width:16px; height:16px; cursor:pointer;">
            </td>
          `;
        }).join('')}
      </tr>
    `;
  }).join('');
}

async function saveRolePermissions() {
  const updatedPerms = {};
  PERMISSION_MATRIX_ROLES.forEach(r => { updatedPerms[r.key] = []; });

  document.querySelectorAll('.perm-matrix-chk').forEach(chk => {
    const r = chk.getAttribute('data-role');
    const m = chk.getAttribute('data-module');
    if (chk.checked && r && m) {
      updatedPerms[r].push(m);
    }
  });

  // Ensure every operational role retains at least one module so their portal isn't blank
  Object.keys(updatedPerms).forEach(r => {
    if (updatedPerms[r].length === 0) {
      updatedPerms[r] = [ROLE_DEFAULT_MODULE[r] || 'feedback'];
    }
  });

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role_permissions: updatedPerms,
        actor: currentUser?.full_name || 'Administrator'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save permissions');
    liveRolePermissions = data.role_permissions;
    renderPermissionsMatrix(liveRolePermissions);
    showToast('Role permissions matrix saved and enforced!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveSystemSettings(e) {
  e.preventDefault();
  const settingsPayload = {
    shop_name: document.getElementById('set_shop_name').value.trim(),
    operating_region: document.getElementById('set_operating_region').value.trim(),
    official_email: document.getElementById('set_official_email').value.trim(),
    official_phone: document.getElementById('set_official_phone').value.trim(),
    mpesa_till: document.getElementById('set_mpesa_till').value.trim(),
    low_stock_threshold: Number(document.getElementById('set_low_stock_threshold').value || 5),
    meru_town_delivery_fee: Number(document.getElementById('set_meru_town_fee').value || 300),
    meru_subcounty_delivery_fee: Number(document.getElementById('set_meru_subcounty_fee').value || 500),
    allow_customer_registration: Boolean(document.getElementById('set_allow_registration')?.checked),
    enforce_suspended_block: Boolean(document.getElementById('set_enforce_suspended')?.checked)
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsPayload,
        actor: currentUser?.full_name || 'Administrator'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save system settings');
    showToast('System settings saved successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// SYSTEM ACTIVITIES MONITOR
// ========================================================
function formatActivityTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return escapeHTML(String(ts));
  return d.toLocaleString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderDeptBadge(dept) {
  const palette = {
    'Admin & Security': { bg: '#ede9fe', fg: '#5b21b6' },
    'Cashier & Sales': { bg: '#dcfce7', fg: '#166534' },
    'Inventory': { bg: '#dbeafe', fg: '#1e40af' },
    'Technician & Services': { bg: '#fef3c7', fg: '#92400e' },
    'Dispatch & Delivery': { bg: '#e0f2fe', fg: '#0369a1' },
    'Customer Engagement': { bg: '#f1f5f9', fg: '#334155' }
  };
  const c = palette[dept] || { bg: '#f1f5f9', fg: '#334155' };
  return `<span class="badge-tag" style="background:${c.bg}; color:${c.fg}; font-weight:700; white-space:nowrap;">${escapeHTML(dept || 'System')}</span>`;
}

async function loadSystemActivities() {
  const tbody = document.getElementById('system-activities-tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/admin/activities');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load activities');
    allSystemActivities = data.activities || [];
    renderSystemActivities();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderSystemActivities() {
  const tbody = document.getElementById('system-activities-tbody');
  if (!tbody) return;

  const deptFilter = document.getElementById('activity-dept-filter')?.value || 'all';
  const searchVal = (document.getElementById('activity-search-input')?.value || '').trim().toLowerCase();

  const filtered = allSystemActivities.filter(a => {
    if (deptFilter !== 'all' && a.department !== deptFilter) return false;
    if (!searchVal) return true;
    const hay = `${a.department || ''} ${a.actor || ''} ${a.action || ''} ${a.details || ''}`.toLowerCase();
    return hay.includes(searchVal);
  });

  const countBadge = document.getElementById('activity-count-badge');
  if (countBadge) {
    countBadge.textContent = `Showing ${filtered.length} of ${allSystemActivities.length} monitored events`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No matching system activities found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap;">${formatActivityTime(a.timestamp)}</td>
      <td>${renderDeptBadge(a.department)}</td>
      <td><strong>${escapeHTML(a.actor)}</strong></td>
      <td><strong style="color:#0f172a;">${escapeHTML(a.action)}</strong></td>
      <td style="font-size:0.85rem; color:#334155;">${escapeHTML(a.details)}</td>
    </tr>
  `).join('');
}

// ========================================================
// CUSTOMER MODULE
// ========================================================
async function loadCustomersAndWarranties() {
  const custBody = document.getElementById('customers-table-body');
  const warrBody = document.getElementById('warranties-table-body');

  try {
    const [custRes, warrRes] = await Promise.all([
      fetch('/api/customers').then(r => r.json()),
      fetch('/api/warranties').then(r => r.json())
    ]);

    allCustomers = custRes.customers || [];
    const warranties = warrRes.warranties || [];

    // Populate customer select in warranty modal
    const warrCustSelect = document.getElementById('warr_customer_id');
    if (warrCustSelect) {
      warrCustSelect.innerHTML = allCustomers.map(c => 
        `<option value="${c.customer_id}">${escapeHTML(c.full_name)} (${c.phone})</option>`
      ).join('');
    }

    // Customers Table
    if (allCustomers.length === 0) {
      custBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No customer profiles recorded.</td></tr>';
    } else {
      custBody.innerHTML = allCustomers.map(c => `
        <tr>
          <td><strong>#${c.customer_id}</strong></td>
          <td><strong>${escapeHTML(c.full_name)}</strong></td>
          <td>${escapeHTML(c.phone)}</td>
          <td>${escapeHTML(c.email || 'N/A')}</td>
          <td>${escapeHTML(c.location || 'N/A')}</td>
          <td><small>${escapeHTML(c.notes || '')}</small></td>
        </tr>
      `).join('');
    }

    // Warranties Table
    if (warranties.length === 0) {
      warrBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No warranties issued.</td></tr>';
    } else {
      warrBody.innerHTML = warranties.map(w => `
        <tr>
          <td><strong>#WAR-${w.warranty_id}</strong></td>
          <td>${escapeHTML(w.customers?.full_name || 'Customer #' + w.customer_id)}</td>
          <td><strong>${escapeHTML(w.product_name)}</strong></td>
          <td><code>${escapeHTML(w.serial_no || 'N/A')}</code></td>
          <td>${w.start_date || 'N/A'}</td>
          <td>${w.expiry_date || 'N/A'}</td>
          <td><span class="badge-tag badge-${w.status}">${w.status}</span></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleCreateCustomer(e) {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('cust_name_input').value.trim(),
    phone: document.getElementById('cust_phone_input').value.trim(),
    email: document.getElementById('cust_email_input').value.trim(),
    location: document.getElementById('cust_location_input').value.trim(),
    notes: document.getElementById('cust_notes_input').value.trim()
  };

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Customer creation failed');
    closeModal('customer-modal');
    showToast(`Customer ${payload.full_name} saved.`, 'success');
    loadCustomersAndWarranties();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleCreateWarranty(e) {
  e.preventDefault();
  const payload = {
    customer_id: document.getElementById('warr_customer_id').value,
    product_name: document.getElementById('warr_product').value.trim(),
    serial_no: document.getElementById('warr_serial').value.trim(),
    expiry_date: document.getElementById('warr_expiry').value
  };

  try {
    const res = await fetch('/api/warranties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to issue warranty');
    closeModal('warranty-modal');
    showToast('Warranty issued successfully', 'success');
    loadCustomersAndWarranties();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// SERVICE & TECHNICIAN MODULES
// ========================================================
let allServiceRequestsCached = [];

async function loadServiceRequests() {
  const tbody = document.getElementById('services-table-body');
  try {
    const [servRes, usersRes] = await Promise.all([
      fetch('/api/services').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json())
    ]);

    const requests = servRes.requests || [];
    allServiceRequestsCached = requests;
    const technicians = (usersRes.users || []).filter(u => u.role === 'technician' || u.role === 'service_manager');

    if (requests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No service requests logged.</td></tr>';
      return;
    }

    const currentRole = normalizeRole(currentUser?.role);
    const canManageService = currentRole === 'service_manager' || isAdminRole(currentRole);

    const standardTimeSlots = [
      '08:00 AM - 10:00 AM',
      '10:00 AM - 12:00 PM',
      '12:00 PM - 02:00 PM',
      '02:00 PM - 04:00 PM',
      '04:00 PM - 06:00 PM'
    ];

    tbody.innerHTML = requests.map(s => {
      const techOptions = technicians.map(t => 
        `<option value="${t.user_id}" ${s.assigned_technician_id == t.user_id ? 'selected' : ''}>${t.full_name}</option>`
      ).join('');

      const currentTime = s.assigned_time || 'Pending Service Manager Assignment';
      const isPending = !s.assigned_time || s.assigned_time === 'Pending Service Manager Assignment';

      let timeCellHtml = '';
      if (canManageService) {
        const slotOptions = standardTimeSlots.map(slot => 
          `<option value="${slot}" ${currentTime === slot ? 'selected' : ''}>${slot}</option>`
        ).join('');
        timeCellHtml = `
          <div>
            <div style="font-size:0.85rem; font-weight:700; color:var(--text); margin-bottom:4px;">📅 ${escapeHTML(s.scheduled_date || 'TBD')}</div>
            <select onchange="assignTimeToService(${s.request_id}, this.value)" style="padding:4px 6px; border-radius:4px; font-size:0.78rem; font-weight:600; border:1px solid ${isPending ? '#f59e0b' : '#10b981'}; background:${isPending ? '#fffbeb' : '#f0fdf4'}; color:${isPending ? '#b45309' : '#047857'};">
              <option value="">${isPending ? '⚠️ Assign Time Window...' : '-- Change Time --'}</option>
              ${slotOptions}
            </select>
            ${isPending ? '<div style="font-size:0.7rem; color:#d97706; margin-top:2px; font-weight:600;">⚠️ Pending Service Manager</div>' : `<div style="font-size:0.7rem; color:#059669; margin-top:2px; font-weight:700;">✓ Confirmed: ${escapeHTML(currentTime)}</div>`}
          </div>
        `;
      } else {
        timeCellHtml = `
          <div>
            <div style="font-size:0.85rem; font-weight:700;">📅 ${escapeHTML(s.scheduled_date || 'TBD')}</div>
            <div style="margin-top:3px;">
              ${isPending 
                ? '<span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:0.75rem; background:#fef3c7; color:#92400e; font-weight:600;">🕒 Time Pending Service Manager</span>'
                : `<span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:0.75rem; background:#dcfce7; color:#166534; font-weight:700;">⏰ ${escapeHTML(currentTime)}</span>`}
            </div>
          </div>
        `;
      }

      const techCellHtml = canManageService ? `
        <select onchange="assignTechToService(${s.request_id}, this)" style="padding:4px 6px; border-radius:4px; font-size:0.8rem;">
          <option value="">Assign Tech...</option>
          ${techOptions}
        </select>
        <div style="font-size:0.75rem; color:#0369a1; margin-top:2px;">${escapeHTML(s.technician_name || 'Unassigned')}</div>
      ` : `
        <div style="font-size:0.85rem; font-weight:600; color:#0369a1;">${escapeHTML(s.technician_name || 'Unassigned')}</div>
      `;

      return `
        <tr>
          <td><strong>#SR-${s.request_id}</strong></td>
          <td>
            <strong>${escapeHTML(s.customer_name)}</strong><br>
            <small style="color:var(--text-muted);">${escapeHTML(s.phone)}</small>
          </td>
          <td>${escapeHTML(s.location)}</td>
          <td>
            <span class="badge-tag" style="background:#f1f5f9; color:var(--primary); font-weight:600;">${escapeHTML(s.service_type)}</span>
            ${(String(s.booking_ref || '').startsWith('INS-') || String(s.booking_ref || '').startsWith('SCH-'))
              ? (s.site_ready_for_installation ? '<div style="font-size:0.72rem; color:#15803d; font-weight:700; margin-top:3px;">🟢 Product On Site</div>' : '<div style="font-size:0.72rem; color:#b45309; font-weight:600; margin-top:3px;">⏳ Waiting for Delivery</div>')
              : '<div style="font-size:0.72rem; color:#0369a1; font-weight:600; margin-top:3px;">🛠️ Standard Field Service</div>'}
            ${Number(s.service_fee || 0) > 0 ? `<div style="font-size:0.74rem; color:#087443; font-weight:700; margin-top:2px;">Fee: ${formatKES(s.service_fee)} (${s.payment_status === 'paid' ? 'Paid' : (s.billing_status === 'pending_payment' ? 'Billed' : 'Est.')})</div>` : ''}
            ${s.description ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${escapeHTML(s.description)}</div>` : ''}
          </td>
          <td>${timeCellHtml}</td>
          <td>${techCellHtml}</td>
          <td>
            <span class="badge-tag badge-${s.status}">${escapeHTML(String(s.status || '').replace(/_/g, ' '))}</span>
            ${s.status === 'returned_for_rework' && s.return_reason ? `<div style="font-size:0.72rem; color:#b45309; margin-top:3px;">↩️ ${escapeHTML(s.return_reason)}</div>` : ''}
          </td>
          <td>
            ${s.status === 'awaiting_inspection' ? `
              <button type="button" class="btn-sm" style="background:#047857; color:#fff; font-weight:700; padding:4px 8px; font-size:0.75rem; margin-bottom:4px; display:block;" onclick="openServiceApprovalModal(${s.request_id})">
                ⭐ Review Report
              </button>
            ` : ''}
            <select onchange="updateServiceReqStatus(${s.request_id}, this.value)" style="padding:4px 6px; border-radius:4px; font-size:0.8rem;">
              <option value="">Update...</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="returned_for_rework">Returned for Work</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">${err.message}</td></tr>`;
  }
}

async function assignTimeToService(requestId, timeSlot) {
  if (!timeSlot) return;
  try {
    const role = normalizeRole(currentUser?.role);
    const res = await fetch(`/api/services/${requestId}/time`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': role
      },
      body: JSON.stringify({
        assigned_time: timeSlot,
        user_role: role,
        actor: currentUser?.full_name || 'Service Manager'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to assign service arrival time');
    showToast(`Arrival time "${timeSlot}" assigned to task #SR-${requestId}`, 'success');
    loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
    loadServiceRequests();
  }
}

async function handleCreateServiceRequest(e) {
  e.preventDefault();
  const payload = {
    customer_name: document.getElementById('serv_cust_name').value.trim(),
    customer_email: document.getElementById('serv_cust_email')?.value.trim() || null,
    phone: document.getElementById('serv_phone').value.trim(),
    location: document.getElementById('serv_location').value.trim(),
    service_type: document.getElementById('serv_type').value,
    description: document.getElementById('serv_desc').value.trim(),
    scheduled_date: document.getElementById('serv_date').value,
    preferred_time: document.getElementById('serv_time_slot')?.value || 'Pending Service Manager Assignment',
    service_fee: Number(document.getElementById('serv_fee')?.value || 0)
  };

  try {
    const res = await fetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Service request creation failed');
    closeModal('service-modal');
    showToast('Service request created', 'success');
    loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function assignTechToService(requestId, selectEl) {
  const techId = selectEl.value;
  const techName = selectEl.selectedOptions[0]?.text;
  if (!techId) return;

  try {
    const res = await fetch(`/api/services/${requestId}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ technician_id: techId, technician_name: techName })
    });
    if (!res.ok) throw new Error('Technician assignment failed');
    showToast(`Assigned ${techName} to task #SR-${requestId}`, 'success');
    loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateServiceReqStatus(requestId, status) {
  if (!status) return;
  try {
    const res = await fetch(`/api/services/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Status update failed');
    showToast(`Service request #SR-${requestId} status: ${status}`, 'success');
    loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Technician Job Sheet View
let allTechnicianJobsCached = [];

async function loadTechnicianJobs() {
  const container = document.getElementById('technician-jobs-list');
  try {
    const isTechRole = normalizeRole(currentUser?.role) === 'technician';
    let url = '/api/services';
    if (isTechRole && currentUser) {
      const qParams = new URLSearchParams();
      if (currentUser.full_name) qParams.set('technician', currentUser.full_name);
      else if (currentUser.username) qParams.set('technician', currentUser.username);
      if (currentUser.user_id || currentUser.id) qParams.set('technician_id', currentUser.user_id || currentUser.id);
      url += `?${qParams.toString()}`;
    }

    const [servRes, mrRes] = await Promise.all([
      fetch(url).then(r => r.json()),
      fetch('/api/inventory/material-requests').then(r => r.json()).catch(() => ({ material_requests: [] }))
    ]);
    let jobs = servRes.requests || [];
    const allMRs = mrRes.material_requests || [];

    // Strictly enforce that a Technician only sees jobs assigned to them
    if (isTechRole && currentUser) {
      const myNameLower = String(currentUser.full_name || currentUser.username || '').toLowerCase();
      const myId = currentUser.user_id || currentUser.id;
      jobs = jobs.filter(j => {
        const assignedName = String(j.assigned_technician_name || j.technician_name || '').toLowerCase();
        const matchName = myNameLower && (assignedName.includes(myNameLower) || myNameLower.includes(assignedName));
        const matchId = myId && Number(j.assigned_technician_id) === Number(myId);
        return matchName || matchId;
      });
    }
    allTechnicianJobsCached = jobs;

    if (jobs.length === 0) {
      const techName = currentUser?.full_name || 'Technician';
      container.innerHTML = `<p style="color:var(--text-muted); padding:16px;">No field service tasks currently assigned to you (${escapeHTML(techName)}). All tasks assigned by the Service Manager will appear here.</p>`;
      return;
    }

    container.innerHTML = jobs.map(j => {
      const needsProductDeliveryGate = String(j.booking_ref || '').startsWith('INS-') || String(j.booking_ref || '').startsWith('SCH-');
      const isSiteReady = !needsProductDeliveryGate || j.site_ready_for_installation === true || j.fulfillment_mode === 'collection';
      const jobMRs = allMRs.filter(m => Number(m.service_request_id) === Number(j.request_id));
      const mrHtml = jobMRs.length === 0
        ? '<div style="font-size:0.78rem; color:#64748b; margin-top:4px;">No material requests submitted yet.</div>'
        : jobMRs.map(mr => {
            const itemsTxt = (mr.items || []).map(it =>
              `${it.requested_qty}x ${it.product_name}${mr.status === 'partially_approved' || mr.status === 'issued' ? ` (Approved: ${it.approved_qty})` : ''}`
            ).join(', ');
            const statusColor = mr.status === 'issued'
              ? 'background:#dcfce7; color:#15803d;'
              : (mr.status === 'rejected'
                ? 'background:#fee2e2; color:#b91c1c;'
                : (mr.status === 'approved' || mr.status === 'partially_approved'
                  ? 'background:#dbeafe; color:#1d4ed8;'
                  : 'background:#fef3c7; color:#b45309;'));
            return `
              <div style="font-size:0.78rem; background:#fff; border:1px solid #e2e8f0; border-radius:4px; padding:6px 8px; margin-top:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                  <strong>${escapeHTML(mr.request_number)}</strong>
                  <span class="badge-tag" style="${statusColor} font-size:0.7rem;">${escapeHTML(String(mr.status).replace(/_/g, ' ').toUpperCase())}</span>
                </div>
                <div style="color:#334155; margin-top:2px;">${escapeHTML(itemsTxt)}</div>
                ${mr.review_notes ? `<div style="color:#64748b; font-style:italic; margin-top:2px;">Inventory Note: ${escapeHTML(mr.review_notes)}</div>` : ''}
              </div>
            `;
          }).join('');

      let techActionHtml = '';
      const requestMatBtn = `<button type="button" class="btn-sm" style="background:#e0e7ff; color:#1e3a8a; font-weight:700;" onclick="openTechMaterialRequestModal(${j.request_id})">🧱 Request Materials</button>`;

      if (!isSiteReady && j.status !== 'completed' && j.status !== 'awaiting_inspection') {
        techActionHtml = `
          <div style="font-size:0.8rem; background:#fee2e2; color:#b91c1c; padding:8px 10px; border-radius:4px; font-weight:700; border:1px solid #fecaca; margin-top:8px;">
            ⏳ Site Gate: Product has not yet been delivered or collected. Work cannot start until product is available on site.
          </div>
        `;
      } else if (j.status === 'in_progress' || j.status === 'returned_for_rework') {
        techActionHtml = `
          <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            ${requestMatBtn}
            <button type="button" class="btn-sm" style="background:#047857; color:#fff; font-weight:700;" onclick="openTechCompletionModal(${j.request_id})">📝 Submit Completion Report</button>
          </div>
        `;
      } else if (j.status === 'awaiting_inspection') {
        techActionHtml = `
          <div style="font-size:0.82rem; background:#fef3c7; color:#b45309; padding:8px 10px; border-radius:4px; font-weight:700; border:1px solid #fde68a; margin-top:8px;">
            ⭐ Completion Report Submitted — Awaiting Service Manager Review
          </div>
        `;
      } else if (j.status === 'completed') {
        techActionHtml = `
          <div style="font-size:0.82rem; background:#dcfce7; color:#15803d; padding:8px 10px; border-radius:4px; font-weight:700; border:1px solid #86efac; margin-top:8px;">
            ✅ Completion Approved by Service Manager${Number(j.service_fee || 0) > 0 ? ` • Fee: ${formatKES(j.service_fee)} (${j.payment_status === 'paid' ? 'Paid' : 'Pending Payment'})` : ''}
          </div>
        `;
      } else {
        techActionHtml = `
          <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            ${requestMatBtn}
            <button type="button" class="btn-sm" style="background:#0284c7; color:#fff; font-weight:700;" onclick="startTechnicianJob(${j.request_id})">🔧 Start Work</button>
          </div>
        `;
      }

      return `
        <div class="metric-card" style="border-top: 4px solid ${j.status === 'completed' ? '#087443' : (j.status === 'returned_for_rework' ? '#dc2626' : (j.status === 'awaiting_inspection' ? '#d97706' : '#2563eb'))};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-weight:700; color:var(--primary);">#SR-${j.request_id}</span>
            <div style="display:flex; gap:4px; align-items:center;">
              ${isSiteReady ? '<span class="badge-tag" style="background:#dcfce7; color:#15803d; font-size:0.72rem; font-weight:700;">🟢 Ready</span>' : '<span class="badge-tag" style="background:#fee2e2; color:#b91c1c; font-size:0.72rem; font-weight:700;">⏳ In Transit</span>'}
              <span class="badge-tag badge-${j.status}">${escapeHTML(String(j.status || '').replace(/_/g, ' '))}</span>
            </div>
          </div>
          <h4 style="color:var(--primary); font-size:1.05rem; margin-bottom:4px;">${escapeHTML(j.service_type)}</h4>
          ${j.status === 'returned_for_rework' && j.return_reason ? `
            <div style="font-size:0.8rem; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:7px 10px; border-radius:4px; margin-bottom:8px; font-weight:600;">
              ↩️ Returned by Service Manager: ${escapeHTML(j.return_reason)}
            </div>
          ` : ''}
          <div style="display:flex; gap:14px; font-size:0.83rem; margin-bottom:8px; flex-wrap:wrap; background:#f1f5f9; padding:6px 10px; border-radius:4px;">
            <div>📅 <strong>Date:</strong> ${escapeHTML(j.scheduled_date || 'TBD')}</div>
            <div>⏰ <strong>Arrival Time:</strong> <span style="color:${j.assigned_time && !j.assigned_time.includes('Pending') ? '#047857' : '#b45309'}; font-weight:700;">${escapeHTML(j.assigned_time || 'Pending Service Manager Assignment')}</span></div>
          </div>
          <p style="font-size:0.85rem; color:#4b5563; margin-bottom:8px;">
            📍 <strong>${escapeHTML(j.location)}</strong><br>
            👤 <strong>Customer:</strong> ${escapeHTML(j.customer_name)} (${escapeHTML(j.phone)})
          </p>
          <p style="font-size:0.85rem; background:#f8fafc; padding:8px; border-radius:4px; margin-bottom:10px;">
            ${escapeHTML(j.description || 'No special notes')}
          </p>
          <div style="margin-bottom:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px;">
            <label style="font-size:0.74rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block;">Material Requests (Inventory Control):</label>
            ${mrHtml}
          </div>
          <div style="margin-bottom:8px;">
            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">Materials Used:</label>
            <input type="text" id="mat-${j.request_id}" value="${escapeHTML(j.materials_used || '')}" placeholder="Auto-filled on material issue or type notes..." style="width:100%; padding:6px; font-size:0.85rem; border:1px solid var(--border); border-radius:4px;">
          </div>
          ${techActionHtml}
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:red;">${err.message}</p>`;
  }
}

async function openTechMaterialRequestModal(requestId) {
  const job = allTechnicianJobsCached.find(j => Number(j.request_id) === Number(requestId))
    || allServiceRequestsCached.find(j => Number(j.request_id) === Number(requestId));

  document.getElementById('mr_service_request_id').value = requestId;
  document.getElementById('mr_notes').value = '';
  const summaryEl = document.getElementById('mr-job-summary');
  if (summaryEl) {
    summaryEl.textContent = job
      ? `Service #SR-${requestId}: ${job.service_type} — ${job.customer_name} (${job.location})`
      : `Service Job #SR-${requestId}`;
  }

  if (!Array.isArray(allInventory) || allInventory.length === 0) {
    try {
      const invRes = await fetch('/api/inventory').then(r => r.json());
      allInventory = invRes.products || [];
    } catch (e) {}
  }

  const rowsEl = document.getElementById('mr-items-rows');
  rowsEl.innerHTML = '';
  addTechMaterialRow();
  openModal('tech-material-request-modal');
}

function addTechMaterialRow() {
  const rowsEl = document.getElementById('mr-items-rows');
  if (!rowsEl) return;
  const opts = (allInventory || []).map(p =>
    `<option value="${p.product_id}">${escapeHTML(p.product_name)} (Stock: ${Number(p.quantity_in_stock || 0)})</option>`
  ).join('');
  const row = document.createElement('div');
  row.className = 'mr-item-row';
  row.style.cssText = 'display:grid; grid-template-columns:1fr 90px 36px; gap:8px; align-items:center;';
  row.innerHTML = `
    <select class="mr-prod-select" style="padding:7px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.84rem;" required>
      <option value="">-- Select Material / Product --</option>
      ${opts}
    </select>
    <input type="number" class="mr-qty-input" min="1" value="1" required style="padding:7px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.84rem;">
    <button type="button" class="btn-sm" style="background:#fee2e2; color:#b91c1c; padding:6px 8px;" onclick="this.closest('.mr-item-row').remove()">&times;</button>
  `;
  rowsEl.appendChild(row);
}

async function handleTechMaterialRequestSubmit(e) {
  e.preventDefault();
  const requestId = Number(document.getElementById('mr_service_request_id').value);
  const notes = document.getElementById('mr_notes')?.value.trim() || '';
  const rows = Array.from(document.querySelectorAll('#mr-items-rows .mr-item-row'));
  const items = [];
  for (const r of rows) {
    const pid = Number(r.querySelector('.mr-prod-select')?.value || 0);
    const qty = Math.max(0, parseInt(r.querySelector('.mr-qty-input')?.value || 0, 10) || 0);
    if (pid && qty > 0) items.push({ product_id: pid, quantity: qty });
  }
  if (items.length === 0) {
    showToast('Select at least one material and quantity.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/services/${requestId}/material-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        technician_id: currentUser?.user_id || currentUser?.id || null,
        technician_name: currentUser?.full_name || currentUser?.username || 'Field Technician',
        items,
        notes
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Material request failed');
    closeModal('tech-material-request-modal');
    showToast(data.message || 'Material request sent to Inventory Manager!', 'success');
    loadTechnicianJobs();
    if (typeof loadInventoryMaterialRequests === 'function') loadInventoryMaterialRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function startTechnicianJob(requestId) {
  try {
    const res = await fetch(`/api/services/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'in_progress',
        actor: currentUser?.full_name || 'Field Technician',
        skipAutoStockDeduct: true
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Cannot start job');
    showToast(`Task #SR-${requestId} marked in progress`, 'success');
    loadTechnicianJobs();
    if (typeof loadServiceRequests === 'function') loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openTechCompletionModal(requestId) {
  const job = allTechnicianJobsCached.find(j => Number(j.request_id) === Number(requestId))
    || allServiceRequestsCached.find(j => Number(j.request_id) === Number(requestId));
  document.getElementById('comp_service_request_id').value = requestId;
  document.getElementById('comp_notes').value = job?.completion_notes || '';
  const liveMatInput = document.getElementById(`mat-${requestId}`)?.value.trim();
  document.getElementById('comp_materials_used').value = liveMatInput || job?.materials_used || '';
  const sumEl = document.getElementById('comp-job-summary');
  if (sumEl) {
    sumEl.innerHTML = job
      ? `<strong>#SR-${requestId}: ${escapeHTML(job.service_type)}</strong><br><small>Customer: ${escapeHTML(job.customer_name)} • Location: ${escapeHTML(job.location)}</small>`
      : `<strong>#SR-${requestId}</strong>`;
  }
  openModal('tech-completion-modal');
}

async function handleTechCompletionSubmit(e) {
  e.preventDefault();
  const requestId = Number(document.getElementById('comp_service_request_id').value);
  const completionNotes = document.getElementById('comp_notes').value.trim();
  const materialsUsed = document.getElementById('comp_materials_used').value.trim();

  try {
    const res = await fetch(`/api/services/${requestId}/completion-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        completion_notes: completionNotes,
        materials_used: materialsUsed || undefined,
        actor: currentUser?.full_name || 'Field Technician'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed submitting completion report');
    closeModal('tech-completion-modal');
    showToast(data.message || `Completion report #SR-${requestId} submitted!`, 'success');
    loadTechnicianJobs();
    if (typeof loadServiceRequests === 'function') loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function submitTechInspection(requestId) {
  openTechCompletionModal(requestId);
}

function openServiceApprovalModal(requestId) {
  const req = allServiceRequestsCached.find(r => Number(r.request_id) === Number(requestId));
  const idInput = document.getElementById('service_approval_request_id');
  if (idInput) idInput.value = requestId;
  const feeInput = document.getElementById('service_approval_fee');
  if (feeInput) feeInput.value = Number(req?.service_fee || 800) > 0 ? Number(req.service_fee || 800) : 800;
  const notesInput = document.getElementById('service_approval_notes');
  if (notesInput) notesInput.value = '';

  const summaryEl = document.getElementById('service-approval-summary');
  if (summaryEl && req) {
    summaryEl.innerHTML = `
      <div style="font-weight:800; font-size:1rem; color:#0f172a;">Task #SR-${req.request_id}: ${escapeHTML(req.service_type)}</div>
      <div style="font-size:0.85rem; color:#475569; margin-top:4px;">
        👤 Customer: <strong>${escapeHTML(req.customer_name)}</strong> (${escapeHTML(req.phone)})<br>
        📍 Location: <strong>${escapeHTML(req.location)}</strong><br>
        🔧 Assigned Technician: <strong>${escapeHTML(req.technician_name || 'Field Tech')}</strong><br>
        📦 Materials Used: <strong>${escapeHTML(req.materials_used || 'Standard equipment')}</strong><br>
        📝 Tech Completion Report: <strong>${escapeHTML(req.completion_notes || 'Ready for inspection')}</strong>
      </div>
    `;
  }
  openModal('service-approval-modal');
}

async function handleServiceApprovalSubmit(e) {
  e.preventDefault();
  const requestId = document.getElementById('service_approval_request_id').value;
  const notes = document.getElementById('service_approval_notes')?.value.trim() || 'Work quality inspected and approved';
  const serviceFee = Number(document.getElementById('service_approval_fee')?.value || 0);
  const role = normalizeRole(currentUser?.role);

  try {
    const res = await fetch(`/api/services/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Role': role },
      body: JSON.stringify({
        action: 'approve',
        user_role: role,
        service_fee: serviceFee,
        approved_by: currentUser?.full_name || 'Service Manager',
        inspection_notes: notes
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to approve completion');

    closeModal('service-approval-modal');
    showToast(data.message || `Service task #SR-${requestId} approved and billed!`, 'success');
    loadServiceRequests();
    if (typeof loadTechnicianJobs === 'function') loadTechnicianJobs();
    if (typeof loadFinanceServiceCharges === 'function') loadFinanceServiceCharges();
    if (typeof loadCashierOrders === 'function') loadCashierOrders();
    if (typeof loadCustomerCareDesk === 'function') loadCustomerCareDesk();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleServiceReturnForRework() {
  const requestId = document.getElementById('service_approval_request_id').value;
  const reason = document.getElementById('service_approval_notes')?.value.trim();
  if (!reason) {
    showToast('Please enter rework instructions in the notes box before returning the job.', 'error');
    return;
  }
  const role = normalizeRole(currentUser?.role);
  try {
    const res = await fetch(`/api/services/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Role': role },
      body: JSON.stringify({
        action: 'return',
        user_role: role,
        return_reason: reason,
        approved_by: currentUser?.full_name || 'Service Manager'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed returning job');
    closeModal('service-approval-modal');
    showToast(data.message || `Job #SR-${requestId} returned to technician for further work.`, 'success');
    loadServiceRequests();
    if (typeof loadTechnicianJobs === 'function') loadTechnicianJobs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function recordMaterials(requestId) {
  const input = document.getElementById(`mat-${requestId}`);
  if (!input) return;
  const materials = input.value.trim();

  try {
    const res = await fetch(`/api/services/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materials_used: materials, status: 'in_progress' })
    });
    if (!res.ok) throw new Error('Failed to save materials');
    showToast('Materials logged successfully', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// CASHIER MODULE (Customer Orders, Payments, Receipts, Sales & Handoff)
// ========================================================
let cashierOrdersList = [];
let cashierProductsList = [];
let cashierCustomersList = [];
let posCartItems = [];

async function loadCashierDesk() {
  const tbody = document.getElementById('cashier-orders-tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/cashier/orders');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load Cashier orders');

    cashierOrdersList = data.orders || [];
    cashierProductsList = data.products || [];
    cashierCustomersList = data.customers || [];

    const conn = data.connections || {};
    const pendingCount = cashierOrdersList.filter(o => o.payment_status !== 'paid').length;
    const readyHandoffCount = cashierOrdersList.filter(o =>
      o.payment_status === 'paid' &&
      (o.fulfillment_status === 'paid_awaiting_handoff' || o.fulfillment_status === 'ready_for_collection')
    ).length;

    const kpiPending = document.getElementById('cashier-kpi-pending');
    const kpiCustSub = document.getElementById('cashier-kpi-customers-sub');
    const kpiStock = document.getElementById('cashier-kpi-stock');
    const kpiRev = document.getElementById('cashier-kpi-revenue');
    const kpiHandoff = document.getElementById('cashier-kpi-handoff');

    if (kpiPending) kpiPending.textContent = `${pendingCount} Pending`;
    if (kpiCustSub) kpiCustSub.textContent = `${conn.customersCount || 0} registered customers • ${cashierOrdersList.length} orders`;
    if (kpiStock) kpiStock.textContent = `${conn.inStockProductsCount || 0} / ${conn.totalCatalogCount || 0} In Stock`;
    if (kpiRev) kpiRev.textContent = formatKES(conn.financeSyncedRevenue || 0);
    if (kpiHandoff) kpiHandoff.textContent = `${readyHandoffCount} To Release`;

    renderCashierOrdersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderFulfillmentBadge(order) {
  const fType = order.fulfillment_type || (order.fulfillment_mode === 'collection' ? 'product_collection' : 'product_delivery');
  const relStatus = String(order.finance_release_status || '').toLowerCase();
  const balance = Number(order.balance_due || 0);

  let flowTitle = 'Product only';
  let flowPipeline = 'Cashier → Finance → Delivery';
  let flowIcon = '🚚';

  const needsInst = Boolean(
    order.requires_installation ||
    fType === 'product_delivery_install' ||
    fType === 'product_install_later' ||
    (order.installation_status && order.installation_status !== 'not_requested')
  );

  if (fType === 'product_collection') {
    flowTitle = needsInst ? 'Shop collection + installation' : 'Product collected from shop';
    flowPipeline = needsInst
      ? 'Cashier → Finance → Collection | Installation (Independent)'
      : 'Cashier → Finance → Collection';
    flowIcon = needsInst ? '🏬🔧' : '🏬';
  } else if (fType === 'product_delivery_install') {
    flowTitle = 'Product + installation';
    flowPipeline = 'Cashier → Finance → Delivery | Installation (Independent)';
    flowIcon = '🚚🔧';
  } else if (fType === 'product_install_later') {
    flowTitle = 'Product + installation booked later';
    flowPipeline = 'Cashier → Finance → Delivery | Scheduled installation';
    flowIcon = '🚚📅';
  }

  let statusBadge = '';
  if (relStatus === 'pending_credit_review' || balance > 0) {
    statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#fef3c7; color:#b45309; font-weight:700; font-size:0.72rem;">🛡️ Finance Credit Check Required (KES ${balance.toLocaleString()} Due)</span></div>`;
  } else if (relStatus === 'pending_finance') {
    statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#dbeafe; color:#1e40af; font-weight:700; font-size:0.72rem;">⏳ Awaiting Finance Release Gate</span></div>`;
  } else if (relStatus === 'credit_hold') {
    statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#fee2e2; color:#b91c1c; font-weight:700; font-size:0.72rem;">🛑 Credit Hold by Finance</span></div>`;
  } else {
    // Released by Finance: show active fulfillment stage
    const fStatus = String(order.fulfillment_status || '').toLowerCase();
    if (fStatus === 'ready_for_collection') {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#e0e7ff; color:#3730a3; font-weight:700; font-size:0.72rem;">🛍️ Released — Ready for Counter Collection</span></div>`;
    } else if (fStatus === 'collected') {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700; font-size:0.72rem;">✔️ Collected by Customer at Shop</span></div>`;
    } else if (fStatus === 'sent_to_dispatch') {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#e0f2fe; color:#0369a1; font-weight:700; font-size:0.72rem;">🚚 Released — Sent to Dispatch Manager</span></div>`;
    } else if (fStatus === 'out_for_delivery') {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#fef9c3; color:#854d0e; font-weight:700; font-size:0.72rem;">🚗 Out for Meru Delivery</span></div>`;
    } else if (fStatus === 'installation_pending') {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#f3e8ff; color:#6b21a8; font-weight:700; font-size:0.72rem;">🔧 Delivered — Technician Installation Assigned</span></div>`;
    } else if (fStatus === 'scheduled_installation_pending') {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#ede9fe; color:#5b21b6; font-weight:700; font-size:0.72rem;">📅 Delivered — Scheduled Installation Pending</span></div>`;
    } else if (fStatus === 'installed_and_completed' || fStatus === 'delivered') {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700; font-size:0.72rem;">✅ Completed &amp; Handed Over</span></div>`;
    } else {
      statusBadge = `<div style="margin-top:3px;"><span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700; font-size:0.72rem;">✅ Finance Released</span></div>`;
    }
  }

  return `
    <div>
      <div style="font-weight:700; font-size:0.78rem; color:#1e293b; display:flex; align-items:center; gap:4px;">
        <span>${flowIcon}</span> <span>${flowTitle}</span>
      </div>
      <div style="font-size:0.72rem; color:#64748b; margin-top:2px; font-family:system-ui, sans-serif;">
        <code>${flowPipeline}</code>
      </div>
      ${statusBadge}
    </div>
  `;
}

function renderCashierOrdersTable() {
  const tbody = document.getElementById('cashier-orders-tbody');
  if (!tbody) return;

  const filterMode = document.getElementById('cashier-filter-status')?.value || 'all';
  const searchVal = (document.getElementById('cashier-search-input')?.value || '').trim().toLowerCase();

  const filtered = cashierOrdersList.filter(o => {
    if (filterMode === 'pending_payment' && o.payment_status === 'paid') return false;
    if (filterMode === 'awaiting_handoff') {
      if (o.payment_status !== 'paid') return false;
      if (!['paid_awaiting_handoff', 'ready_for_collection'].includes(o.fulfillment_status)) return false;
    }
    if (filterMode === 'dispatched_or_collected') {
      if (o.payment_status !== 'paid') return false;
      if (['paid_awaiting_handoff', 'awaiting_payment'].includes(o.fulfillment_status)) return false;
    }

    if (!searchVal) return true;
    const itemsStr = (o.items || []).map(i => i.product_name).join(' ');
    const hay = `${o.order_no || ''} ${o.receipt_no || ''} ${o.customer_name || ''} ${o.customer_phone || ''} ${o.payment_ref || ''} ${itemsStr}`.toLowerCase();
    return hay.includes(searchVal);
  }).sort((a, b) => {
    const timeB = new Date(b.created_at || b.paid_at || 0).getTime() || 0;
    const timeA = new Date(a.created_at || a.paid_at || 0).getTime() || 0;
    return timeB - timeA;
  });

  const badgeEl = document.getElementById('cashier-orders-badge');
  if (badgeEl) {
    badgeEl.textContent = `Showing ${filtered.length} of ${cashierOrdersList.length} orders`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:22px;">No customer orders match the selected filter.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const isPaid = o.payment_status === 'paid';
    const isReleased = o.finance_release_status === 'released';
    const rawOrderDate = o.created_at || o.paid_at;
    const parsedOrderDate = rawOrderDate ? new Date(rawOrderDate) : null;
    const hasValidDate = parsedOrderDate && !Number.isNaN(parsedOrderDate.getTime());
    const dateLine = hasValidDate
      ? parsedOrderDate.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    const timeLine = hasValidDate
      ? parsedOrderDate.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : '';
    const itemsHtml = (o.items || [])
      .map(i => `<div style="font-size:0.82rem;">• ${escapeHTML(i.product_name)} <strong>×${i.quantity}</strong></div>`)
      .join('');

    const actions = [];
    if (!isPaid && Number(o.amount_paid || 0) === 0) {
      if (Number(o.total_amount || 0) <= 0) {
        actions.push(`
          <button type="button" class="btn-sm" disabled style="background:#e2e8f0; color:#94a3b8; font-weight:700; padding:5px 10px; font-size:0.78rem; cursor:not-allowed;" title="Cannot accept a sale with KSh 0 amount">
            ✅ Confirm Payment
          </button>
          <span style="color:#dc2626; font-size:0.72rem; font-weight:700;">⚠ KSh 0 amount</span>
        `);
      } else {
        actions.push(`
          <button type="button" class="btn-sm" style="background:#087443; color:#fff; font-weight:700; padding:5px 10px; font-size:0.78rem;" onclick="openConfirmPaymentModal('${escapeHTML(o.order_no)}')">
            ✅ Confirm Payment
          </button>
        `);
      }
    } else {
      actions.push(`
        <button type="button" class="btn-sm" style="background:#0f172a; color:#fff; font-weight:700; padding:5px 9px; font-size:0.76rem;" onclick="openCashierReceipt('${escapeHTML(o.order_no)}')">
          🧾 Receipt
        </button>
      `);

      if (!isReleased) {
        if (Number(o.balance_due || 0) > 0) {
          actions.push(`
            <span class="badge-tag" style="background:#fef3c7; color:#b45309; font-weight:700; font-size:0.74rem;">
              🛡️ Passed to Finance (Balance: ${formatKES(o.balance_due)})
            </span>
          `);
        } else {
          actions.push(`
            <span class="badge-tag" style="background:#dbeafe; color:#1e40af; font-weight:700; font-size:0.74rem;">
              ⏳ Passed to Finance Confirmation
            </span>
          `);
        }
      } else {
        const st = String(o.fulfillment_status || '').toLowerCase();
        if (st === 'paid_awaiting_handoff') {
          if (o.fulfillment_type === 'product_collection') {
            actions.push(`
              <button type="button" class="btn-sm" style="background:#dcfce7; color:#166534; border:1px solid #86efac; font-weight:700; padding:5px 9px; font-size:0.76rem;" onclick="markOrderCollection('${escapeHTML(o.order_no)}', 'mark_collected')">
                ✔️ Confirm Collection
              </button>
            `);
          } else {
            actions.push(`
              <button type="button" class="btn-sm" style="background:#1d4ed8; color:#fff; padding:5px 9px; font-size:0.76rem;" onclick="openSendToDispatchModal('${escapeHTML(o.order_no)}')">
                🚚 Send Delivery
              </button>
            `);
          }
        } else if (st === 'ready_for_collection') {
          actions.push(`
            <button type="button" class="btn-sm" style="background:#dcfce7; color:#166534; border:1px solid #86efac; font-weight:700; padding:5px 9px; font-size:0.76rem;" onclick="markOrderCollection('${escapeHTML(o.order_no)}', 'mark_collected')">
              ✔️ Confirm Collection
            </button>
          `);
        }
      }
    }

    // Always provide printable invoice
    actions.push(`
      <button type="button" class="btn-sm" style="background:#0284c7; color:#fff; font-weight:700; padding:5px 9px; font-size:0.76rem;" onclick="openOrderInvoiceModal('${escapeHTML(o.order_no)}')">
        📄 Invoice
      </button>
    `);

    // Allow cancelling active non-completed orders
    if (o.order_status !== 'cancelled' && o.order_status !== 'completed' && o.status !== 'completed') {
      actions.push(`
        <button type="button" class="btn-sm" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:600; padding:4px 7px; font-size:0.74rem;" onclick="handleCancelCashierOrder('${escapeHTML(o.order_no)}')">
          ❌ Cancel
        </button>
      `);
    }

    return `
      <tr>
        <td>
          <strong style="font-family:monospace; color:var(--primary);">${escapeHTML(o.order_no)}</strong><br>
          <small style="color:var(--text-muted);">${o.receipt_no ? `Receipt: <strong>${escapeHTML(o.receipt_no)}</strong>` : escapeHTML(o.source || 'Order')}</small>
        </td>
        <td style="white-space:nowrap;">
          <div style="font-weight:700; color:#0f172a; font-size:0.84rem;">${escapeHTML(dateLine)}</div>
          ${timeLine ? `<small style="color:var(--text-muted);">${escapeHTML(timeLine)}</small>` : ''}
        </td>
        <td>
          <strong>${escapeHTML(o.customer_name)}</strong>
          ${o.customer_phone ? `<br><small style="color:var(--text-muted);">${escapeHTML(o.customer_phone)}</small>` : ''}
          <div style="font-size:0.76rem; color:#475569; margin-top:2px;">📍 ${escapeHTML(o.customer_location || 'Meru County')}</div>
        </td>
        <td>${itemsHtml || '<span style="color:var(--text-muted);"> Shop Order</span>'}</td>
        <td>
          <div style="font-weight:800; color:#0f172a;">${formatKES(o.total_amount)}</div>
          <div style="font-size:0.76rem; color:#475569; margin-top:2px;">
            Paid: <strong>${formatKES(o.amount_paid !== undefined ? o.amount_paid : (isPaid ? o.total_amount : 0))}</strong>
            ${Number(o.balance_due || 0) > 0 ? `<br><span style="color:#b91c1c; font-weight:700;">Due: ${formatKES(o.balance_due)}</span>` : ''}
          </div>
          <span class="badge-tag" style="background:${isPaid ? '#dcfce7' : (Number(o.amount_paid || 0) > 0 ? '#fef3c7' : '#fee2e2')}; color:${isPaid ? '#15803d' : (Number(o.amount_paid || 0) > 0 ? '#b45309' : '#b91c1c')}; font-size:0.72rem; margin-top:3px;">
            ${isPaid ? `PAID (${escapeHTML(o.payment_method)})` : (Number(o.amount_paid || 0) > 0 ? `PARTIAL (${escapeHTML(o.payment_method)})` : `UNPAID (${escapeHTML(o.payment_method)})`)}
          </span>
          ${o.payment_ref ? `<div style="font-size:0.72rem; font-family:monospace; color:#475569; margin-top:2px;">Ref: ${escapeHTML(o.payment_ref)}</div>` : ''}
        </td>
        <td>
          ${renderFulfillmentBadge(o)}
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">
            <span class="badge-tag" style="background:#f1f5f9; color:#334155; font-size:0.68rem; font-weight:600;">
              Order: <strong>${escapeHTML(o.order_status || 'processing')}</strong>
            </span>
            <span class="badge-tag" style="background:${o.payment_status === 'paid' ? '#dcfce7' : (o.payment_status === 'failed' ? '#fee2e2' : '#fef3c7')}; color:${o.payment_status === 'paid' ? '#15803d' : (o.payment_status === 'failed' ? '#b91c1c' : '#b45309')}; font-size:0.68rem; font-weight:600;">
              Pay: <strong>${escapeHTML(o.payment_status || 'unpaid')}</strong>
            </span>
            <span class="badge-tag" style="background:${o.delivery_status === 'delivered' ? '#dcfce7' : (o.delivery_status === 'failed' ? '#fee2e2' : '#e0f2fe')}; color:${o.delivery_status === 'delivered' ? '#15803d' : (o.delivery_status === 'failed' ? '#b91c1c' : '#0369a1')}; font-size:0.68rem; font-weight:600;">
              Deliv: <strong>${escapeHTML(o.delivery_status || 'not_scheduled')}</strong>
            </span>
            <span class="badge-tag" style="background:${o.installation_status === 'completed' ? '#dcfce7' : (o.installation_status === 'cancelled' ? '#fee2e2' : '#f3e8ff')}; color:${o.installation_status === 'completed' ? '#15803d' : (o.installation_status === 'cancelled' ? '#b91c1c' : '#6b21a8')}; font-size:0.68rem; font-weight:600;">
              Inst: <strong>${escapeHTML(o.installation_status || 'not_requested')}</strong>
            </span>
          </div>
        </td>
        <td>
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            ${actions.join('')}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// --- New Sale Sidebar Module ---
async function loadNewSaleModule() {
  posCartItems = [];

  try {
    const res = await fetch('/api/cashier/orders');
    const data = await res.json();
    if (data.success) {
      cashierOrdersList = data.orders || [];
      cashierProductsList = data.products || [];
      cashierCustomersList = data.customers || [];
    }
  } catch (err) {
    console.warn('New Sale inventory sync warning:', err.message);
  }

  // Populate registered customers dropdown
  const custSel = document.getElementById('pos_existing_customer');
  if (custSel) {
    custSel.innerHTML = `<option value="">-- Walk-In / New Customer --</option>` +
      cashierCustomersList.map(c =>
        `<option value="${c.customer_id}">${escapeHTML(c.full_name)} (${escapeHTML(c.phone || '')})</option>`
      ).join('');
  }

  // Populate live in-stock inventory dropdown
  const prodSel = document.getElementById('pos_product_select');
  if (prodSel) {
    const avail = cashierProductsList.filter(p => Number(p.quantity_in_stock || 0) > 0);
    prodSel.innerHTML = avail.length > 0
      ? avail.map(p =>
          `<option value="${p.product_id}">${escapeHTML(p.product_name)} — ${formatKES(p.selling_price)} (${p.quantity_in_stock} in stock)</option>`
        ).join('')
      : `<option value="">No products in stock</option>`;
  }

  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  setVal('pos_customer_name', 'Walk-In Customer');
  setVal('pos_customer_phone', '');
  setVal('pos_customer_location', 'Meru Town Showroom');
  setVal('pos_payment_method', 'M-Pesa');
  setVal('pos_payment_ref', '');
  setVal('pos_cash_tendered', '');
  setVal('pos_split_cash_amount', '');
  setVal('pos_split_cash_tendered', '');
  setVal('pos_split_mpesa_amount', '');
  setVal('pos_split_mpesa_phone', '');
  setVal('pos_split_payment_ref', '');
  setVal('pos_delivery_method', 'delivery');
  setVal('pos_installation_option', 'none');
  setVal('pos_fulfillment_type', 'product_delivery');
  setVal('pos_fulfillment_mode', 'delivery');

  togglePOSCashFields();
  renderPOSCartItems();
}

function fillPOSCustomerFromSelect(custId) {
  if (!custId) {
    document.getElementById('pos_customer_name').value = 'Walk-In Customer';
    document.getElementById('pos_customer_phone').value = '';
    document.getElementById('pos_customer_location').value = 'Meru Town Showroom';
    return;
  }
  const c = cashierCustomersList.find(x => String(x.customer_id) === String(custId));
  if (c) {
    document.getElementById('pos_customer_name').value = c.full_name || '';
    document.getElementById('pos_customer_phone').value = c.phone || '';
    document.getElementById('pos_customer_location').value = c.location || 'Meru County';
  }
}

function addPOSCartItem() {
  const prodSel = document.getElementById('pos_product_select');
  const qtyInput = document.getElementById('pos_product_qty');
  const pid = Number(prodSel?.value || 0);
  const qty = Math.max(1, Number(qtyInput?.value || 1));

  const prod = cashierProductsList.find(p => Number(p.product_id) === pid);
  if (!prod) {
    showToast('Please select an in-stock product.', 'error');
    return;
  }

  const existing = posCartItems.find(i => i.product_id === pid);
  const nextQty = (existing ? existing.quantity : 0) + qty;
  if (nextQty > Number(prod.quantity_in_stock || 0)) {
    showToast(`Only ${prod.quantity_in_stock} unit(s) available in stock for ${prod.product_name}.`, 'error');
    return;
  }

  if (existing) {
    existing.quantity = nextQty;
  } else {
    posCartItems.push({
      product_id: pid,
      product_name: prod.product_name,
      quantity: qty,
      unit_price: Number(prod.selling_price || 0)
    });
  }

  if (qtyInput) qtyInput.value = 1;
  renderPOSCartItems();
}

function removePOSCartItem(idx) {
  posCartItems.splice(idx, 1);
  renderPOSCartItems();
}

function renderPOSCartItems() {
  const tbody = document.getElementById('pos-cart-tbody');
  if (!tbody) return;

  if (posCartItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:10px;">No items added yet. Select a product above.</td></tr>';
  } else {
    tbody.innerHTML = posCartItems.map((it, idx) => `
      <tr>
        <td><strong>${escapeHTML(it.product_name)}</strong></td>
        <td>${it.quantity}</td>
        <td>${formatKES(it.unit_price)}</td>
        <td><strong>${formatKES(it.quantity * it.unit_price)}</strong></td>
        <td style="text-align:right;">
          <button type="button" onclick="removePOSCartItem(${idx})" style="background:#fee2e2; color:#b91c1c; border:none; border-radius:4px; padding:2px 7px; cursor:pointer; font-weight:700;">&times;</button>
        </td>
      </tr>
    `).join('');
  }
  recalculatePOSTotals();
}

function togglePOSCashFields() {
  const method = document.getElementById('pos_payment_method')?.value || 'M-Pesa';
  const standardFields = document.getElementById('pos_standard_payment_fields');
  const splitPanel = document.getElementById('pos_split_payment_panel');
  const phoneGrp = document.getElementById('pos_mpesa_phone_group');
  const cashGrp = document.getElementById('pos_cash_tendered_group');
  const refLbl = document.getElementById('pos_ref_label');

  if (method === 'Split') {
    if (standardFields) standardFields.style.display = 'none';
    if (splitPanel) splitPanel.style.display = 'block';
    initSplitAmounts();
  } else {
    if (standardFields) standardFields.style.display = 'block';
    if (splitPanel) splitPanel.style.display = 'none';
    if (phoneGrp) phoneGrp.style.display = method === 'M-Pesa' ? '' : 'none';
    if (cashGrp) cashGrp.style.display = method === 'Cash' ? '' : 'none';
    if (refLbl) {
      applyPaymentRefInputRules('pos_payment_ref', method, refLbl, {
        mpesa: 'M-Pesa Transaction Code',
        bank: 'Bank Transfer Reference (Max 12 digits)',
        cash: 'Cash Receipt Note (Optional)'
      });
    }
    applyPaymentRefInputRules('pos_split_payment_ref', 'M-Pesa');
  }
  recalculatePOSTotals();
}

function initSplitAmounts() {
  const subtotal = posCartItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const { fee } = getPOSFulfillmentDetails();
  const grandTotal = subtotal + fee;

  const cashInput = document.getElementById('pos_split_cash_amount');
  const mpesaInput = document.getElementById('pos_split_mpesa_amount');
  const phoneInput = document.getElementById('pos_split_mpesa_phone');
  const custPhone = document.getElementById('pos_customer_phone')?.value || '';

  if (phoneInput && !phoneInput.value && custPhone) {
    phoneInput.value = custPhone;
  }

  if (cashInput && mpesaInput) {
    const curCash = Number(cashInput.value || 0);
    const curMpesa = Number(mpesaInput.value || 0);
    if ((curCash === 0 && curMpesa === 0 && grandTotal > 0) || (curCash + curMpesa !== grandTotal && grandTotal > 0)) {
      if (curCash > 0 && curCash <= grandTotal) {
        mpesaInput.value = grandTotal - curCash;
      } else {
        const half = Math.round(grandTotal / 2);
        cashInput.value = half;
        mpesaInput.value = grandTotal - half;
      }
    }
  }
}

function handleSplitCashAmountChange() {
  const subtotal = posCartItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const { fee } = getPOSFulfillmentDetails();
  const grandTotal = subtotal + fee;

  const cashInput = document.getElementById('pos_split_cash_amount');
  const mpesaInput = document.getElementById('pos_split_mpesa_amount');
  const cashVal = Math.max(0, Number(cashInput?.value || 0));

  if (mpesaInput) {
    const remaining = Math.max(0, grandTotal - cashVal);
    mpesaInput.value = remaining;
  }
  recalculatePOSTotals();
}

function handleSplitMpesaAmountChange() {
  const subtotal = posCartItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const { fee } = getPOSFulfillmentDetails();
  const grandTotal = subtotal + fee;

  const cashInput = document.getElementById('pos_split_cash_amount');
  const mpesaInput = document.getElementById('pos_split_mpesa_amount');
  const mpesaVal = Math.max(0, Number(mpesaInput?.value || 0));

  if (cashInput) {
    const remaining = Math.max(0, grandTotal - mpesaVal);
    cashInput.value = remaining;
  }
  recalculatePOSTotals();
}

function getPOSFulfillmentDetails() {
  const delMethod = document.getElementById('pos_delivery_method')?.value || 'delivery';
  const instOption = document.getElementById('pos_installation_option')?.value || 'none';
  const zone = document.getElementById('pos_delivery_zone')?.value || 'town';
  const zoneGroup = document.getElementById('pos_delivery_zone_group');
  const hiddenMode = document.getElementById('pos_fulfillment_mode');
  const hiddenType = document.getElementById('pos_fulfillment_type');

  const requiresInstallation = instOption === 'immediate' || instOption === 'later';
  const scheduleInstallLater = instOption === 'later';

  if (delMethod === 'collection') {
    if (zoneGroup) zoneGroup.style.display = 'none';
    if (hiddenMode) hiddenMode.value = 'collection';
    if (hiddenType) hiddenType.value = 'product_collection';
    return { mode: 'collection', type: 'product_collection', fee: 0, requiresInstallation, scheduleInstallLater };
  }

  const fType = instOption === 'immediate'
    ? 'product_delivery_install'
    : (instOption === 'later' ? 'product_install_later' : 'product_delivery');

  if (zoneGroup) zoneGroup.style.display = 'block';
  if (hiddenMode) hiddenMode.value = 'delivery';
  if (hiddenType) hiddenType.value = fType;
  const fee = zone === 'subcounty' ? 500 : 300;
  return { mode: 'delivery', type: fType, fee, requiresInstallation, scheduleInstallLater };
}

function togglePOSPaymentTerms() {
  const terms = document.getElementById('pos_payment_terms')?.value || 'full';
  const alertEl = document.getElementById('pos_unpaid_balance_alert');
  const customPaidInput = document.getElementById('pos_custom_amount_paid');
  const { fee } = getPOSFulfillmentDetails();
  const subtotal = posCartItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const grandTotal = subtotal + fee;

  if (terms === 'partial') {
    if (alertEl) alertEl.style.display = 'block';
    if (customPaidInput && (!customPaidInput.value || Number(customPaidInput.value) >= grandTotal)) {
      customPaidInput.value = Math.max(0, Math.round(grandTotal / 2));
    }
  } else {
    if (alertEl) alertEl.style.display = 'none';
    if (customPaidInput) customPaidInput.value = '';
  }
  recalculatePOSTotals();
}

function recalculatePOSTotals() {
  const subtotal = posCartItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const { fee, type } = getPOSFulfillmentDetails();
  const grandTotal = subtotal + fee;

  const terms = document.getElementById('pos_payment_terms')?.value || 'full';
  const customPaidRaw = document.getElementById('pos_custom_amount_paid')?.value;
  let amountPaid = grandTotal;
  let balanceDue = 0;

  if (terms === 'partial' && customPaidRaw !== '' && customPaidRaw !== undefined) {
    amountPaid = Math.max(0, Number(customPaidRaw));
    balanceDue = Math.max(0, grandTotal - amountPaid);
  }

  const subLbl = document.getElementById('pos_subtotal_lbl');
  const delLbl = document.getElementById('pos_delivery_lbl');
  const orderTotalLbl = document.getElementById('pos_order_total_lbl');
  const grandLbl = document.getElementById('pos_grand_total_lbl');
  const changeLbl = document.getElementById('pos_change_lbl');
  const balAlertLbl = document.getElementById('pos_balance_due_display');
  const balBadgeLbl = document.getElementById('pos_balance_badge_lbl');

  if (subLbl) subLbl.textContent = formatKES(subtotal);
  if (delLbl) delLbl.textContent = formatKES(fee);
  if (orderTotalLbl) orderTotalLbl.textContent = formatKES(grandTotal);
  if (grandLbl) grandLbl.textContent = formatKES(amountPaid);
  if (balAlertLbl) balAlertLbl.textContent = formatKES(balanceDue);
  if (balBadgeLbl) {
    if (balanceDue > 0) {
      balBadgeLbl.style.display = 'block';
      balBadgeLbl.textContent = `⚠️ Unpaid Balance: ${formatKES(balanceDue)} (Rule 5: Subject to Finance Credit Review)`;
    } else {
      balBadgeLbl.style.display = 'none';
    }
  }

  const method = document.getElementById('pos_payment_method')?.value || 'M-Pesa';

  if (method === 'Split') {
    const cashVal = Number(document.getElementById('pos_split_cash_amount')?.value || 0);
    const mpesaVal = Number(document.getElementById('pos_split_mpesa_amount')?.value || 0);
    const tenderedVal = Number(document.getElementById('pos_split_cash_tendered')?.value || 0);
    const badge = document.getElementById('pos_split_status_badge');
    const cashChangeLbl = document.getElementById('pos_split_cash_change_lbl');

    const splitSum = cashVal + mpesaVal;
    const diff = amountPaid - splitSum;

    if (badge) {
      if (amountPaid === 0) {
        badge.style.background = '#eff6ff';
        badge.style.color = '#1e40af';
        badge.style.borderColor = '#bfdbfe';
        badge.textContent = 'Add products to compute split amounts';
      } else if (diff === 0) {
        badge.style.background = '#f0fdf4';
        badge.style.color = '#15803d';
        badge.style.borderColor = '#86efac';
        badge.textContent = `✅ Balanced: Cash ${formatKES(cashVal)} + M-Pesa ${formatKES(mpesaVal)} = ${formatKES(amountPaid)}`;
      } else if (diff > 0) {
        badge.style.background = '#fef3c7';
        badge.style.color = '#b45309';
        badge.style.borderColor = '#fde68a';
        badge.textContent = `⚠️ Underpaid by ${formatKES(diff)} (Paying: ${formatKES(amountPaid)})`;
      } else {
        badge.style.background = '#fee2e2';
        badge.style.color = '#b91c1c';
        badge.style.borderColor = '#fca5a5';
        badge.textContent = `⚠️ Overallocated by ${formatKES(Math.abs(diff))} (Paying: ${formatKES(amountPaid)})`;
      }
    }

    if (cashChangeLbl) {
      if (tenderedVal > 0) {
        cashChangeLbl.style.display = 'block';
        if (tenderedVal >= cashVal) {
          cashChangeLbl.style.color = '#087443';
          cashChangeLbl.textContent = `Cash Change Due: ${formatKES(tenderedVal - cashVal)} (Tendered ${formatKES(tenderedVal)} for ${formatKES(cashVal)} cash portion)`;
        } else {
          cashChangeLbl.style.color = '#dc2626';
          cashChangeLbl.textContent = `Cash Shortage: Handed ${formatKES(tenderedVal)}, but cash portion is ${formatKES(cashVal)}`;
        }
      } else {
        cashChangeLbl.style.display = 'none';
      }
    }

    if (changeLbl) {
      if (tenderedVal > cashVal && cashVal > 0) {
        changeLbl.style.display = 'block';
        changeLbl.style.color = '#087443';
        changeLbl.textContent = `Cash Change Due: ${formatKES(tenderedVal - cashVal)}`;
      } else {
        changeLbl.style.display = 'none';
      }
    }
  } else {
    const cashChangeLbl = document.getElementById('pos_split_cash_change_lbl');
    if (cashChangeLbl) cashChangeLbl.style.display = 'none';

    if (changeLbl) {
      if (method === 'Cash') {
        const tendered = Number(document.getElementById('pos_cash_tendered')?.value || 0);
        const change = tendered >= amountPaid ? (tendered - amountPaid) : 0;
        changeLbl.style.display = 'block';
        changeLbl.textContent = tendered > 0
          ? (tendered >= amountPaid ? `Change Due to Customer: ${formatKES(change)}` : `Short by: ${formatKES(amountPaid - tendered)}`)
          : 'Enter cash tendered to compute change';
        changeLbl.style.color = tendered >= amountPaid || tendered === 0 ? '#087443' : '#dc2626';
      } else {
        changeLbl.style.display = 'none';
      }
    }
  }
}

async function handleRecordCashierSale(e) {
  e.preventDefault();

  const userRole = normalizeRole(currentUser?.role);
  if (userRole !== 'cashier') {
    if (isAdminRole(userRole)) {
      showToast("Admin Governance Rule: The Admin manages permissions and governance, and cannot bypass the Cashier's normal sales and payment process. Please log in as the Cashier (Esther Karimi) to process and confirm sales.", 'error');
    } else {
      showToast('Access Denied: Only the Cashier should confirm payments and issue sales receipts.', 'error');
    }
    return;
  }

  if (posCartItems.length === 0) {
    showToast('Please add at least one product item before completing the sale.', 'error');
    return;
  }

  if (posCartItems.some(i => Number(i.unit_price || 0) <= 0)) {
    showToast('Cannot accept a sale containing an item with KSh 0 price.', 'error');
    return;
  }

  const { mode, type, fee, requiresInstallation, scheduleInstallLater } = getPOSFulfillmentDetails();
  const subtotal = posCartItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const grandTotal = subtotal + fee;

  if (Number.isNaN(grandTotal) || grandTotal <= 0) {
    showToast('Cannot accept or record a sale with KSh 0 total amount.', 'error');
    return;
  }

  const terms = document.getElementById('pos_payment_terms')?.value || 'full';
  const customPaidRaw = document.getElementById('pos_custom_amount_paid')?.value;
  const amountPaid = terms === 'partial' && customPaidRaw !== '' && customPaidRaw !== undefined
    ? Math.max(0, Number(customPaidRaw))
    : grandTotal;

  if (Number.isNaN(amountPaid) || amountPaid <= 0) {
    showToast('Cannot accept a sale with KSh 0 payment amount. Enter an amount greater than KSh 0.', 'error');
    return;
  }

  const balanceDue = Math.max(0, grandTotal - amountPaid);
  const creditNotes = document.getElementById('pos_credit_notes')?.value.trim() || '';

  const method = document.getElementById('pos_payment_method').value;
  const tenderedRaw = Number(document.getElementById('pos_cash_tendered')?.value || 0);

  if (method === 'Cash' && tenderedRaw > 0 && tenderedRaw < amountPaid) {
    showToast(`Cash tendered cannot be less than the amount being paid (${formatKES(amountPaid)}).`, 'error');
    return;
  }

  let splitCash = 0;
  let splitMpesa = 0;
  let splitRef = '';
  let splitPhone = '';
  let finalCashTendered = tenderedRaw || amountPaid;

  if (method === 'Split') {
    splitCash = Number(document.getElementById('pos_split_cash_amount')?.value || 0);
    splitMpesa = Number(document.getElementById('pos_split_mpesa_amount')?.value || 0);
    const splitTenderedRaw = Number(document.getElementById('pos_split_cash_tendered')?.value || 0);
    splitRef = (document.getElementById('pos_split_payment_ref')?.value || '').trim();
    splitPhone = (document.getElementById('pos_split_mpesa_phone')?.value || '').trim();

    if (splitCash + splitMpesa !== amountPaid) {
      showToast(`Split amounts (${formatKES(splitCash)} Cash + ${formatKES(splitMpesa)} M-Pesa = ${formatKES(splitCash + splitMpesa)}) must equal payment amount ${formatKES(amountPaid)}.`, 'error');
      return;
    }

    if (splitMpesa > 0 && !splitRef) {
      showToast('Please enter the M-Pesa transaction reference code for the M-Pesa portion.', 'error');
      document.getElementById('pos_split_payment_ref')?.focus();
      return;
    }

    const splitRefCheck = validatePaymentRefClient('M-Pesa', splitRef, { required: splitMpesa > 0, label: 'M-Pesa reference' });
    if (!splitRefCheck.valid) {
      showToast(splitRefCheck.message, 'error');
      document.getElementById('pos_split_payment_ref')?.focus();
      return;
    }
    splitRef = splitRefCheck.value;

    if (splitTenderedRaw > 0 && splitTenderedRaw < splitCash) {
      showToast('Cash tendered cannot be less than the cash portion amount.', 'error');
      return;
    }

    finalCashTendered = splitTenderedRaw || splitCash;
  }

  let stdPaymentRef = (document.getElementById('pos_payment_ref')?.value.trim() || '');
  if (method !== 'Split') {
    const stdCheck = validatePaymentRefClient(method, stdPaymentRef, { required: false, label: 'Payment reference' });
    if (!stdCheck.valid) {
      showToast(stdCheck.message, 'error');
      document.getElementById('pos_payment_ref')?.focus();
      return;
    }
    stdPaymentRef = stdCheck.value;
  }

  const payload = {
    customer_name: document.getElementById('pos_customer_name').value.trim(),
    customer_phone: (method === 'Split' && splitPhone ? splitPhone : document.getElementById('pos_customer_phone').value.trim()),
    customer_location: document.getElementById('pos_customer_location').value.trim() || 'Meru Town Showroom',
    items: posCartItems,
    delivery_fee: fee,
    payment_method: method,
    payment_ref: method === 'Split' ? splitRef : stdPaymentRef,
    cash_tendered: method === 'Cash' ? (tenderedRaw || amountPaid) : finalCashTendered,
    split_cash_amount: splitCash,
    split_mpesa_amount: splitMpesa,
    fulfillment_type: type,
    fulfillment_mode: mode,
    requires_installation: Boolean(requiresInstallation),
    schedule_install_later: Boolean(scheduleInstallLater),
    amount_paid: amountPaid,
    balance_due: balanceDue,
    credit_policy_notes: creditNotes,
    cashier_name: currentUser?.full_name || 'Esther Karimi',
    user_role: currentUser?.role || 'cashier'
  };

  try {
    const res = await fetch('/api/cashier/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to record sale');

    const orderBal = Number(data.order?.balance_due || 0);
    if (orderBal > 0) {
      showToast(`Sale ${data.order.order_no} served! Customer Balance Due: ${formatKES(orderBal)} — Passed to Finance for confirmation.`, 'success');
    } else {
      showToast(`Sale ${data.order.order_no} served! Inventory updated & Passed to Finance for confirmation.`, 'success');
    }
    await loadNewSaleModule();
    openCashierReceiptFromData(data.order);
    loadOverviewKPIs();
    if (typeof loadFinanceRecords === 'function') loadFinanceRecords();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Confirm Customer Order Payment Modal ---
function openConfirmPaymentModal(orderNo) {
  const userRole = normalizeRole(currentUser?.role);
  if (userRole !== 'cashier') {
    if (isAdminRole(userRole)) {
      showToast("Admin Governance Rule: The Admin manages permissions and governance, and cannot bypass the Cashier's normal sales and payment process. Please log in as the Cashier (Esther Karimi) to confirm payments and issue sales receipts.", 'error');
    } else {
      showToast('Access Denied: Only the Cashier should confirm payments and issue sales receipts.', 'error');
    }
    return;
  }

  const order = cashierOrdersList.find(o => o.order_no === orderNo);
  if (!order) return;

  if (Number(order.total_amount || 0) <= 0) {
    showToast('Cannot accept or confirm payment for a sale with KSh 0 amount.', 'error');
    return;
  }

  const totalAmt = Number(order.total_amount || 0);
  document.getElementById('confirm_order_no').value = order.order_no;
  document.getElementById('confirm_order_amount').value = totalAmt;

  const termsEl = document.getElementById('confirm_payment_terms');
  if (termsEl) termsEl.value = 'full';
  const paidInputEl = document.getElementById('confirm_amount_paid');
  if (paidInputEl) paidInputEl.value = totalAmt;
  const noteInputEl = document.getElementById('confirm_balance_note');
  if (noteInputEl) noteInputEl.value = order.credit_policy_notes || '';

  const confirmMethod = order.payment_method === 'Cash'
    ? 'Cash'
    : (order.payment_method === 'Split' ? 'Split' : (/bank/i.test(order.payment_method || '') ? 'Bank Transfer' : 'M-Pesa'));
  document.getElementById('confirm_payment_method').value = confirmMethod;
  const rawOrderRef = String(order.payment_ref || '').trim();
  const safeInitialRef = confirmMethod === 'Cash'
    ? 'CASH-COUNTER'
    : (/pending|awaiting|pay on/i.test(rawOrderRef) ? '' : rawOrderRef);
  document.getElementById('confirm_payment_ref').value = safeInitialRef;
  document.getElementById('confirm_cash_tendered').value = totalAmt;

  const splitCashInput = document.getElementById('confirm_split_cash_amount');
  const splitMpesaInput = document.getElementById('confirm_split_mpesa_amount');
  const splitTendered = document.getElementById('confirm_split_cash_tendered');
  const splitRef = document.getElementById('confirm_split_payment_ref');
  if (splitCashInput) splitCashInput.value = '';
  if (splitMpesaInput) splitMpesaInput.value = '';
  if (splitTendered) splitTendered.value = '';
  if (splitRef) splitRef.value = '';

  const phoneInput = document.getElementById('confirm_mpesa_phone');
  if (phoneInput) phoneInput.value = order.customer_phone || '';

  const summaryEl = document.getElementById('confirm_order_summary');
  if (summaryEl) {
    const itemsText = (order.items || []).map(i => `${i.quantity}x ${escapeHTML(i.product_name)}`).join(', ');
    summaryEl.innerHTML = `
      <div><strong>Order #:</strong> <span style="font-family:monospace; color:#1d4ed8;">${escapeHTML(order.order_no)}</span></div>
      <div><strong>Customer:</strong> ${escapeHTML(order.customer_name)} ${order.customer_phone ? `(${escapeHTML(order.customer_phone)})` : ''}</div>
      <div><strong>Items:</strong> ${itemsText}</div>
      <div style="margin-top:6px; font-size:1rem; font-weight:800; color:#087443;">Order Total: ${formatKES(totalAmt)}</div>
    `;
  }

  toggleConfirmPaymentTerms();
  toggleConfirmCashFields();
  openModal('cashier-confirm-modal');
}

function getConfirmAmountPayingNow() {
  const orderTotal = Number(document.getElementById('confirm_order_amount')?.value || 0);
  const terms = document.getElementById('confirm_payment_terms')?.value || 'full';
  if (terms !== 'partial') return orderTotal;
  const rawPaid = Number(document.getElementById('confirm_amount_paid')?.value || 0);
  return Math.max(0, Math.min(orderTotal, rawPaid));
}

function toggleConfirmPaymentTerms() {
  const terms = document.getElementById('confirm_payment_terms')?.value || 'full';
  const orderTotal = Number(document.getElementById('confirm_order_amount')?.value || 0);
  const partialPanel = document.getElementById('confirm_partial_panel');
  const paidInput = document.getElementById('confirm_amount_paid');
  if (partialPanel) {
    partialPanel.style.display = terms === 'partial' ? 'block' : 'none';
  }
  if (terms === 'partial' && paidInput && (!paidInput.value || Number(paidInput.value) >= orderTotal)) {
    paidInput.value = Math.max(1, Math.round(orderTotal / 2));
  } else if (terms === 'full' && paidInput) {
    paidInput.value = orderTotal;
  }
  updateConfirmBalancePreview();
}

function updateConfirmBalancePreview() {
  const orderTotal = Number(document.getElementById('confirm_order_amount')?.value || 0);
  const payingNow = getConfirmAmountPayingNow();
  const balanceDue = Math.max(0, orderTotal - payingNow);
  const balDueLbl = document.getElementById('confirm_balance_due_lbl');
  const cashTenderedInput = document.getElementById('confirm_cash_tendered');
  if (balDueLbl) {
    balDueLbl.textContent = formatKES(balanceDue);
  }
  if (cashTenderedInput && document.getElementById('confirm_payment_terms')?.value === 'partial') {
    cashTenderedInput.value = payingNow;
  }
  if (document.getElementById('confirm_payment_method')?.value === 'Split') {
    initConfirmSplitAmounts();
  }
  updateConfirmChangePreview();
}

function toggleConfirmCashFields() {
  const method = document.getElementById('confirm_payment_method')?.value || 'M-Pesa';
  const stdFields = document.getElementById('confirm_standard_fields');
  const splitPanel = document.getElementById('confirm_split_panel');
  const cashGrp = document.getElementById('confirm_cash_group');
  const refLbl = document.getElementById('confirm_ref_label');

  if (method === 'Split') {
    if (stdFields) stdFields.style.display = 'none';
    if (splitPanel) splitPanel.style.display = 'block';
    initConfirmSplitAmounts();
  } else {
    if (stdFields) stdFields.style.display = 'block';
    if (splitPanel) splitPanel.style.display = 'none';
    if (cashGrp) cashGrp.style.display = method === 'Cash' ? '' : 'none';
    if (refLbl) {
      applyPaymentRefInputRules('confirm_payment_ref', method, refLbl, {
        mpesa: 'Verified M-Pesa Reference *',
        bank: 'Bank Transfer Reference * (Max 12 digits)',
        cash: 'Cash Receipt Note (Optional)'
      });
    }
    applyPaymentRefInputRules('confirm_split_payment_ref', 'M-Pesa');
  }
  updateConfirmChangePreview();
}

function initConfirmSplitAmounts() {
  const due = getConfirmAmountPayingNow();
  const cashInput = document.getElementById('confirm_split_cash_amount');
  const mpesaInput = document.getElementById('confirm_split_mpesa_amount');
  if (cashInput && mpesaInput && due > 0) {
    const curCash = Number(cashInput.value || 0);
    const curMpesa = Number(mpesaInput.value || 0);
    if ((curCash === 0 && curMpesa === 0) || (curCash + curMpesa !== due)) {
      const half = Math.round(due / 2);
      cashInput.value = half;
      mpesaInput.value = due - half;
    }
  }
  updateConfirmSplitPreview();
}

function handleConfirmSplitCashChange() {
  const due = getConfirmAmountPayingNow();
  const cashVal = Math.max(0, Number(document.getElementById('confirm_split_cash_amount')?.value || 0));
  const mpesaInput = document.getElementById('confirm_split_mpesa_amount');
  if (mpesaInput) {
    mpesaInput.value = Math.max(0, due - cashVal);
  }
  updateConfirmSplitPreview();
}

function handleConfirmSplitMpesaChange() {
  const due = getConfirmAmountPayingNow();
  const mpesaVal = Math.max(0, Number(document.getElementById('confirm_split_mpesa_amount')?.value || 0));
  const cashInput = document.getElementById('confirm_split_cash_amount');
  if (cashInput) {
    cashInput.value = Math.max(0, due - mpesaVal);
  }
  updateConfirmSplitPreview();
}

function updateConfirmSplitPreview() {
  const due = getConfirmAmountPayingNow();
  const cashVal = Number(document.getElementById('confirm_split_cash_amount')?.value || 0);
  const mpesaVal = Number(document.getElementById('confirm_split_mpesa_amount')?.value || 0);
  const tendered = Number(document.getElementById('confirm_split_cash_tendered')?.value || 0);
  const badge = document.getElementById('confirm_split_badge');
  const changeEl = document.getElementById('confirm_split_cash_change');

  const diff = due - (cashVal + mpesaVal);
  if (badge) {
    if (diff === 0) {
      badge.style.background = '#f0fdf4';
      badge.style.color = '#15803d';
      badge.textContent = `Balanced: KES ${due}`;
    } else {
      badge.style.background = '#fee2e2';
      badge.style.color = '#b91c1c';
      badge.textContent = diff > 0 ? `Short by ${formatKES(diff)}` : `Over by ${formatKES(Math.abs(diff))}`;
    }
  }

  if (changeEl) {
    if (tendered > 0) {
      changeEl.style.display = 'block';
      if (tendered >= cashVal) {
        changeEl.style.color = '#087443';
        changeEl.textContent = `Cash Change: ${formatKES(tendered - cashVal)}`;
      } else {
        changeEl.style.color = '#dc2626';
        changeEl.textContent = `Cash Short: Handed ${formatKES(tendered)}, portion is ${formatKES(cashVal)}`;
      }
    } else {
      changeEl.style.display = 'none';
    }
  }
}

function updateConfirmChangePreview() {
  const due = getConfirmAmountPayingNow();
  const tendered = Number(document.getElementById('confirm_cash_tendered')?.value || 0);
  const prev = document.getElementById('confirm_change_preview');
  if (!prev) return;
  if (tendered >= due) {
    prev.style.color = '#087443';
    prev.textContent = `Change Due: ${formatKES(tendered - due)}`;
  } else {
    prev.style.color = '#dc2626';
    prev.textContent = `Cash Short by: ${formatKES(due - tendered)}`;
  }
}

async function handleConfirmCustomerPayment(e) {
  e.preventDefault();

  const userRole = normalizeRole(currentUser?.role);
  if (userRole !== 'cashier') {
    if (isAdminRole(userRole)) {
      showToast("Admin Governance Rule: The Admin manages permissions and governance, and cannot bypass the Cashier's normal sales and payment process. Please log in as the Cashier (Esther Karimi) to confirm payments and issue sales receipts.", 'error');
    } else {
      showToast('Access Denied: Only the Cashier should confirm payments and issue sales receipts.', 'error');
    }
    return;
  }

  const orderNo = document.getElementById('confirm_order_no').value;
  const orderTotal = Number(document.getElementById('confirm_order_amount').value || 0);
  const terms = document.getElementById('confirm_payment_terms')?.value || 'full';
  const payingNow = terms === 'partial'
    ? Number(document.getElementById('confirm_amount_paid')?.value || 0)
    : orderTotal;
  const balanceNote = (document.getElementById('confirm_balance_note')?.value || '').trim();
  const method = document.getElementById('confirm_payment_method').value;
  const ref = document.getElementById('confirm_payment_ref').value.trim();
  const tendered = Number(document.getElementById('confirm_cash_tendered').value || payingNow);

  if (Number.isNaN(orderTotal) || orderTotal <= 0) {
    showToast('Cannot accept or confirm payment for a sale with KSh 0 amount.', 'error');
    return;
  }
  if (Number.isNaN(payingNow) || payingNow <= 0) {
    showToast('Amount paid now must be greater than KSh 0.', 'error');
    return;
  }
  if (payingNow > orderTotal) {
    showToast(`Amount paid (${formatKES(payingNow)}) cannot exceed order total (${formatKES(orderTotal)}).`, 'error');
    return;
  }

  if (method === 'Cash' && (tendered <= 0 || tendered < payingNow)) {
    showToast('Cash received must be greater than KSh 0 and cannot be less than the amount being paid now.', 'error');
    return;
  }

  let splitCash = 0;
  let splitMpesa = 0;
  let splitRef = '';
  let finalTendered = method === 'Cash' ? tendered : payingNow;

  if (method === 'Split') {
    splitCash = Number(document.getElementById('confirm_split_cash_amount')?.value || 0);
    splitMpesa = Number(document.getElementById('confirm_split_mpesa_amount')?.value || 0);
    const splitTenderedRaw = Number(document.getElementById('confirm_split_cash_tendered')?.value || 0);
    splitRef = (document.getElementById('confirm_split_payment_ref')?.value || '').trim();

    if (splitCash + splitMpesa !== payingNow) {
      showToast(`Split amounts (${formatKES(splitCash)} Cash + ${formatKES(splitMpesa)} M-Pesa) must equal ${formatKES(payingNow)}.`, 'error');
      return;
    }
    if (splitMpesa > 0 && !splitRef) {
      showToast('Please enter the M-Pesa transaction reference code.', 'error');
      document.getElementById('confirm_split_payment_ref')?.focus();
      return;
    }
    const splitRefCheck = validatePaymentRefClient('M-Pesa', splitRef, { required: splitMpesa > 0, label: 'M-Pesa reference' });
    if (!splitRefCheck.valid) {
      showToast(splitRefCheck.message, 'error');
      document.getElementById('confirm_split_payment_ref')?.focus();
      return;
    }
    splitRef = splitRefCheck.value;
    if (splitTenderedRaw > 0 && splitTenderedRaw < splitCash) {
      showToast('Cash tendered cannot be less than the cash portion.', 'error');
      return;
    }
    finalTendered = splitTenderedRaw || splitCash;
  }

  let validatedRef = ref;
  if (method !== 'Split') {
    const stdRefCheck = validatePaymentRefClient(method, ref, { required: false, label: 'Payment reference' });
    if (!stdRefCheck.valid) {
      showToast(stdRefCheck.message, 'error');
      document.getElementById('confirm_payment_ref')?.focus();
      return;
    }
    validatedRef = stdRefCheck.value;
  }

  try {
    const res = await fetch(`/api/cashier/orders/${encodeURIComponent(orderNo)}/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': currentUser?.role || 'cashier'
      },
      body: JSON.stringify({
        payment_method: method,
        payment_ref: method === 'Split' ? splitRef : validatedRef,
        amount_paid: payingNow,
        credit_policy_notes: terms === 'partial' ? balanceNote : '',
        cash_tendered: finalTendered,
        split_cash_amount: splitCash,
        split_mpesa_amount: splitMpesa,
        cashier_name: currentUser?.full_name || 'Esther Karimi',
        user_role: currentUser?.role || 'cashier'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Payment confirmation failed');

    closeModal('cashier-confirm-modal');
    const bal = Number(data.order?.balance_due || 0);
    if (bal > 0) {
      showToast(`Order ${orderNo} served! Customer Balance Due: ${formatKES(bal)} — Passed to Finance for confirmation.`, 'success');
    } else {
      showToast(`Order ${orderNo} confirmed & receipt generated! Passed to Finance for confirmation.`, 'success');
    }
    await loadCashierDesk();
    openCashierReceiptFromData(data.order);
    loadOverviewKPIs();
    if (typeof loadFinanceRecords === 'function') loadFinanceRecords();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Send Paid Order for Delivery or Collection ---
function openSendToDispatchModal(orderNo) {
  const order = cashierOrdersList.find(o => o.order_no === orderNo);
  if (!order) return;

  document.getElementById('handoff_order_no').value = order.order_no;
  document.getElementById('handoff_delivery_address').value =
    (order.customer_location && !/showroom|collection/i.test(order.customer_location))
      ? order.customer_location
      : 'Makutano, Meru County';
  document.getElementById('handoff_driver_notes').value = '';

  const sumEl = document.getElementById('handoff_order_summary');
  if (sumEl) {
    sumEl.innerHTML = `
      <strong>Paid Order ${escapeHTML(order.order_no)}</strong> • ${formatKES(order.total_amount)} (${escapeHTML(order.payment_method)} Ref: ${escapeHTML(order.payment_ref || 'Verified')})<br>
      Customer: <strong>${escapeHTML(order.customer_name)}</strong> ${order.customer_phone ? `(${escapeHTML(order.customer_phone)})` : ''}
    `;
  }
  openModal('cashier-dispatch-modal');
}

async function handleSendOrderToDispatch(e) {
  e.preventDefault();
  const orderNo = document.getElementById('handoff_order_no').value;
  const order = cashierOrdersList.find(o => o.order_no === orderNo);
  const address = document.getElementById('handoff_delivery_address').value.trim();
  const notes = document.getElementById('handoff_driver_notes').value.trim();

  try {
    const res = await fetch(`/api/cashier/orders/${encodeURIComponent(orderNo)}/fulfillment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_delivery',
        delivery_address: address,
        driver_notes: notes,
        customer_name: order?.customer_name,
        customer_phone: order?.customer_phone,
        cashier_name: currentUser?.full_name || 'Esther Karimi'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to send order to Dispatch');

    closeModal('cashier-dispatch-modal');
    showToast(`Order ${orderNo} sent to Dispatch Manager for Meru delivery!`, 'success');
    loadCashierDesk();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function markOrderCollection(orderNo, actionType) {
  const order = cashierOrdersList.find(o => o.order_no === orderNo);
  try {
    const res = await fetch(`/api/cashier/orders/${encodeURIComponent(orderNo)}/fulfillment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: actionType,
        customer_name: order?.customer_name,
        customer_phone: order?.customer_phone,
        cashier_name: currentUser?.full_name || 'Esther Karimi'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update collection status');

    const msg = actionType === 'mark_collected'
      ? `Order ${orderNo} marked Collected by Customer at Shop Counter.`
      : `Order ${orderNo} queued Ready for Customer Collection.`;
    showToast(msg, 'success');
    loadCashierDesk();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Official Receipt Generator ---
function openCashierReceipt(orderNo) {
  const order = cashierOrdersList.find(o => o.order_no === orderNo);
  if (!order) return;
  openCashierReceiptFromData(order);
}

function openCashierReceiptFromData(order) {
  const box = document.getElementById('cashier-printable-receipt');
  if (!box || !order) return;

  const receiptNo = order.receipt_no || `RCP-${order.order_no}`;
  const paidDate = formatActivityTime(order.paid_at || order.created_at || new Date().toISOString());
  const rowsHtml = (order.items || []).map(it => `
    <tr>
      <td style="padding:5px 0; border-bottom:1px dotted #cbd5e1;">${escapeHTML(it.product_name)}</td>
      <td style="padding:5px 4px; text-align:center; border-bottom:1px dotted #cbd5e1;">${it.quantity}</td>
      <td style="padding:5px 0; text-align:right; border-bottom:1px dotted #cbd5e1;">${formatKES(Number(it.quantity || 1) * Number(it.unit_price || 0))}</td>
    </tr>
  `).join('');

  const handoffLabel = order.fulfillment_mode === 'delivery'
    ? `Meru County Delivery (${escapeHTML(order.customer_location || 'Meru')})`
    : 'Shop Counter Collection (Meru Town)';

  box.innerHTML = `
    <div style="text-align:center; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:10px;">
      <div style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:#1d4ed8; color:#fff; border:2px solid #f59e0b; font-weight:900; font-size:1.1rem; margin-bottom:4px;">E</div>
      <div style="font-size:1.05rem; font-weight:900; letter-spacing:0.02em;">ELIGHT ELECTRICAL SHOP</div>
      <div style="font-size:0.76rem; color:#475569;">Meru Town, Meru County • Tel: +254 700 123 456</div>
      <div style="font-size:0.75rem; color:#475569;">Email: elightelectrical@ke.com • M-Pesa Till: <strong>5894210</strong></div>
      <div style="margin-top:6px; display:inline-block; background:#0f172a; color:#fff; padding:2px 10px; border-radius:4px; font-size:0.74rem; font-weight:700;">OFFICIAL SALES RECEIPT</div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.78rem; margin-bottom:10px;">
      <div><strong>Receipt No:</strong> ${escapeHTML(receiptNo)}</div>
      <div style="text-align:right;"><strong>Order Ref:</strong> ${escapeHTML(order.order_no)}</div>
      <div><strong>Customer:</strong> ${escapeHTML(order.customer_name)}</div>
      <div style="text-align:right;"><strong>Date:</strong> ${paidDate}</div>
      ${order.customer_phone ? `<div colspan="2"><strong>Phone:</strong> ${escapeHTML(order.customer_phone)}</div>` : ''}
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-bottom:10px;">
      <thead>
        <tr style="border-top:1px solid #0f172a; border-bottom:1px solid #0f172a;">
          <th style="text-align:left; padding:5px 0;">Item Description</th>
          <th style="text-align:center; padding:5px 4px;">Qty</th>
          <th style="text-align:right; padding:5px 0;">Amount</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div style="border-top:1px solid #0f172a; padding-top:8px; font-size:0.82rem;">
      ${Number(order.delivery_fee || 0) > 0 ? `
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
          <span>Items Subtotal:</span><span>${formatKES(order.subtotal)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Meru Delivery Fee:</span><span>${formatKES(order.delivery_fee)}</span>
        </div>
      ` : ''}
      <div style="display:flex; justify-content:space-between; font-size:0.86rem; font-weight:700; color:#334155; margin:4px 0 2px;">
        <span>ORDER TOTAL:</span><span>${formatKES(order.total_amount)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:1rem; font-weight:900; color:#087443; margin:2px 0 4px;">
        <span>AMOUNT PAID:</span><span>${formatKES(order.amount_paid !== undefined ? order.amount_paid : order.total_amount)}</span>
      </div>
      ${Number(order.balance_due || 0) > 0 ? `
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:6px 8px; margin:6px 0; color:#b91c1c; font-size:0.8rem;">
          <div style="display:flex; justify-content:space-between; font-weight:900;">
            <span>⚠️ UNPAID BALANCE DUE:</span><span>${formatKES(order.balance_due)}</span>
          </div>
          ${(order.balance_note || order.credit_policy_notes) ? `<div style="font-size:0.74rem; color:#7f1d1d; margin-top:2px;">Note: ${escapeHTML(order.balance_note || order.credit_policy_notes)}</div>` : ''}
        </div>
      ` : ''}
      ${order.split_details ? `
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; margin:6px 0; font-size:0.77rem;">
          <div style="font-weight:800; color:#1e3a8a; margin-bottom:4px;">⚖️ SPLIT PAYMENT:</div>
          <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
            <span>💵 Cash:</span><strong>${formatKES(order.split_details.cash_amount)}</strong>
          </div>
          ${Number(order.split_details.cash_tendered || 0) > Number(order.split_details.cash_amount || 0) ? `
            <div style="display:flex; justify-content:space-between; color:#64748b; font-size:0.72rem;">
              <span>Cash Tendered:</span><span>${formatKES(order.split_details.cash_tendered)} (Change: ${formatKES(order.split_details.change_due || 0)})</span>
            </div>
          ` : ''}
          <div style="display:flex; justify-content:space-between; margin-top:3px;">
            <span>📲 M-Pesa:</span><strong>${formatKES(order.split_details.mpesa_amount)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; color:#64748b; font-size:0.72rem; margin-top:2px;">
            <span>M-Pesa Reference:</span><strong style="font-family:monospace;">${escapeHTML(order.split_details.mpesa_ref || order.payment_ref)}</strong>
          </div>
        </div>
      ` : `
        <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#334155;">
          <span>Payment Method:</span><strong>${escapeHTML(order.payment_method)} (${escapeHTML(order.payment_ref || 'Verified')})</strong>
        </div>
        ${order.payment_method === 'Cash' && Number(order.cash_tendered || 0) > 0 ? `
          <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#334155;">
            <span>Cash Tendered:</span><span>${formatKES(order.cash_tendered)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:700; color:#087443;">
            <span>Change Given:</span><span>${formatKES(order.change_due || 0)}</span>
          </div>
        ` : ''}
      `}
      <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#334155; margin-top:4px;">
        <span>Fulfillment:</span><span>${handoffLabel}</span>
      </div>
    </div>

    <div style="margin-top:12px; padding-top:8px; border-top:1px dashed #94a3b8; text-align:center; font-size:0.74rem; color:#475569;">
      <div>Served by Cashier: <strong>${escapeHTML(order.cashier_name || currentUser?.full_name || 'Esther Karimi')}</strong></div>
      ${order.finance_release_status !== 'released' ? `<div style="margin-top:3px; color:#b45309; font-weight:700;">⏳ Passed to Finance for Confirmation${Number(order.balance_due || 0) > 0 ? ' (Unpaid Balance Noted)' : ''}</div>` : ''}
      <div style="margin-top:3px;">Thank you for shopping at Elight Electrical Shop — Meru County!</div>
    </div>
  `;

  openModal('cashier-receipt-modal');
}

function printCashierReceipt() {
  document.body.classList.add('printing-receipt');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-receipt');
  }, 500);
}

async function openOrderInvoiceModal(orderNo) {
  const contentEl = document.getElementById('invoice-modal-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">Loading invoice details...</div>';
  openModal('cashier-invoice-modal');

  try {
    let inv = null;
    try {
      const cleanOrderNo = String(orderNo || '').trim().replace(/^#/, '');
      const res = await fetch(`/api/cashier/orders/${encodeURIComponent(cleanOrderNo)}/invoice`);
      const data = await res.json();
      if (res.ok && data.success && data.invoice) {
        inv = data.invoice;
      } else {
        throw new Error(data.message || 'Failed to load invoice');
      }
    } catch (apiErr) {
      const upper = String(orderNo || '').trim().replace(/^#/, '').toUpperCase();
      const localMatch = (Array.isArray(cashierOrdersList) ? cashierOrdersList : []).find(o =>
        [o.order_no, o.order_number, o.payment_ref, o.receipt_no].some(v => String(v || '').trim().toUpperCase() === upper)
      );
      if (!localMatch) throw apiErr;
      inv = {
        invoice_no: localMatch.invoice_no || `INV-${String(localMatch.order_no || upper).replace(/^EL-/, '')}`,
        order_no: localMatch.order_no || orderNo,
        receipt_no: localMatch.receipt_no || '',
        customer_name: localMatch.customer_name || 'Walk-in Customer',
        customer_phone: localMatch.customer_phone || '-',
        customer_location: localMatch.customer_location || 'Meru County',
        items: (localMatch.items || []).map(it => {
          const qty = Number(it.quantity || 1);
          const unit = Number(it.unit_price ?? it.selling_price ?? 0);
          return { ...it, quantity: qty, unit_price: unit, total: qty * unit };
        }),
        subtotal: localMatch.subtotal || localMatch.total_amount,
        delivery_fee: localMatch.delivery_fee || 0,
        installation_fee: localMatch.installation_fee || 0,
        total_amount: localMatch.total_amount,
        amount_paid: localMatch.amount_paid !== undefined ? localMatch.amount_paid : (localMatch.payment_status === 'paid' ? localMatch.total_amount : 0),
        balance_due: localMatch.balance_due || 0,
        payment_status: localMatch.payment_status || 'unpaid',
        payment_method: localMatch.payment_method || 'M-Pesa / Cash',
        payment_ref: localMatch.payment_ref || (localMatch.payment_status === 'paid' ? 'Verified' : 'Pending'),
        order_status: localMatch.order_status || 'processing',
        delivery_status: localMatch.delivery_status || 'not_scheduled',
        installation_status: localMatch.installation_status || 'not_requested',
        fulfillment_mode: localMatch.fulfillment_mode || (localMatch.fulfillment_type === 'product_delivery' ? 'delivery' : 'collection'),
        created_at: localMatch.created_at || new Date().toISOString()
      };
    }
    const itemsHtml = (inv.items || []).map((it, idx) => `
      <tr>
        <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0; text-align:center; color:#64748b;">${idx + 1}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0;">
          <strong>${escapeHTML(it.product_name)}</strong>
        </td>
        <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0; text-align:center;">${it.quantity}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0; text-align:right;">${formatKES(it.unit_price)}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:700;">${formatKES(it.total)}</td>
      </tr>
    `).join('');

    contentEl.innerHTML = `
      <div style="font-family:system-ui, -apple-system, sans-serif; color:#0f172a; line-height:1.5;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:16px; margin-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:#1d4ed8; color:#fff; border:2px solid #f59e0b; font-weight:900; font-size:1.1rem;">E</div>
              <h2 style="margin:0; font-size:1.35rem; color:#0f172a;">ELIGHT ELECTRICAL SHOP</h2>
            </div>
            <div style="font-size:0.83rem; color:#475569; margin-top:4px;">
              Meru Town Main Branch, Tom Mboya Street, Meru County<br>
              Phone: +254 700 000 000 | PIN: P051234567Z
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.3rem; font-weight:900; color:#1e3a8a;">SALES INVOICE</div>
            <div style="font-size:0.92rem; font-weight:700; color:#0f172a; margin-top:2px;">Invoice #: <code>${escapeHTML(inv.invoice_no)}</code></div>
            <div style="font-size:0.82rem; color:#475569;">Order #: <code>${escapeHTML(inv.order_no)}</code></div>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">Date: ${formatActivityTime(inv.created_at)}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; margin-bottom:16px;">
          <div>
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:800; color:#64748b; margin-bottom:4px;">Billed To:</div>
            <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${escapeHTML(inv.customer_name || 'Walk-in Customer')}</div>
            <div style="font-size:0.83rem; color:#475569;">Phone: ${escapeHTML(inv.customer_phone || '-')}</div>
            <div style="font-size:0.83rem; color:#475569;">Location: ${escapeHTML(inv.customer_location || 'Meru County')}</div>
          </div>
          <div style="border-left:1px solid #e2e8f0; padding-left:16px;">
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:800; color:#64748b; margin-bottom:4px;">Workflow &amp; Status:</div>
            <div style="font-size:0.83rem;"><strong>Fulfillment:</strong> ${escapeHTML(inv.fulfillment_mode === 'delivery' ? 'Delivery to Location' : 'Counter Collection')}</div>
            <div style="font-size:0.83rem;"><strong>Payment Method:</strong> ${escapeHTML(inv.payment_method)} (${escapeHTML(inv.payment_ref || 'Pending')})</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
              <span class="badge-tag" style="background:#e0f2fe; color:#0369a1; font-size:0.72rem;">Order: ${escapeHTML(inv.order_status || 'processing')}</span>
              <span class="badge-tag" style="background:#dcfce7; color:#15803d; font-size:0.72rem;">Pay: ${escapeHTML(inv.payment_status || 'paid')}</span>
              <span class="badge-tag" style="background:#ede9fe; color:#5b21b6; font-size:0.72rem;">Deliv: ${escapeHTML(inv.delivery_status || 'not_scheduled')}</span>
              <span class="badge-tag" style="background:#fef3c7; color:#b45309; font-size:0.72rem;">Inst: ${escapeHTML(inv.installation_status || 'not_requested')}</span>
            </div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:16px; font-size:0.86rem;">
          <thead>
            <tr style="background:#0f172a; color:#fff;">
              <th style="padding:8px 10px; width:35px; text-align:center;">#</th>
              <th style="padding:8px 10px; text-align:left;">Item Description</th>
              <th style="padding:8px 10px; width:50px; text-align:center;">Qty</th>
              <th style="padding:8px 10px; width:110px; text-align:right;">Unit Price</th>
              <th style="padding:8px 10px; width:110px; text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
          <div style="width:280px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 16px;">
            <div style="display:flex; justify-content:space-between; font-size:0.86rem; margin-bottom:4px;">
              <span>Subtotal:</span>
              <span>${formatKES(inv.subtotal || inv.total_amount)}</span>
            </div>
            ${Number(inv.installation_fee || 0) > 0 ? `
              <div style="display:flex; justify-content:space-between; font-size:0.86rem; margin-bottom:4px; color:#047857;">
                <span>Installation Charge:</span>
                <span>${formatKES(inv.installation_fee)}</span>
              </div>
            ` : ''}
            <div style="display:flex; justify-content:space-between; font-size:1rem; font-weight:900; color:#0f172a; border-top:2px solid #0f172a; padding-top:6px; margin-top:4px;">
              <span>Total Payable:</span>
              <span>${formatKES(inv.total_amount)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.86rem; margin-top:4px; color:#15803d; font-weight:700;">
              <span>Amount Paid:</span>
              <span>${formatKES(inv.amount_paid)}</span>
            </div>
            ${Number(inv.balance_due || 0) > 0 ? `
              <div style="display:flex; justify-content:space-between; font-size:0.86rem; margin-top:4px; color:#dc2626; font-weight:800;">
                <span>Balance Due:</span>
                <span>${formatKES(inv.balance_due)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div style="border-top:1px dashed #cbd5e1; padding-top:10px; text-align:center; font-size:0.78rem; color:#64748b;">
          <div>Issued by Cashier Desk • Elight Electrical Shop • Quality Assured Electricals &amp; Professional Installation</div>
        </div>
      </div>
    `;
  } catch (err) {
    contentEl.innerHTML = `<div style="text-align:center; color:#dc2626; padding:24px;">Failed to load invoice: ${escapeHTML(err.message)}</div>`;
  }
}

function printInvoiceModalContent() {
  const contentEl = document.getElementById('invoice-modal-content');
  if (!contentEl) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <html>
      <head>
        <title>Sales Invoice - Elight Electrical Shop</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #0f172a; }
          .badge-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.72rem; }
        </style>
      </head>
      <body>
        ${contentEl.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

async function handleCancelCashierOrder(orderNo) {
  const reason = prompt(`Cancel Order #${orderNo}?\nPlease provide reason for cancellation:`);
  if (!reason) return;

  try {
    const res = await fetch(`/api/cashier/orders/${encodeURIComponent(orderNo)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: reason,
        actor: currentUser?.full_name || 'Cashier'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to cancel order');
    showToast(`Order #${orderNo} has been cancelled`, 'info');
    loadCashierDesk();
    if (typeof loadFinanceReleases === 'function') loadFinanceReleases();
    if (typeof loadDispatches === 'function') loadDispatches();
    if (typeof loadServiceRequests === 'function') loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// FINANCE MANAGER MODULE & TREASURY BALANCES
// ========================================================
let allFinanceRecords = [];
let currentFinanceAccountFilter = 'all';
let cachedTreasuryBalances = null;

function updateTreasuryBalancesUI(balances, prefix) {
  if (!balances) return;
  cachedTreasuryBalances = balances;

  const cashValEl = document.getElementById(`${prefix}-balance-cash`);
  const cashSubEl = document.getElementById(`${prefix}-balance-cash-sub`);
  if (cashValEl && balances.cash) {
    cashValEl.textContent = formatKES(balances.cash.balance || 0);
    if (cashSubEl) {
      cashSubEl.textContent = `In: +${formatKES(balances.cash.inflow || 0)} • Out: -${formatKES(balances.cash.outflow || 0)}`;
    }
  }

  const mpesaValEl = document.getElementById(`${prefix}-balance-mpesa`);
  const mpesaSubEl = document.getElementById(`${prefix}-balance-mpesa-sub`);
  if (mpesaValEl && balances.mpesa) {
    mpesaValEl.textContent = formatKES(balances.mpesa.balance || 0);
    if (mpesaSubEl) {
      mpesaSubEl.textContent = `In: +${formatKES(balances.mpesa.inflow || 0)} • Out: -${formatKES(balances.mpesa.outflow || 0)}`;
    }
  }

  const bankValEl = document.getElementById(`${prefix}-balance-bank`);
  const bankSubEl = document.getElementById(`${prefix}-balance-bank-sub`);
  if (bankValEl && balances.bank) {
    bankValEl.textContent = formatKES(balances.bank.balance || 0);
    if (bankSubEl) {
      bankSubEl.textContent = `In: +${formatKES(balances.bank.inflow || 0)} • Out: -${formatKES(balances.bank.outflow || 0)}`;
    }
  }

  const totalValEl = document.getElementById(`${prefix}-balance-total`);
  const totalSubEl = document.getElementById(`${prefix}-balance-total-sub`);
  if (totalValEl) {
    totalValEl.textContent = formatKES(balances.total_liquid_balance || 0);
    if (totalSubEl) {
      totalSubEl.textContent = `Net Cash, M-Pesa & Bank Liquidity`;
    }
  }
}

function filterFinanceByAccount(accountTag) {
  currentFinanceAccountFilter = accountTag || 'all';

  const buttons = document.querySelectorAll('.fin-acct-filter');
  buttons.forEach(btn => {
    btn.style.background = '#f1f5f9';
    btn.style.color = '#0f172a';
    btn.style.borderColor = '#cbd5e1';
  });

  const activeId = accountTag === 'Cash' ? 'fin-filter-cash' :
                   accountTag === 'M-Pesa' ? 'fin-filter-mpesa' :
                   accountTag === 'Bank' ? 'fin-filter-bank' : 'fin-filter-all';
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) {
    activeBtn.style.background = '#0f172a';
    activeBtn.style.color = '#fff';
    activeBtn.style.borderColor = '#0f172a';
  }

  renderFinanceRecordsTable();
}

function renderFinanceRecordsTable() {
  const tbody = document.getElementById('finance-table-body');
  if (!tbody) return;

  let filtered = allFinanceRecords;
  if (currentFinanceAccountFilter === 'Cash') {
    filtered = allFinanceRecords.filter(r => String(r.payment_method || '').toLowerCase().includes('cash'));
  } else if (currentFinanceAccountFilter === 'M-Pesa') {
    filtered = allFinanceRecords.filter(r => {
      const m = String(r.payment_method || '').toLowerCase();
      return m.includes('pesa') || m.includes('till') || m.includes('paybill') || (!m.includes('cash') && !m.includes('bank') && !m.includes('transfer'));
    });
  } else if (currentFinanceAccountFilter === 'Bank') {
    filtered = allFinanceRecords.filter(r => {
      const m = String(r.payment_method || '').toLowerCase();
      return m.includes('bank') || m.includes('transfer') || m.includes('cheque') || m.includes('eft');
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748b;">No ${currentFinanceAccountFilter === 'all' ? '' : currentFinanceAccountFilter + ' '}financial entries recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><strong>#FIN-${r.record_id}</strong></td>
      <td>
        <span class="badge-tag" style="background:${r.type === 'sale' ? '#dcfce7' : '#fee2e2'}; color:${r.type === 'sale' ? '#15803d' : '#b91c1c'}; font-weight:700;">
          ${r.type === 'sale' ? '▲ Sale (Income)' : '▼ Expense'}
        </span>
        ${r.type === 'sale' ? '<span style="display:block; font-size:0.72rem; color:#475569; margin-top:2px;">🔒 Immutable Cashier Sale</span>' : ''}
      </td>
      <td><strong>${escapeHTML(r.category)}</strong></td>
      <td>${escapeHTML(r.description)}</td>
      <td style="font-weight:700; color:${r.type === 'sale' ? 'var(--success)' : 'var(--danger)'};">
        ${r.type === 'sale' ? '+' : '-'}${formatKES(r.amount)}
      </td>
      <td>
        <span style="font-weight:600; display:inline-flex; align-items:center; gap:4px;">
          ${String(r.payment_method || '').toLowerCase().includes('cash') ? '💵' : String(r.payment_method || '').toLowerCase().includes('bank') ? '🏦' : '📱'}
          ${escapeHTML(r.payment_method)}
        </span>
      </td>
      <td><code>${escapeHTML(r.reference_no || 'N/A')}</code></td>
      <td><span class="badge-tag badge-${r.status}">${r.status}</span></td>
    </tr>
  `).join('');
}

function openAdjustBalancesModal() {
  const userRole = normalizeRole(currentUser?.role);
  if (!['admin', 'finance_manager'].includes(userRole)) {
    showToast('Access Denied: Only Administrator or Finance Manager can configure account opening balances.', 'error');
    return;
  }

  const treasury = cachedTreasuryBalances?.treasury_accounts || {};
  const cashInput = document.getElementById('opening_cash_input');
  const mpesaInput = document.getElementById('opening_mpesa_input');
  const bankInput = document.getElementById('opening_bank_input');
  const tillInput = document.getElementById('mpesa_till_input');
  const bankNameInput = document.getElementById('bank_name_input');
  const bankAccInput = document.getElementById('bank_account_no_input');

  if (cashInput) cashInput.value = treasury.opening_cash ?? 15000;
  if (mpesaInput) mpesaInput.value = treasury.opening_mpesa ?? 65000;
  if (bankInput) bankInput.value = treasury.opening_bank ?? 350000;
  if (tillInput) tillInput.value = treasury.mpesa_till || '5894210';
  if (bankNameInput) bankNameInput.value = treasury.bank_name || 'Equity Bank - Meru Branch';
  if (bankAccInput) {
    const cleanAcc = String(treasury.bank_account_no || '014028394012').replace(/[^0-9]/g, '').slice(0, 12);
    bankAccInput.value = cleanAcc || '014028394012';
  }

  openModal('adjust-balances-modal');
}

async function handleSaveOpeningBalances(e) {
  e.preventDefault();
  const userRole = normalizeRole(currentUser?.role);
  if (!['admin', 'finance_manager'].includes(userRole)) {
    showToast('Access Denied: Only Administrator or Finance Manager can update opening balances.', 'error');
    return;
  }

  const bankAccRaw = document.getElementById('bank_account_no_input')?.value.trim() || '014028394012';
  if (!/^[0-9]{1,12}$/.test(bankAccRaw)) {
    showToast('Bank account number must contain numbers only (0–9), up to 12 digits max.', 'error');
    document.getElementById('bank_account_no_input')?.focus();
    return;
  }

  const payload = {
    opening_cash: Number(document.getElementById('opening_cash_input')?.value || 0),
    opening_mpesa: Number(document.getElementById('opening_mpesa_input')?.value || 0),
    opening_bank: Number(document.getElementById('opening_bank_input')?.value || 0),
    mpesa_till: document.getElementById('mpesa_till_input')?.value.trim() || '5894210',
    bank_name: document.getElementById('bank_name_input')?.value.trim() || 'Equity Bank - Meru Branch',
    bank_account_no: bankAccRaw,
    user_role: currentUser?.role || 'admin',
    actor: currentUser?.full_name || 'Administrator'
  };

  try {
    const res = await fetch('/api/finance/balances/opening', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': currentUser?.role || 'admin'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update opening balances');

    closeModal('adjust-balances-modal');
    showToast('Treasury account opening balances updated successfully.', 'success');

    if (data.balances) {
      updateTreasuryBalancesUI(data.balances, 'dash');
      updateTreasuryBalancesUI(data.balances, 'fin');
    }
    loadOverviewKPIs();
    loadFinanceRecords();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadFinanceRecords() {
  const tbody = document.getElementById('finance-table-body');
  try {
    const [recRes, sumRes] = await Promise.all([
      fetch('/api/finance/records').then(r => r.json()),
      fetch('/api/finance/summary').then(r => r.json())
    ]);

    const records = recRes.records || [];
    allFinanceRecords = records;

    if (sumRes.success) {
      document.getElementById('fin-total-sales').textContent = formatKES(sumRes.summary.totalSales);
      document.getElementById('fin-total-expenses').textContent = formatKES(sumRes.summary.totalExpenses);
      const net = sumRes.summary.netProfit;
      const netEl = document.getElementById('fin-net-profit');
      netEl.textContent = formatKES(net);
      netEl.style.color = net >= 0 ? '#087443' : '#dc2626';

      if (sumRes.balances) {
        updateTreasuryBalancesUI(sumRes.balances, 'fin');
      }
    }

    // Refresh pending releases banner on finance dashboard
    fetch('/api/finance/pending-releases')
      .then(r => r.json())
      .then(relData => {
        if (relData && relData.success && relData.counts) {
          const dashCredit = document.getElementById('fin-dash-pending-credit-count');
          if (dashCredit) dashCredit.textContent = relData.counts.pending_credit_review || 0;
          const dashFull = document.getElementById('fin-dash-pending-full-count');
          if (dashFull) dashFull.textContent = relData.counts.pending_finance || 0;
          const dashRec = document.getElementById('fin-dash-receivables-amount');
          if (dashRec) dashRec.textContent = formatKES(relData.counts.total_receivable || 0);
        }
      })
      .catch(() => {});

    renderFinanceRecordsTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">${err.message}</td></tr>`;
  }
}

async function handleCreateFinanceRecord(e) {
  e.preventDefault();
  const rawType = String(document.getElementById('fin_type').value || '').trim().toLowerCase();

  // Governance rule: Completed sales records are immutable and cannot be created or altered manually
  if (rawType === 'sale' || rawType === 'income') {
    showToast('Governance Restriction: The Finance Manager can view financial records and record expenses/disbursements, but cannot alter or create completed sales. Sales records originate strictly from Cashier checkout.', 'error');
    return;
  }

  const payMethod = document.getElementById('fin_payment').value;
  const rawRef = document.getElementById('fin_ref').value.trim();
  const refCheck = validatePaymentRefClient(payMethod, rawRef, { required: false, label: 'Reference code' });
  if (!refCheck.valid) {
    showToast(refCheck.message, 'error');
    document.getElementById('fin_ref')?.focus();
    return;
  }

  const payload = {
    type: rawType || 'expense',
    category: document.getElementById('fin_category').value,
    description: document.getElementById('fin_desc').value.trim(),
    amount: document.getElementById('fin_amount').value,
    payment_method: payMethod,
    reference_no: refCheck.value,
    cashier_name: (currentUser && currentUser.full_name) ? currentUser.full_name : 'Alice Muthoni',
    user_role: currentUser?.role || 'finance_manager'
  };

  try {
    const res = await fetch('/api/finance/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const resData = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(resData.message || 'Failed to record financial entry');
    closeModal('finance-modal');
    showToast('Financial record saved', 'success');
    loadFinanceRecords();
    loadOverviewKPIs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// FINANCE ORDER RELEASES & CREDIT POLICY DESK (5 FULFILLMENT PIPELINES)
// ========================================================
let allFinanceReleases = [];
let currentFinanceReleasesFilter = 'pending_credit';

async function loadFinanceReleases() {
  const tbody = document.getElementById('fin-releases-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">Loading order release queue...</td></tr>';
  }
  try {
    const res = await fetch('/api/finance/pending-releases');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load pending releases');

    allFinanceReleases = data.orders || [];
    const counts = data.counts || {};

    const elCredit = document.getElementById('fin-releases-kpi-credit');
    if (elCredit) elCredit.textContent = counts.pending_credit_review || 0;

    const elFull = document.getElementById('fin-releases-kpi-full');
    if (elFull) elFull.textContent = counts.pending_finance || 0;

    const elRec = document.getElementById('fin-releases-kpi-receivable');
    if (elRec) elRec.textContent = formatKES(counts.total_receivable || 0);

    const elRel = document.getElementById('fin-releases-kpi-released');
    if (elRel) elRel.textContent = counts.released || 0;

    // Synchronize dashboard banner counts
    const dashCredit = document.getElementById('fin-dash-pending-credit-count');
    if (dashCredit) dashCredit.textContent = counts.pending_credit_review || 0;
    const dashFull = document.getElementById('fin-dash-pending-full-count');
    if (dashFull) dashFull.textContent = counts.pending_finance || 0;
    const dashRec = document.getElementById('fin-dash-receivables-amount');
    if (dashRec) dashRec.textContent = formatKES(counts.total_receivable || 0);

    renderFinanceReleasesTable();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#dc2626; padding:24px;">Failed to load order releases: ${escapeHTML(err.message)}</td></tr>`;
    }
  }
}

function filterFinanceReleases(filter) {
  const filterSelect = document.getElementById('fin-releases-filter');
  if (filterSelect && filter) {
    filterSelect.value = filter;
  }
  renderFinanceReleasesTable();
}

function renderFinanceReleasesTable() {
  const tbody = document.getElementById('fin-releases-tbody');
  if (!tbody) return;

  const filter = document.getElementById('fin-releases-filter')?.value || 'all_pending';
  const query = (document.getElementById('fin-releases-search')?.value || '').toLowerCase().trim();

  let list = [...allFinanceReleases];

  if (filter === 'pending_credit') {
    list = list.filter(o => o.finance_release_status === 'pending_credit_review' || (o.finance_release_status === 'pending_finance' && o.unpaid_balance));
  } else if (filter === 'pending_full') {
    list = list.filter(o => o.finance_release_status === 'pending_finance' && !o.unpaid_balance);
  } else if (filter === 'all_pending') {
    list = list.filter(o => o.finance_release_status === 'pending_finance' || o.finance_release_status === 'pending_credit_review');
  } else if (filter === 'released') {
    list = list.filter(o => o.finance_release_status === 'released');
  } else if (filter === 'credit_hold') {
    list = list.filter(o => o.finance_release_status === 'credit_hold');
  }

  if (query) {
    list = list.filter(o =>
      String(o.order_number || '').toLowerCase().includes(query) ||
      String(o.customer_name || '').toLowerCase().includes(query) ||
      String(o.customer_phone || '').toLowerCase().includes(query) ||
      String(o.payment_reference || '').toLowerCase().includes(query) ||
      String(o.credit_policy_notes || '').toLowerCase().includes(query)
    );
  }

  const badgeEl = document.getElementById('fin-releases-badge');
  if (badgeEl) {
    badgeEl.textContent = `Showing ${list.length} of ${allFinanceReleases.length} orders`;
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:#64748b;">No orders found matching the selected filter.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(order => {
    const isReleased = order.finance_release_status === 'released';
    const isHold = order.finance_release_status === 'credit_hold';
    const isPendingCredit = order.finance_release_status === 'pending_credit_review' || (order.unpaid_balance && !isReleased && !isHold);

    let releaseBadge = '';
    if (isReleased) {
      releaseBadge = '<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">✅ Released by Finance</span>';
    } else if (isHold) {
      releaseBadge = '<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">🛑 Credit Hold</span>';
    } else if (isPendingCredit) {
      releaseBadge = '<span class="badge" style="background:#fef3c7; color:#b45309; font-weight:700;">🛡️ Credit Policy Review</span>';
    } else {
      releaseBadge = '<span class="badge" style="background:#dbeafe; color:#1d4ed8; font-weight:700;">⏳ Pending Payment Verification</span>';
    }

    let policyDisplay = '';
    if (order.unpaid_balance || Number(order.balance_due || 0) > 0) {
      const noteText = order.credit_policy_notes || order.balance_note || '';
      policyDisplay = `
        <div style="font-size:0.8rem; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:6px 8px; margin-top:4px;">
          <div style="color:#b91c1c; font-weight:800;">⚠️ Customer Has Balance: ${formatKES(order.balance_due || 0)}</div>
          <div style="color:#475569; margin-top:2px;">${noteText ? escapeHTML(noteText) : 'Flagged by Cashier — Awaiting Finance credit terms &amp; confirmation'}</div>
        </div>
      `;
    } else {
      policyDisplay = `<span style="font-size:0.8rem; color:#16a34a; font-weight:600;">Full Payment Settled — Passed by Cashier</span>`;
    }

    let actionButtons = '';
    if (!isReleased) {
      if (order.balance_due > 0) {
        actionButtons = `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <button class="btn-sm" style="background:#b45309; color:#fff; font-weight:700; padding:5px 9px;" onclick="openCreditReviewModal('${order.order_number}', 'credit')">🛡️ Review Credit &amp; Release</button>
            <button class="btn-sm" style="background:#047857; color:#fff; font-weight:600; padding:5px 9px;" onclick="openCreditReviewModal('${order.order_number}', 'balance')">💵 Receive Balance</button>
          </div>
        `;
      } else {
        actionButtons = `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <button class="btn-sm" style="background:#16a34a; color:#fff; font-weight:700; padding:6px 12px;" onclick="verifyAndReleaseFullOrder('${order.order_number}')">✅ Verify &amp; Release</button>
            <button class="btn-sm" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:4px 8px; font-size:0.75rem;" onclick="openCreditReviewModal('${order.order_number}', 'credit')">Options / Hold</button>
          </div>
        `;
      }
    } else {
      if (order.balance_due > 0) {
        actionButtons = `
          <button class="btn-sm" style="background:#047857; color:#fff; font-weight:600; padding:5px 9px;" onclick="openCreditReviewModal('${order.order_number}', 'balance')">💵 Receive Balance</button>
        `;
      } else {
        actionButtons = `<span style="font-size:0.8rem; color:#16a34a; font-weight:700;">✅ Released to ${order.fulfillment_type === 'product_collection' ? 'Collection Counter' : 'Dispatch'}</span>`;
      }
    }

    return `
      <tr>
        <td>
          <strong style="color:#0f172a; font-size:0.92rem;">#${escapeHTML(order.order_number)}</strong>
          <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">${formatActivityTime(order.created_at)}</div>
          <div style="font-size:0.76rem; color:#475569;">Cashier: <strong>${escapeHTML(order.cashier_name || 'Counter')}</strong></div>
        </td>
        <td>
          <div style="font-weight:700; color:#1e293b;">${escapeHTML(order.customer_name || 'Walk-in')}</div>
          <div style="font-size:0.8rem; color:#64748b;">${escapeHTML(order.customer_phone || '-')}</div>
          <div style="margin-top:6px;">${renderFulfillmentBadge(order)}</div>
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:5px;">
            <span class="badge-tag" style="background:${order.delivery_status === 'delivered' ? '#dcfce7' : (order.delivery_status === 'failed' ? '#fee2e2' : '#e0f2fe')}; color:${order.delivery_status === 'delivered' ? '#15803d' : (order.delivery_status === 'failed' ? '#b91c1c' : '#0369a1')}; font-size:0.68rem; font-weight:700;">
              Deliv: <strong>${escapeHTML(order.delivery_status || 'not_scheduled')}</strong>
            </span>
            <span class="badge-tag" style="background:${order.installation_status === 'completed' ? '#dcfce7' : (order.installation_status === 'not_requested' ? '#f1f5f9' : '#f3e8ff')}; color:${order.installation_status === 'completed' ? '#15803d' : (order.installation_status === 'not_requested' ? '#64748b' : '#6b21a8')}; font-size:0.68rem; font-weight:700;">
              Inst: <strong>${escapeHTML(order.installation_status || 'not_requested')}</strong>
            </span>
          </div>
        </td>
        <td>
          <div>Total: <strong>${formatKES(order.total_amount)}</strong></div>
          <div style="font-size:0.82rem; color:#16a34a;">Paid: <strong>${formatKES(order.amount_paid)}</strong></div>
          ${order.balance_due > 0
            ? `<div style="font-size:0.82rem; color:#dc2626; font-weight:800; background:#fef2f2; padding:2px 6px; border-radius:4px; display:inline-block; margin-top:2px;">Due: ${formatKES(order.balance_due)}</div>`
            : `<div style="font-size:0.8rem; color:#16a34a; font-weight:600;">Fully Settled</div>`
          }
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Method: ${escapeHTML(order.payment_method || '-')}</div>
        </td>
        <td style="max-width:260px;">
          ${policyDisplay}
        </td>
        <td>
          ${releaseBadge}
          <div style="font-size:0.78rem; color:#64748b; margin-top:4px;">
            Stage: <strong style="color:#0f172a;">${escapeHTML(order.fulfillment_stage || 'finance')}</strong>
          </div>
          ${order.finance_released_by ? `<div style="font-size:0.72rem; color:#475569; margin-top:2px;">By: ${escapeHTML(order.finance_released_by)}</div>` : ''}
        </td>
        <td style="white-space:nowrap;">
          ${actionButtons}
        </td>
      </tr>
    `;
  }).join('');
}

function openCreditReviewModal(orderNo, mode = 'credit') {
  const order = allFinanceReleases.find(o => o.order_number === orderNo);
  if (!order) {
    showToast('Order not found', 'error');
    return;
  }

  document.getElementById('fin_credit_order_no').value = order.order_number;
  const policyPanel = document.getElementById('fin_credit_policy_panel');
  const balPanel = document.getElementById('fin_balance_payment_panel');
  const submitBtn = document.getElementById('fin_credit_submit_btn');
  const titleEl = document.getElementById('fin_credit_modal_title');
  const actionInput = document.getElementById('fin_credit_action');

  // Hydrate summary
  const summaryEl = document.getElementById('fin_credit_order_summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:800; font-size:1.02rem; color:#0f172a;">Order #${escapeHTML(order.order_number)}</span>
        <span style="font-size:0.8rem; color:#64748b;">${formatActivityTime(order.created_at)}</span>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; font-size:0.85rem;">
        <div>Customer: <strong>${escapeHTML(order.customer_name || 'Walk-in')}</strong> (${escapeHTML(order.customer_phone || '-')})</div>
        <div>Total Sale: <strong>${formatKES(order.total_amount)}</strong></div>
        <div>Amount Paid: <strong style="color:#16a34a;">${formatKES(order.amount_paid)}</strong></div>
        <div>Balance Due: <strong style="color:${order.balance_due > 0 ? '#dc2626' : '#16a34a'};">${formatKES(order.balance_due)}</strong></div>
      </div>
      <div style="margin-top:8px;">${renderFulfillmentBadge(order)}</div>
    `;
  }

  if (mode === 'balance') {
    if (titleEl) titleEl.innerHTML = '💵 Receive Outstanding Balance Payment';
    actionInput.value = 'record_balance_payment';
    policyPanel.style.display = 'none';
    balPanel.style.display = 'block';
    document.getElementById('fin_balance_amount').value = Math.max(0, order.balance_due || 0);
    document.getElementById('fin_balance_ref').value = '';
    syncFinanceBalanceRefRules();
    submitBtn.textContent = '💵 Record Payment & Release Order';
    submitBtn.style.background = '#047857';
  } else {
    if (titleEl) titleEl.innerHTML = '🛡️ Finance Credit &amp; Payment Policy Review';
    actionInput.value = 'release';
    policyPanel.style.display = 'block';
    balPanel.style.display = 'none';
    document.getElementById('fin_credit_policy_type').value = order.credit_policy_type || 'Approved 30-Day Trade Credit';
    document.getElementById('fin_credit_notes').value = order.credit_policy_notes || '';
    submitBtn.textContent = order.balance_due > 0 ? '✅ Approve Credit Policy & Release Order' : '✅ Verify Payment & Release Order';
    submitBtn.style.background = '#16a34a';
  }

  openModal('finance-credit-modal');
}

async function handleFinanceReleaseSubmit(e) {
  e.preventDefault();
  const orderNo = document.getElementById('fin_credit_order_no').value;
  const action = document.getElementById('fin_credit_action').value || 'release';
  const order = allFinanceReleases.find(o => o.order_number === orderNo);

  const payload = {
    action,
    cashier_name: (currentUser && currentUser.full_name) ? currentUser.full_name : 'Alice Muthoni'
  };

  if (action === 'record_balance_payment') {
    const amount = Number(document.getElementById('fin_balance_amount').value);
    const method = document.getElementById('fin_balance_method').value;
    const ref = document.getElementById('fin_balance_ref').value.trim();

    if (!amount || amount <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }
    if (!ref) {
      showToast('Please enter transaction reference code', 'error');
      document.getElementById('fin_balance_ref')?.focus();
      return;
    }
    const balRefCheck = validatePaymentRefClient(method, ref, { required: true, label: 'Transaction reference' });
    if (!balRefCheck.valid) {
      showToast(balRefCheck.message, 'error');
      document.getElementById('fin_balance_ref')?.focus();
      return;
    }
    payload.amount = amount;
    payload.payment_method = method;
    payload.reference_no = balRefCheck.value;
  } else {
    // Release with credit policy
    const policyType = document.getElementById('fin_credit_policy_type').value;
    const notes = document.getElementById('fin_credit_notes').value.trim();

    if (order && order.balance_due > 0 && !notes) {
      showToast('Rule 5 Requirement: Finance must document Credit/Payment Policy notes before releasing an order with an unpaid balance.', 'error');
      return;
    }

    payload.credit_policy_type = policyType;
    payload.credit_notes = notes;
  }

  try {
    const res = await fetch(`/api/finance/orders/${encodeURIComponent(orderNo)}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Failed to release order');
    }

    closeModal('finance-credit-modal');
    showToast(result.message || 'Order successfully processed by Finance', 'success');
    await loadFinanceReleases();
    if (typeof loadFinanceRecords === 'function') loadFinanceRecords();
    if (typeof loadCashierOrders === 'function') loadCashierOrders();
    if (typeof loadDispatches === 'function') loadDispatches();
    if (typeof loadServiceRequests === 'function') loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleFinanceCreditHold() {
  const orderNo = document.getElementById('fin_credit_order_no').value;
  const notes = document.getElementById('fin_credit_notes').value.trim();

  if (!notes) {
    showToast('Please enter reason for credit hold in notes field', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to place Order #${orderNo} on Credit Hold? This will block release until credit terms are resolved.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/finance/orders/${encodeURIComponent(orderNo)}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reject',
        credit_notes: notes,
        cashier_name: (currentUser && currentUser.full_name) ? currentUser.full_name : 'Alice Muthoni'
      })
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to place on hold');

    closeModal('finance-credit-modal');
    showToast(`Order #${orderNo} placed on Credit Hold`, 'warning');
    await loadFinanceReleases();
    if (typeof loadCashierOrders === 'function') loadCashierOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function verifyAndReleaseFullOrder(orderNo) {
  if (!confirm(`Confirm Finance verification and release for Order #${orderNo}?\nGoods will immediately route to the designated fulfillment pipeline.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/finance/orders/${encodeURIComponent(orderNo)}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'release',
        cashier_name: (currentUser && currentUser.full_name) ? currentUser.full_name : 'Alice Muthoni'
      })
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to release order');

    showToast(result.message || `Order #${orderNo} verified and released!`, 'success');
    await loadFinanceReleases();
    if (typeof loadCashierOrders === 'function') loadCashierOrders();
    if (typeof loadDispatches === 'function') loadDispatches();
    if (typeof loadServiceRequests === 'function') loadServiceRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleFinanceFlagFailedPayment() {
  const orderNo = document.getElementById('fin_credit_order_no').value;
  const reason = prompt(`Enter reason why payment for Order #${orderNo} failed or is unmatched:`);
  if (!reason) return;

  try {
    const res = await fetch(`/api/finance/orders/${encodeURIComponent(orderNo)}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'flag_failed',
        reason: reason,
        cashier_name: (currentUser && currentUser.full_name) ? currentUser.full_name : 'Alice Muthoni'
      })
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to flag payment');

    closeModal('finance-credit-modal');
    showToast(`Order #${orderNo} marked as payment failed and returned to Cashier`, 'warning');
    await loadFinanceReleases();
    if (typeof loadCashierOrders === 'function') loadCashierOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// DISPATCH & DRIVER MODULES
// ========================================================
async function loadDispatches() {
  const tbody = document.getElementById('dispatch-table-body');
  try {
    const [dispRes, usersRes] = await Promise.all([
      fetch('/api/dispatches').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json())
    ]);

    const dispatches = dispRes.dispatches || [];
    const drivers = (usersRes.users || []).filter(u => u.role === 'driver');

    // Populate driver select in modal
    const driverSelect = document.getElementById('disp_driver');
    if (driverSelect) {
      driverSelect.innerHTML = `<option value="Unassigned">Unassigned</option>` + drivers.map(d => 
        `<option value="${escapeHTML(d.full_name)}">${escapeHTML(d.full_name)}</option>`
      ).join('');
    }

    if (dispatches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No dispatches scheduled.</td></tr>';
      return;
    }

    tbody.innerHTML = dispatches.map(d => `
      <tr>
        <td><strong>#DSP-${d.dispatch_id}</strong></td>
        <td><code>${escapeHTML(d.order_no)}</code></td>
        <td>
          <strong>${escapeHTML(d.customer_name)}</strong><br>
          <small>${escapeHTML(d.customer_phone)}</small>
        </td>
        <td>${escapeHTML(d.delivery_address)}</td>
        <td><strong>🚗 ${escapeHTML(d.driver_name || 'Unassigned')}</strong></td>
        <td>
          <div>${d.scheduled_date || 'N/A'}</div>
          <div style="margin-top:4px;">
            <button class="btn-sm" style="background:${d.packing_status === 'ready' ? '#dcfce7' : '#fef3c7'}; color:${d.packing_status === 'ready' ? '#15803d' : '#b45309'}; border:1px solid ${d.packing_status === 'ready' ? '#86efac' : '#fde68a'}; font-weight:700; font-size:0.72rem; padding:2px 6px;" onclick="togglePackingReadiness(${d.dispatch_id}, '${d.packing_status || 'pending'}')">
              ${d.packing_status === 'ready' ? '📦 Ready' : '⏳ Pack Items'}
            </button>
          </div>
        </td>
        <td>
          <span class="badge-tag badge-${d.status}">${d.status}</span>
          ${d.status === 'failed' ? `
            <div style="margin-top:4px;">
              <button class="btn-sm" style="background:#1e3a8a; color:#fff; font-weight:700; font-size:0.72rem; padding:3px 6px;" onclick="openRescheduleModal(${d.dispatch_id})">
                📅 Reschedule
              </button>
            </div>
          ` : ''}
        </td>
        <td>
          <small>${escapeHTML(d.driver_notes || '-')}</small>
          ${d.delivery_failed_reason ? `<div style="font-size:0.72rem; color:#dc2626; margin-top:2px; font-weight:700;">⚠️ ${escapeHTML(d.delivery_failed_reason)}</div>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">${err.message}</td></tr>`;
  }
}

async function togglePackingReadiness(dispatchId, currentStatus) {
  const nextStatus = currentStatus === 'ready' ? 'pending' : 'ready';
  try {
    const res = await fetch(`/api/dispatches/${dispatchId}/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packing_status: nextStatus })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update packing status');
    showToast(`Dispatch #${dispatchId} packing marked as ${nextStatus}`, 'success');
    loadDispatches();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openRescheduleModal(dispatchId) {
  const idInput = document.getElementById('reschedule_dispatch_id');
  if (idInput) idInput.value = dispatchId;
  const dateInput = document.getElementById('reschedule_new_date');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = tomorrow.toISOString().slice(0, 10);
  }
  openModal('dispatch-reschedule-modal');
}

async function handleDispatchRescheduleSubmit(e) {
  e.preventDefault();
  const dispatchId = document.getElementById('reschedule_dispatch_id').value;
  const newDate = document.getElementById('reschedule_new_date').value;
  const reasonSelect = document.getElementById('reschedule_reason_select')?.value || 'Customer Request';
  const notes = document.getElementById('reschedule_notes')?.value.trim() || '';
  const reason = notes ? `${reasonSelect} - ${notes}` : reasonSelect;

  try {
    const res = await fetch(`/api/dispatches/${dispatchId}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_date: newDate,
        reason: reason,
        actor: currentUser?.full_name || 'Dispatch Manager'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to reschedule dispatch');
    closeModal('dispatch-reschedule-modal');
    showToast(`Dispatch #${dispatchId} rescheduled to ${newDate}`, 'success');
    loadDispatches();
    if (typeof loadDriverDeliveries === 'function') loadDriverDeliveries();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleCreateDispatch(e) {
  e.preventDefault();
  const payload = {
    order_no: document.getElementById('disp_order_no').value.trim(),
    customer_name: document.getElementById('disp_cust_name').value.trim(),
    customer_phone: document.getElementById('disp_cust_phone').value.trim(),
    delivery_address: document.getElementById('disp_address').value.trim(),
    driver_name: document.getElementById('disp_driver').value,
    driver_notes: document.getElementById('disp_notes').value.trim()
  };

  try {
    const res = await fetch('/api/dispatches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Dispatch creation failed');
    closeModal('dispatch-modal');
    showToast('Dispatch scheduled', 'success');
    loadDispatches();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Driver Run Sheet View
async function loadDriverDeliveries() {
  const container = document.getElementById('driver-run-sheet');
  try {
    const isDriverRole = normalizeRole(currentUser?.role) === 'driver';
    let url = '/api/dispatches';
    if (isDriverRole && currentUser) {
      const qParams = new URLSearchParams();
      if (currentUser.full_name) qParams.set('driver', currentUser.full_name);
      else if (currentUser.username) qParams.set('driver', currentUser.username);
      url += `?${qParams.toString()}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    let runs = data.dispatches || [];

    // Strictly enforce that a Driver should only see deliveries assigned to them
    if (isDriverRole && currentUser) {
      const driverNameLower = String(currentUser.full_name || currentUser.username || '').toLowerCase();
      runs = runs.filter(r => {
        const dName = String(r.driver_name || '').toLowerCase();
        return driverNameLower && (dName.includes(driverNameLower) || driverNameLower.includes(dName));
      });
    }

    if (runs.length === 0) {
      const dName = currentUser?.full_name || 'Driver';
      container.innerHTML = `<p style="color:var(--text-muted); padding:16px;">No delivery runs currently assigned to you (${escapeHTML(dName)}). Deliveries scheduled by the Dispatch Manager will appear here.</p>`;
      return;
    }

    container.innerHTML = runs.map(r => `
      <div class="metric-card" style="border-top:4px solid ${r.status === 'delivered' ? '#087443' : '#b45309'};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:700; color:var(--primary);">Order #${escapeHTML(r.order_no)}</span>
          <span class="badge-tag badge-${r.status}">${r.status}</span>
        </div>
        <h4 style="font-size:1.05rem; margin-bottom:4px;">👤 ${escapeHTML(r.customer_name)}</h4>
        <p style="font-size:0.85rem; color:#4b5563; margin-bottom:8px;">
          📞 <strong>Phone:</strong> <a href="tel:${escapeHTML(r.customer_phone)}">${escapeHTML(r.customer_phone)}</a><br>
          📍 <strong>Destination:</strong> ${escapeHTML(r.delivery_address)}
        </p>
        <p style="font-size:0.85rem; background:#f8fafc; padding:8px; border-radius:4px; margin-bottom:12px;">
          <strong>Notes:</strong> ${escapeHTML(r.driver_notes || 'Contact customer upon arrival')}
        </p>
        <div style="display:flex; gap:8px;">
          <button class="btn-sm" style="background:#fef3c7; color:#b45309;" onclick="updateDispatchStatus(${r.dispatch_id}, 'out_for_delivery')">🚚 In Transit</button>
          <button class="btn-sm" style="background:#dcfce7; color:#15803d;" onclick="updateDispatchStatus(${r.dispatch_id}, 'delivered')">✓ Delivered</button>
          <button class="btn-sm" style="background:#fee2e2; color:#b91c1c;" onclick="openDriverFailureModal(${r.dispatch_id})">✕ Failed</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:red;">${err.message}</p>`;
  }
}

function openDriverFailureModal(dispatchId) {
  const input = document.getElementById('driver_fail_dispatch_id');
  if (input) input.value = dispatchId;
  const notes = document.getElementById('driver_fail_notes');
  if (notes) notes.value = '';
  openModal('driver-failure-modal');
}

async function handleDriverFailureSubmit(e) {
  e.preventDefault();
  const dispatchId = document.getElementById('driver_fail_dispatch_id').value;
  const reasonSelect = document.getElementById('driver_fail_reason')?.value || 'Customer Unavailable';
  const notes = document.getElementById('driver_fail_notes')?.value.trim() || '';
  const fullReason = notes ? `${reasonSelect} - ${notes}` : reasonSelect;

  try {
    const res = await fetch(`/api/dispatches/${dispatchId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'failed',
        failure_reason: fullReason
      })
    });
    if (!res.ok) throw new Error('Failed to record delivery failure');
    closeModal('driver-failure-modal');
    showToast(`Delivery failure logged for run #${dispatchId}`, 'warning');
    loadDriverDeliveries();
    if (typeof loadDispatches === 'function') loadDispatches();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateDispatchStatus(id, status) {
  try {
    const res = await fetch(`/api/dispatches/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Status update failed');
    showToast(`Dispatch #${id} marked as ${status}`, 'success');
    loadDriverDeliveries();
    if (typeof loadDispatches === 'function') loadDispatches();
    if (typeof loadCashierOrders === 'function') loadCashierOrders();
    if (typeof loadCustomerCareDesk === 'function') loadCustomerCareDesk();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// INVENTORY MANAGER MODULE
// ========================================================
async function loadInventoryAndMovements() {
  const invBody = document.getElementById('inventory-table-body');
  const movBody = document.getElementById('movements-table-body');

  try {
    const [invRes, movRes] = await Promise.all([
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/inventory/movements').then(r => r.json())
    ]);

    allInventory = invRes.products || [];
    const movements = movRes.movements || [];

    // Populate product select for stock movement modal
    const moveProdSelect = document.getElementById('move_product_select');
    if (moveProdSelect) {
      moveProdSelect.innerHTML = allInventory.map(p => 
        `<option value="${p.product_id}">${escapeHTML(p.product_name)} (Current Stock: ${p.quantity_in_stock})</option>`
      ).join('');
    }

    // Inventory Table (filtered via live search bar)
    renderErpInventoryTable();

    // Stock Movements Table
    if (movBody) {
      if (movements.length === 0) {
        movBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No stock movements logged.</td></tr>';
      } else {
        movBody.innerHTML = movements.map(m => `
          <tr>
            <td><strong>#MOV-${m.movement_id}</strong></td>
            <td><strong>${escapeHTML(m.product_name)}</strong></td>
            <td>
              <span class="badge-tag" style="background:${m.type === 'STOCK_IN' ? '#dcfce7' : '#fee2e2'}; color:${m.type === 'STOCK_IN' ? '#15803d' : '#b91c1c'};">
                ${m.type}
              </span>
            </td>
            <td><strong>${m.type === 'STOCK_IN' ? '+' : '-'}${m.quantity}</strong></td>
            <td><small>${escapeHTML(m.reason || '-')}</small></td>
            <td>${escapeHTML(m.recorded_by || 'Staff')}</td>
            <td><small>${new Date(m.created_at).toLocaleDateString()}</small></td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function renderErpInventoryTable() {
  const invBody = document.getElementById('inventory-table-body');
  const countSpan = document.getElementById('erp-inv-count');
  const searchInput = document.getElementById('erp-inv-search');
  const stockSelect = document.getElementById('erp-inv-stock-filter');
  if (!invBody) return;

  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const tokens = query.split(/\s+/).filter(Boolean);
  const statusFilter = stockSelect ? stockSelect.value : 'all';

  const filtered = allInventory.filter(item => {
    const stock = Number(item.quantity_in_stock || 0);
    const reorder = Number(item.reorder_level || 5);

    if (statusFilter === 'in-stock' && stock <= 0) return false;
    if (statusFilter === 'low-stock' && (stock <= 0 || stock > reorder)) return false;
    if (statusFilter === 'out-of-stock' && stock > 0) return false;

    if (tokens.length > 0) {
      const hay = `${item.product_name || ''} ${item.category_name || ''} #${item.product_id} ${item.product_id}`.toLowerCase();
      if (!tokens.every(tok => hay.includes(tok))) return false;
    }
    return true;
  });

  if (countSpan) countSpan.textContent = filtered.length;

  if (filtered.length === 0) {
    invBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">No matching inventory products found.</td></tr>';
    return;
  }

  invBody.innerHTML = filtered.map(item => {
    const stock = Number(item.quantity_in_stock || 0);
    const reorder = Number(item.reorder_level || 5);
    const buy = Number(item.buying_price || 0);
    const sell = Number(item.selling_price || 0);
    const margin = buy > 0 ? (((sell - buy) / buy) * 100).toFixed(0) + '%' : 'N/A';

    let statusBadge = '<span class="badge-tag badge-active">In Stock</span>';
    if (stock <= 0) statusBadge = '<span class="badge-tag badge-failed">Out of Stock</span>';
    else if (stock <= reorder) statusBadge = '<span class="badge-tag badge-pending">Low Stock</span>';

    return `
      <tr>
        <td><strong>#${item.product_id}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${escapeHTML(item.image_url || 'images/bulb.jpg')}" style="width:36px; height:36px; object-fit:contain; border-radius:4px; background:#f8fafc; border:1px solid #e2e8f0;">
            <div>
              <div style="font-weight:600;">${escapeHTML(item.product_name)}</div>
              <small style="color:var(--text-muted);">${escapeHTML(item.category_name || 'General')}</small>
            </div>
          </div>
        </td>
        <td>${formatKES(buy)}</td>
        <td style="font-weight:700; color:var(--success);">${formatKES(sell)}</td>
        <td><small style="color:#2563eb; font-weight:700;">${margin}</small></td>
        <td>
          <span style="font-weight:700; min-width:24px; display:inline-block; text-align:center;">${stock}</span>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-primary" onclick="openEditProductModal(${item.product_id})">Edit</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function quickAdjustStock(productId, delta) {
  const normRole = normalizeRole(currentUser?.role);
  if (normRole !== 'inventory_manager' && !isAdminRole(normRole)) {
    showToast('Access Denied: Only the Inventory Manager or Administrator should update stock quantities.', 'error');
    return;
  }

  const item = allInventory.find(p => p.product_id === productId);
  if (!item) return;
  const newStock = Math.max(0, Number(item.quantity_in_stock || 0) + delta);

  try {
    const res = await fetch(`/api/inventory/${productId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': currentUser?.role || 'admin'
      },
      body: JSON.stringify({
        quantity_in_stock: newStock,
        user_role: currentUser?.role || 'admin'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Stock update failed');
    item.quantity_in_stock = newStock;
    showToast(`Stock updated for ${item.product_name}`, 'success');
    loadInventoryAndMovements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRecordStockMovement(e) {
  e.preventDefault();

  const normRole = normalizeRole(currentUser?.role);
  if (normRole !== 'inventory_manager' && !isAdminRole(normRole)) {
    showToast('Access Denied: Only the Inventory Manager or Administrator should update stock quantities.', 'error');
    return;
  }

  const prodSelect = document.getElementById('move_product_select');
  const prodId = prodSelect.value;
  const prodName = prodSelect.selectedOptions[0]?.text.split('(')[0].trim();

  const payload = {
    product_id: prodId,
    product_name: prodName,
    type: document.getElementById('move_type').value,
    quantity: document.getElementById('move_quantity').value,
    reason: document.getElementById('move_reason').value.trim(),
    recorded_by: (currentUser && currentUser.full_name) ? `${currentUser.full_name} (${ROLE_LABELS[normRole] || normRole})` : 'Grace Kerubo (Inventory Manager)',
    user_role: currentUser?.role || 'admin'
  };

  try {
    const res = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': currentUser?.role || 'admin'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Stock movement recording failed');
    closeModal('stock-movement-modal');
    showToast(`Stock movement recorded for ${prodName}`, 'success');
    loadInventoryAndMovements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddProductModal() {
  document.getElementById('edit-product-id').value = '';
  const form = document.getElementById('product-form');
  if (form) form.reset();
  const title = document.getElementById('modal-title');
  if (title) title.textContent = 'Add New Product to Inventory';
  openModal('product-modal');
}

function openEditProductModal(productId) {
  const item = allInventory.find(p => p.product_id === productId);
  if (!item) return;

  document.getElementById('edit-product-id').value = item.product_id;
  document.getElementById('product_name').value = item.product_name;
  document.getElementById('category_name').value = item.category_name || 'Lighting';
  document.getElementById('buying_price').value = item.buying_price;
  document.getElementById('selling_price').value = item.selling_price;
  document.getElementById('quantity_in_stock').value = item.quantity_in_stock;
  document.getElementById('reorder_level').value = item.reorder_level;
  document.getElementById('image_url').value = item.image_url || '';

  document.getElementById('modal-title').textContent = `Edit Product #${item.product_id}`;
  openModal('product-modal');
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('edit-product-id').value;
  const newStock = Number(document.getElementById('quantity_in_stock').value);

  const normRole = normalizeRole(currentUser?.role);
  if (normRole !== 'inventory_manager' && !isAdminRole(normRole)) {
    showToast('Access Denied: Only the Inventory Manager or Administrator can manage products.', 'error');
    return;
  }

  const payload = {
    product_name: document.getElementById('product_name').value.trim(),
    category_name: document.getElementById('category_name').value.trim(),
    buying_price: Number(document.getElementById('buying_price').value),
    selling_price: Number(document.getElementById('selling_price').value),
    quantity_in_stock: newStock,
    reorder_level: Number(document.getElementById('reorder_level').value),
    image_url: document.getElementById('image_url').value.trim() || null,
    user_role: currentUser?.role || 'admin'
  };

  const isEdit = Boolean(id);
  const url = isEdit ? `/api/inventory/${id}` : '/api/inventory';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': currentUser?.role || 'admin'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save product');
    closeModal('product-modal');
    showToast(isEdit ? 'Product updated' : 'Product added', 'success');
    loadInventoryAndMovements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteProduct(productId) {
  const normRole = normalizeRole(currentUser?.role);
  if (normRole !== 'inventory_manager' && !isAdminRole(normRole)) {
    showToast('Access Denied: Only the Inventory Manager or Administrator can delete products.', 'error');
    return;
  }

  const item = allInventory.find(p => p.product_id === productId);
  const name = item ? item.product_name : `#${productId}`;
  if (!confirm(`Are you sure you want to remove "${name}" from inventory?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/inventory/${productId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': currentUser?.role || 'admin'
      },
      body: JSON.stringify({
        user_role: currentUser?.role || 'admin'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete product');
    showToast(`Product "${name}" deleted successfully.`, 'success');
    loadInventoryAndMovements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// AUTHENTICATION & ROLE-BASED ACCESS
// ========================================================
let currentUser = null;

const ROLE_ICONS = {
  admin: '👑',
  owner: '👑',
  cashier: '🧾',
  service_manager: '📋',
  technician: '⚡',
  finance_manager: '💰',
  dispatch_manager: '🚚',
  driver: '🚛',
  inventory_manager: '📦',
  customer: '👤'
};

const ROLE_LABELS = {
  admin: 'Administrator',
  owner: 'Shop Owner',
  cashier: 'Cashier',
  service_manager: 'Service Manager',
  technician: 'Technician',
  finance_manager: 'Finance Manager',
  dispatch_manager: 'Dispatch Manager',
  driver: 'Driver',
  inventory_manager: 'Inventory Manager',
  customer: 'Customer Account'
};

const ROLE_DEFAULT_MODULE = {
  admin: 'overview',
  owner: 'overview',
  cashier: 'cashier',
  service_manager: 'services',
  technician: 'technicians',
  finance_manager: 'finance',
  dispatch_manager: 'dispatch',
  driver: 'driver',
  inventory_manager: 'inventory'
};

// Full System Access for Administrators:
// Admin has unrestricted access to ALL governance and operational modules across the entire system.
const ALL_ERP_MODULES = [
  'overview',
  'admin',
  'suppliers',
  'settings',
  'reports',
  'activity',
  'customers',
  'services',
  'technicians',
  'cashier',
  'new_sale',
  'finance',
  'finance_releases',
  'finance_services',
  'finance_ledger',
  'finance_invoices',
  'finance_payments',
  'dispatch',
  'driver',
  'inventory',
  'inventory_materials',
  'inventory_movements',
  'inventory_pos',
  'inventory_quotations',
  'inventory_deliveries',
  'inventory_invoices',
  'bookings',
  'customer_care',
  'help',
  'about',
  'feedback',
  'contact'
];

const ROLE_ALLOWED_MODULES = {
  admin: ALL_ERP_MODULES,
  administrator: ALL_ERP_MODULES,
  owner: ALL_ERP_MODULES,
  superadmin: ALL_ERP_MODULES,
  cashier: ['cashier', 'new_sale', 'feedback', 'help'],
  service_manager: ['services', 'bookings', 'feedback', 'help'],
  technician: ['technicians', 'feedback', 'help'],
  finance_manager: ['finance', 'finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments', 'reports', 'feedback', 'help'],
  dispatch_manager: ['dispatch', 'bookings', 'feedback', 'help'],
  driver: ['driver', 'feedback', 'help'],
  inventory_manager: ['inventory', 'inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices', 'feedback', 'help'],
  customer_care: ['customers', 'customer_care', 'feedback', 'help']
};

function normalizeRole(rawRole) {
  const r = String(rawRole || 'admin').trim().toLowerCase();
  if (r === 'administrator' || r === 'superadmin') return 'admin';
  if (r === 'service' || r === 'service_manager') return 'service_manager';
  if (r === 'inventory' || r === 'inventory_manager' || r === 'storekeeper') return 'inventory_manager';
  if (r === 'finance' || r === 'finance_manager' || r === 'accountant') return 'finance_manager';
  if (r === 'tech' || r === 'technician' || r === 'service_tech') return 'technician';
  if (r === 'cashier' || r === 'cashier_manager') return 'cashier';
  if (r === 'driver' || r === 'rider' || r === 'delivery') return 'driver';
  if (r === 'customer_care' || r === 'support' || r === 'care' || r === 'cs') return 'customer_care';
  if (r === 'customer' || r === 'client') return 'customer';
  return r;
}

function isAdminRole(rawRole) {
  const r = normalizeRole(rawRole);
  return r === 'admin' || r === 'owner';
}

function getAllowedModulesForRole(rawRole) {
  const role = normalizeRole(rawRole);
  if (isAdminRole(role)) {
    return ALL_ERP_MODULES;
  }

  if (liveRolePermissions && Array.isArray(liveRolePermissions[role]) && liveRolePermissions[role].length > 0) {
    const perms = [...liveRolePermissions[role]];
    if (perms.includes('cashier') && !perms.includes('new_sale')) {
      perms.push('new_sale');
    }
    if (perms.includes('finance')) {
      ['finance_releases', 'finance_services', 'finance_ledger', 'finance_invoices', 'finance_payments'].forEach(sub => {
        if (!perms.includes(sub)) perms.push(sub);
      });
    }
    if (perms.includes('inventory')) {
      ['inventory_materials', 'inventory_movements', 'inventory_pos', 'inventory_quotations', 'inventory_deliveries', 'inventory_invoices'].forEach(sub => {
        if (!perms.includes(sub)) perms.push(sub);
      });
    }
    if (!perms.includes('feedback')) {
      perms.push('feedback');
    }
    return perms;
  }
  const fallback = [...(ROLE_ALLOWED_MODULES[role] || ['feedback'])];
  if (!fallback.includes('feedback')) fallback.push('feedback');
  return fallback;
}

window.toggleSidebarGroup = function (btn) {
  const sidebar = document.getElementById('erpSidebar');
  const group = btn.closest('.erp-nav-group');
  if (!group) return;

  if (sidebar && sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
    localStorage.setItem('elight_sidebar_collapsed', '0');
    const cBtn = document.getElementById('sidebarCollapseBtn');
    if (cBtn) cBtn.textContent = '◀';
    document.querySelectorAll('.erp-nav-group').forEach(g => g.classList.remove('open'));
    group.classList.add('open');
    return;
  }

  const wasOpen = group.classList.contains('open');
  document.querySelectorAll('.erp-nav-group').forEach(g => g.classList.remove('open'));
  if (!wasOpen) group.classList.add('open');
};

window.toggleSidebarCollapse = function () {
  const sidebar = document.getElementById('erpSidebar');
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem('elight_sidebar_collapsed', collapsed ? '1' : '0');
  const btn = document.getElementById('sidebarCollapseBtn');
  if (btn) btn.textContent = collapsed ? '▶' : '◀';
};

window.toggleMobileSidebar = function (forceState) {
  const sidebar = document.getElementById('erpSidebar');
  const backdrop = document.getElementById('erpSidebarBackdrop');
  if (!sidebar) return;
  const next = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', next);
  if (backdrop) backdrop.classList.toggle('active', next);
};

function applySidebarVisibility(role) {
  const allowedModules = getAllowedModulesForRole(role);
  document.querySelectorAll('.erp-nav-btn').forEach(btn => {
    const onclickAttr = btn.getAttribute('onclick') || '';
    const match = onclickAttr.match(/switchModule\('([^']+)'\)/);
    if (match) {
      const modName = match[1];
      const li = btn.closest('li') || btn;
      li.style.display = allowedModules.includes(modName) ? '' : 'none';
    }
  });

  // Hide any category dropdown if all of its child modules are hidden for this role
  document.querySelectorAll('.erp-nav-group').forEach(group => {
    const visibleItems = Array.from(group.querySelectorAll('.erp-submenu > li')).filter(li => li.style.display !== 'none');
    group.style.display = visibleItems.length > 0 ? '' : 'none';
  });

  // Restore desktop collapsed preference
  if (window.innerWidth > 900 && localStorage.getItem('elight_sidebar_collapsed') === '1') {
    const sidebar = document.getElementById('erpSidebar');
    const cBtn = document.getElementById('sidebarCollapseBtn');
    if (sidebar) sidebar.classList.add('collapsed');
    if (cBtn) cBtn.textContent = '▶';
  }
}

function checkAuth() {
  const stored = localStorage.getItem('elight_user');
  const params = new URLSearchParams(window.location.search);

  if (!stored) {
    if (params.get('guest') === '1') {
      currentUser = {
        full_name: 'Guest Administrator',
        role: 'admin',
        username: 'guest'
      };
    } else {
      window.location.replace('/login');
      return false;
    }
  } else {
    try {
      currentUser = JSON.parse(stored);
    } catch (e) {
      window.location.replace('/login');
      return false;
    }
  }

  // Strictly block customers and suppliers from accessing the ERP staff portal
  if (localStorage.getItem('elight_supplier_session') && (!currentUser || !currentUser.role)) {
    window.location.replace('/supplier-portal');
    return false;
  }
  const role = normalizeRole(currentUser.role);
  currentUser.role = role;
  if (role === 'customer') {
    window.location.replace('/customer');
    return false;
  }
  if (role === 'supplier') {
    window.location.replace('/supplier-portal');
    return false;
  }

  // Reveal portal body now that staff role is verified
  const portalBody = document.getElementById('adminPortalBody');
  if (portalBody) portalBody.style.visibility = 'visible';

  applySidebarVisibility(role);

  // Update header and sidebar UI
  const icon = ROLE_ICONS[role] || '👤';
  const roleLabel = ROLE_LABELS[role] || role;

  const headerName = document.getElementById('headerUserName');
  const headerRole = document.getElementById('headerUserRole');
  const headerIcon = document.getElementById('headerUserIcon');
  if (headerName) headerName.textContent = currentUser.full_name;
  if (headerRole) headerRole.textContent = roleLabel;
  if (headerIcon) headerIcon.textContent = icon;

  const sidebarName = document.getElementById('sidebarUserName');
  const sidebarRole = document.getElementById('sidebarUserRole');
  const sidebarIcon = document.getElementById('sidebarUserIcon');
  const footerRole = document.getElementById('footerUserRoleLabel');
  if (sidebarName) sidebarName.textContent = currentUser.full_name;
  if (sidebarRole) sidebarRole.textContent = roleLabel;
  if (sidebarIcon) sidebarIcon.textContent = icon;
  if (footerRole) footerRole.textContent = `${currentUser.full_name} (${roleLabel})`;

  return true;
}

function handleLogout() {
  localStorage.removeItem('elight_user');
  localStorage.removeItem('elight_token');
  window.location.href = '/login';
}

// Initial Boot: sync live role permissions configured by Admin, then open allowed default module
document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) return;
  const role = normalizeRole(currentUser?.role);
  if (!isAdminRole(role)) {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success && data.role_permissions) {
        liveRolePermissions = data.role_permissions;
        applySidebarVisibility(role);
      }
    } catch (e) {
      // Fallback to default role permissions
    }
  }
  const allowed = getAllowedModulesForRole(role);
  const preferred = isAdminRole(role) ? 'overview' : (ROLE_DEFAULT_MODULE[role] || allowed[0] || 'overview');
  const initialModule = allowed.includes(preferred) ? preferred : (allowed[0] || 'overview');
  switchModule(initialModule);
  togglePOSCashFields();
  syncFinanceEntryRefRules();
  if (typeof startElightLiveSync === 'function') {
    startElightLiveSync(() => loadERPModuleData(currentActiveERPModule, true), {
      canSync: () => !NON_BG_SYNC_MODULES.has(currentActiveERPModule)
    });
  }
});



// ========================================================
// BOOKING MODULE (ADMIN MANAGEMENT)
// ========================================================
async function loadAdminBookings() {
  const tbody = document.getElementById('admin-bookings-tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/bookings?scope=all');
    const data = await res.json();
    const list = data.bookings || [];
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">No bookings recorded yet.</td></tr>';
      return;
    }

    const currentRole = normalizeRole(currentUser?.role);
    const canManageService = currentRole === 'service_manager' || isAdminRole(currentRole);
    const standardSlots = [
      '08:00 AM - 10:00 AM',
      '10:00 AM - 12:00 PM',
      '12:00 PM - 02:00 PM',
      '02:00 PM - 04:00 PM',
      '04:00 PM - 06:00 PM'
    ];

    tbody.innerHTML = list.map(b => {
      const isService = b.booking_type === 'service';
      const isTimePending = !b.preferred_time || b.preferred_time === 'Pending Service Manager Assignment';
      let slotDisplay = '';
      if (isService && canManageService) {
        const slotOpts = standardSlots.map(s => `<option value="${s}" ${b.preferred_time === s ? 'selected' : ''}>${s}</option>`).join('');
        slotDisplay = `
          <div>
            <strong>${escapeHTML(b.preferred_date)}</strong>
            <select onchange="assignTimeToBooking(${b.booking_id}, this.value)" style="display:block; margin-top:3px; padding:2px 4px; font-size:0.75rem; border:1px solid ${isTimePending ? '#f59e0b' : '#10b981'}; background:${isTimePending ? '#fffbeb' : '#f0fdf4'}; border-radius:4px; font-weight:600; color:${isTimePending ? '#b45309' : '#047857'};">
              <option value="">${isTimePending ? '⚠️ Assign Time...' : '-- Change Time --'}</option>
              ${slotOpts}
            </select>
            ${isTimePending ? '<div style="font-size:0.68rem; color:#d97706; margin-top:2px; font-weight:600;">⚠️ Pending Assignment</div>' : `<div style="font-size:0.68rem; color:#059669; margin-top:2px; font-weight:700;">✓ Confirmed: ${escapeHTML(b.preferred_time)}</div>`}
          </div>
        `;
      } else {
        slotDisplay = `
          <div>
            <strong>${escapeHTML(b.preferred_date)}</strong><br>
            ${isTimePending 
              ? '<span style="display:inline-block; margin-top:2px; padding:2px 6px; border-radius:4px; font-size:0.72rem; background:#fef3c7; color:#92400e; font-weight:600;">🕒 Time Pending Service Manager</span>' 
              : `<small style="color:var(--text-muted); font-weight:600;">⏰ ${escapeHTML(b.preferred_time || '')}</small>`}
          </div>
        `;
      }

      return `
        <tr>
          <td><strong style="font-family:monospace;">${escapeHTML(b.booking_ref)}</strong></td>
          <td>${b.booking_type === 'product' ? '📦 Product' : '🔧 Service'}</td>
          <td><strong>${escapeHTML(b.customer_name)}</strong><br><small style="color:var(--text-muted);">${escapeHTML(b.customer_phone)}</small></td>
          <td><strong>${escapeHTML(b.item_or_service_name)}</strong> (x${b.quantity})<br><small style="color:var(--text-muted);">${escapeHTML(b.location_or_notes || '')}</small></td>
          <td>${slotDisplay}</td>
          <td><strong>${formatKES(b.estimated_amount)}</strong><br><small style="color:var(--text-muted);">Booking Fee: ${formatKES(b.booking_fee ?? 200)}</small></td>
          <td><span class="badge-tag badge-${escapeHTML(b.status)}">${escapeHTML(b.status)}</span></td>
          <td>
            <select onchange="updateAdminBookingStatus(${b.booking_id}, this.value)" style="padding:4px 8px; border-radius:4px; font-size:0.8rem;">
              <option value="">Update Status...</option>
              <option value="confirmed">Confirm</option>
              <option value="completed">Mark Completed</option>
              <option value="cancelled">Cancel</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">${escapeHTML(err.message)}</td></tr>`;
  }
}

async function assignTimeToBooking(bookingId, timeSlot) {
  if (!timeSlot) return;
  try {
    const role = normalizeRole(currentUser?.role);
    const res = await fetch(`/api/bookings/${bookingId}/time`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': role
      },
      body: JSON.stringify({
        assigned_time: timeSlot,
        user_role: role,
        actor: currentUser?.full_name || 'Service Manager'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to assign booking arrival time');
    showToast(`Arrival time "${timeSlot}" assigned to booking #${bookingId}`, 'success');
    loadAdminBookings();
  } catch (err) {
    showToast(err.message, 'error');
    loadAdminBookings();
  }
}

async function updateAdminBookingStatus(bookingId, newStatus) {
  if (!newStatus) return;
  try {
    const res = await fetch(`/api/bookings/${bookingId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Failed to update booking status');
    showToast(`Booking #${bookingId} marked as ${newStatus}`, 'success');
    loadAdminBookings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// HELP MODULE (STAFF SOPs & CUSTOMER GUIDES)
// ========================================================
function toggleAdminFaqItem(btn) {
  const item = btn.closest('.faq-item');
  if (!item) return;
  item.classList.toggle('open');
  const icon = btn.querySelector('.faq-toggle-icon');
  if (icon) icon.textContent = item.classList.contains('open') ? '−' : '+';
}

async function loadAdminHelp() {
  const container = document.getElementById('admin-help-content');
  if (!container) return;
  const q = (document.getElementById('admin-help-search')?.value || '').trim();
  const audience = document.getElementById('admin-help-audience')?.value || 'all';
  const params = new URLSearchParams();
  if (audience && audience !== 'all') params.set('audience', audience);
  if (q) params.set('q', q);

  try {
    const res = await fetch('/api/help?' + params.toString());
    const data = await res.json();
    if (!data.success) throw new Error('Failed to load help content');

    const guides = data.guides || [];
    const faqs = data.faqs || [];

    const guidesHtml = guides.length === 0
      ? '<p style="color:var(--text-muted); padding:10px 0;">No operational guides matched your search.</p>'
      : guides.map(g => {
          const badge = g.audience === 'attendant'
            ? '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700;">Staff SOP</span>'
            : '<span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700;">Customer</span>';
          return `
            <div style="border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:12px; background:#f8fafc;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                <strong style="color:var(--primary); font-size:0.94rem;">${escapeHTML(g.icon || '📘')} ${escapeHTML(g.title)}</strong>
                ${badge}
              </div>
              <ol class="guide-step-list" style="font-size:0.86rem; line-height:1.55;">
                ${(g.steps || []).map(step => `<li style="margin-bottom:4px;">${escapeHTML(step)}</li>`).join('')}
              </ol>
            </div>
          `;
        }).join('');

    const faqsHtml = faqs.length === 0
      ? '<p style="color:var(--text-muted); padding:10px 0;">No FAQs matched your search.</p>'
      : faqs.map((f, idx) => `
          <div class="faq-item ${idx === 0 ? 'open' : ''}">
            <button type="button" class="faq-question" onclick="toggleAdminFaqItem(this)" style="font-size:0.9rem; padding:12px 14px;">
              <span>
                <span style="display:block; font-size:0.7rem; text-transform:uppercase; color:#64748b; margin-bottom:2px;">${escapeHTML(f.category || 'General')} · ${escapeHTML(f.audience || 'all')}</span>
                ${escapeHTML(f.question)}
              </span>
              <span class="faq-toggle-icon" style="font-size:1.1rem; font-weight:800; flex-shrink:0;">${idx === 0 ? '−' : '+'}</span>
            </button>
            <div class="faq-answer" style="font-size:0.86rem; padding:12px 14px;">${escapeHTML(f.answer)}</div>
          </div>
        `).join('');

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:18px;">
        <div class="metric-card" style="text-align:left;">
          <h4 style="color:var(--primary); font-size:1.05rem; margin-bottom:12px;">📖 Step-by-Step Guides (${guides.length})</h4>
          ${guidesHtml}
        </div>
        <div class="metric-card" style="text-align:left;">
          <h4 style="color:var(--primary); font-size:1.05rem; margin-bottom:12px;">💡 Frequently Asked Questions (${faqs.length})</h4>
          ${faqsHtml}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:red;">${escapeHTML(err.message)}</p>`;
  }
}

// ========================================================
// ABOUT US MODULE (SHOP PROFILE)
// ========================================================
async function loadAdminAbout() {
  const container = document.getElementById('admin-about-content');
  if (!container) return;
  try {
    const res = await fetch('/api/about');
    const data = await res.json();
    const a = data.about || {};
    const loc = a.location || {};
    const c = a.contacts || {};

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:18px;">
        <div class="metric-card" style="text-align:left;">
          <h4 style="color:var(--primary); font-size:1.05rem; margin-bottom:8px;">⚡ ${escapeHTML(a.shop_name)}</h4>
          <p style="font-size:0.88rem; color:#334155; line-height:1.6; margin-bottom:12px;">${escapeHTML(a.story)}</p>
          <div style="font-size:0.84rem; color:#475569;"><strong>Mission:</strong> ${escapeHTML(a.mission)}</div>
        </div>
        <div class="metric-card" style="text-align:left;">
          <h4 style="color:var(--primary); font-size:1.05rem; margin-bottom:8px;">📍 Location &amp; Contacts</h4>
          <div style="font-size:0.86rem; color:#334155; line-height:1.75;">
            <div><strong>Showroom:</strong> ${escapeHTML(loc.building)}, ${escapeHTML(loc.street)}</div>
            <div><strong>City:</strong> ${escapeHTML(loc.city)}</div>
            <div><strong>Warehouse:</strong> ${escapeHTML(loc.dispatch_hub)}</div>
            <div><strong>Sales Phone:</strong> ${escapeHTML(c.sales_phone)}</div>
            <div><strong>WhatsApp:</strong> ${escapeHTML(c.whatsapp)}</div>
            <div><strong>Email:</strong> ${escapeHTML(c.sales_email)}</div>
            <div><strong>M-Pesa Till:</strong> <code>${escapeHTML(c.mpesa_till)}</code></div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:red;">${escapeHTML(err.message)}</p>`;
  }
}

// ========================================================
// FEEDBACK MODULE (CROSS-MODULE REVIEWS, INCIDENTS & SUGGESTIONS)
// Accessible across ALL system modules
// ========================================================
let allFeedbackList = [];
let activeFeedbackModuleTag = 'general';
let activeFeedbackModuleName = 'General Store';

function normalizeModuleToTag(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('cashier')) return 'cashier';
  if (n.includes('new sale') || n.includes('sale')) return 'cashier';
  if (n.includes('inventory')) return 'inventory';
  if (n.includes('dispatch')) return 'dispatch';
  if (n.includes('driver')) return 'dispatch';
  if (n.includes('service')) return 'services';
  if (n.includes('tech')) return 'services';
  if (n.includes('finance')) return 'finance';
  if (n.includes('booking')) return 'services';
  if (n.includes('report')) return 'general';
  if (n.includes('dashboard') || n.includes('overview')) return 'general';
  if (n.includes('setting')) return 'general';
  return 'general';
}

function getDepartmentForRole(rawRole) {
  const r = normalizeRole(rawRole);
  if (r === 'admin' || r === 'owner' || r === 'superadmin' || r === 'administrator') return null; // Management oversees all
  if (r === 'inventory_manager' || r === 'inventory' || r === 'storekeeper') return 'inventory';
  if (r === 'dispatch_manager' || r === 'dispatch' || r === 'driver' || r === 'rider' || r === 'delivery') return 'dispatch';
  if (r === 'cashier' || r === 'cashier_manager') return 'cashier';
  if (r === 'service_manager' || r === 'technician' || r === 'service' || r === 'tech') return 'services';
  if (r === 'finance_manager' || r === 'finance' || r === 'accountant') return 'finance';
  return null;
}

function openModuleFeedbackModal(moduleName) {
  const userRole = currentUser ? normalizeRole(currentUser.role) : 'admin';
  const userDept = getDepartmentForRole(userRole);

  if (userDept) {
    activeFeedbackModuleTag = userDept;
    const deptNames = {
      inventory: 'Inventory & Stock',
      dispatch: 'Dispatch & Deliveries',
      cashier: 'Cashier & Sales',
      services: 'Services & Technicians',
      finance: 'Finance & Billing'
    };
    activeFeedbackModuleName = deptNames[userDept] || userDept.toUpperCase();
  } else {
    if (!moduleName) {
      const activeSec = document.querySelector('.erp-module-section.active');
      const headerTitle = activeSec?.querySelector('h2')?.textContent || 'Current Module';
      moduleName = headerTitle.replace(/^[^\w\s]+/, '').trim();
    }
    activeFeedbackModuleName = moduleName;
    activeFeedbackModuleTag = normalizeModuleToTag(moduleName);
  }

  const badge = document.getElementById('modal-feedback-dept-badge');
  if (badge) {
    badge.textContent = `📍 ${activeFeedbackModuleName}`;
  }

  const tagInput = document.getElementById('modal_fb_module_tag');
  if (tagInput) {
    tagInput.value = activeFeedbackModuleTag;
  }

  // Pre-fill user information if available
  const nameInput = document.getElementById('modal_fb_name');
  const contactInput = document.getElementById('modal_fb_contact');
  if (nameInput) {
    nameInput.value = currentUser ? (currentUser.full_name || currentUser.username) : 'Staff User';
  }
  if (contactInput) {
    contactInput.value = currentUser ? (currentUser.email || currentUser.phone || '') : '';
  }

  const subjInput = document.getElementById('modal_fb_subject');
  if (subjInput) {
    subjInput.value = '';
    subjInput.placeholder = `Feedback for ${moduleName}...`;
  }
  const msgInput = document.getElementById('modal_fb_message');
  if (msgInput) msgInput.value = '';

  switchModalFeedbackTab('submit');
  renderModalFeedbackHistory();
  openModal('module-feedback-modal');
}

function switchModalFeedbackTab(tab) {
  const submitBtn = document.getElementById('modal-fb-tab-btn-submit');
  const historyBtn = document.getElementById('modal-fb-tab-btn-history');
  const submitView = document.getElementById('modal-fb-view-submit');
  const historyView = document.getElementById('modal-fb-view-history');

  if (tab === 'submit') {
    if (submitBtn) { submitBtn.style.background = '#1e3a8a'; submitBtn.style.color = '#fff'; }
    if (historyBtn) { historyBtn.style.background = '#f1f5f9'; historyBtn.style.color = '#475569'; }
    if (submitView) submitView.style.display = 'block';
    if (historyView) historyView.style.display = 'none';
  } else {
    if (submitBtn) { submitBtn.style.background = '#f1f5f9'; submitBtn.style.color = '#475569'; }
    if (historyBtn) { historyBtn.style.background = '#1e3a8a'; historyBtn.style.color = '#fff'; }
    if (submitView) submitView.style.display = 'none';
    if (historyView) historyView.style.display = 'block';
    renderModalFeedbackHistory();
  }
}

async function handleSubmitModuleFeedback(e) {
  e.preventDefault();
  const payload = {
    customer_name: document.getElementById('modal_fb_name').value.trim(),
    customer_email: document.getElementById('modal_fb_contact').value.trim(),
    feedback_type: document.getElementById('modal_fb_type').value,
    rating: document.getElementById('modal_fb_rating').value,
    subject: `[${activeFeedbackModuleName}] ${document.getElementById('modal_fb_subject').value.trim()}`,
    message: document.getElementById('modal_fb_message').value.trim(),
    module_tag: document.getElementById('modal_fb_module_tag').value
  };

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Feedback submission failed');
    const data = await res.json();
    if (data.feedback) {
      allFeedbackList.unshift(data.feedback);
    }
    showToast(`Feedback submitted successfully for ${activeFeedbackModuleName}!`, 'success');
    closeModal('module-feedback-modal');
    renderAdminFeedbackTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderModalFeedbackHistory() {
  const container = document.getElementById('modal-fb-history-list');
  const countBadge = document.getElementById('modal-fb-history-count');
  if (!container) return;

  const filtered = allFeedbackList.filter(f => {
    if (activeFeedbackModuleTag === 'general') return true;
    return (f.module_tag === activeFeedbackModuleTag) || 
           (String(f.subject || '').toLowerCase().includes(activeFeedbackModuleName.toLowerCase()));
  });

  if (countBadge) countBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px; color:#64748b; font-size:0.86rem;">
        No feedback or incident reports logged for <strong>${escapeHTML(activeFeedbackModuleName)}</strong> yet.<br>
        Use the <em>Submit Feedback</em> tab to submit the first review or suggestion!
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(f => {
    const typeColor = f.feedback_type === 'complaint' ? '#dc2626' : f.feedback_type === 'suggestion' ? '#d97706' : '#16a34a';
    return `
      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#fff;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:${typeColor};">
            ${f.feedback_type === 'complaint' ? '⚠️ COMPLAINT' : f.feedback_type === 'suggestion' ? '💡 SUGGESTION' : '⭐ REVIEW'}
          </span>
          <span style="color:#f59e0b; font-size:0.85rem; font-weight:700;">${'★'.repeat(Number(f.rating || 5))}</span>
        </div>
        <div style="font-weight:700; color:#0f172a; font-size:0.9rem;">${escapeHTML(f.subject)}</div>
        <div style="font-size:0.82rem; color:#475569; margin-top:4px; line-height:1.4;">${escapeHTML(f.message)}</div>
        <div style="font-size:0.75rem; color:#64748b; margin-top:6px; display:flex; justify-content:space-between;">
          <span>By <strong>${escapeHTML(f.customer_name)}</strong></span>
          <span class="badge-tag" style="font-size:0.7rem;">${escapeHTML(f.status || 'published')}</span>
        </div>
        ${f.admin_reply ? `
          <div style="margin-top:6px; padding:6px 10px; background:#eff6ff; border-radius:6px; font-size:0.78rem; color:#1e40af;">
            <strong>Reply:</strong> ${escapeHTML(f.admin_reply)}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function loadAdminFeedback() {
  const tbody = document.getElementById('admin-feedback-tbody');
  if (!tbody) return;

  const userRole = currentUser ? normalizeRole(currentUser.role) : 'admin';
  const userDept = getDepartmentForRole(userRole);

  const moduleFilter = document.getElementById('admin-feedback-filter-module');
  const deptLockNotice = document.getElementById('admin-feedback-dept-lock-notice');
  const deptLabels = {
    inventory: '📦 Inventory & Product Stock',
    dispatch: '🚚 Dispatch & Deliveries',
    cashier: '🧾 Cashier Desk & Sales',
    services: '🔧 Electrical Services & Technicians',
    finance: '💵 Finance & Billing',
    general: '🏢 General Management'
  };

  // Configure UI and Department Filter Lock
  if (userDept && moduleFilter) {
    moduleFilter.value = userDept;
    Array.from(moduleFilter.options).forEach(opt => {
      if (opt.value === userDept) {
        opt.disabled = false;
        opt.style.display = '';
        opt.selected = true;
      } else {
        opt.disabled = true;
        opt.style.display = 'none';
      }
    });
    if (deptLockNotice) {
      deptLockNotice.style.display = 'block';
      deptLockNotice.innerHTML = `🔒 <strong>Department Isolation:</strong> You are logged in as <em>${escapeHTML(userRole)}</em>. You can only view and manage customer feedback submitted specifically to the <strong>${deptLabels[userDept] || userDept}</strong> department. Other departments cannot see your feedback, and you cannot view theirs.`;
    }
  } else if (moduleFilter) {
    // Admin / Owner sees all departments
    Array.from(moduleFilter.options).forEach(opt => {
      opt.disabled = false;
      opt.style.display = '';
    });
    if (deptLockNotice) deptLockNotice.style.display = 'none';
  }

  try {
    const deptParam = userDept ? `&department=${userDept}` : '';
    const res = await fetch(`/api/feedback?scope=all${deptParam}`);
    const data = await res.json();
    let list = data.feedback || [];
    if (userDept) {
      list = list.filter(f => String(f.module_tag || '').toLowerCase() === userDept);
    }
    allFeedbackList = list;
    renderAdminFeedbackTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderAdminFeedbackTable() {
  const tbody = document.getElementById('admin-feedback-tbody');
  if (!tbody) return;

  const userRole = currentUser ? normalizeRole(currentUser.role) : 'admin';
  const userDept = getDepartmentForRole(userRole);

  const search = (document.getElementById('admin-feedback-search')?.value || '').toLowerCase().trim();
  const typeFilter = document.getElementById('admin-feedback-filter-type')?.value || 'all';
  const moduleFilter = document.getElementById('admin-feedback-filter-module')?.value || 'all';

  let filtered = allFeedbackList;

  // Enforce strict department isolation for department users
  if (userDept) {
    filtered = filtered.filter(f => String(f.module_tag || '').toLowerCase() === userDept);
  } else if (moduleFilter !== 'all') {
    filtered = filtered.filter(f => (f.module_tag === moduleFilter) || (normalizeModuleToTag(f.subject) === moduleFilter));
  }

  if (typeFilter !== 'all') {
    filtered = filtered.filter(f => f.feedback_type === typeFilter);
  }
  if (search) {
    filtered = filtered.filter(f => 
      String(f.subject || '').toLowerCase().includes(search) ||
      String(f.message || '').toLowerCase().includes(search) ||
      String(f.customer_name || '').toLowerCase().includes(search)
    );
  }

  // Update KPI Metric Cards based on isolated department view
  const deptScopedList = userDept ? allFeedbackList.filter(f => String(f.module_tag || '').toLowerCase() === userDept) : allFeedbackList;
  const totalCount = deptScopedList.length;
  const reviews = deptScopedList.filter(f => f.feedback_type === 'review');
  const complaints = deptScopedList.filter(f => f.feedback_type === 'complaint');
  const suggestions = deptScopedList.filter(f => f.feedback_type === 'suggestion');

  const mTotal = document.getElementById('fb-metric-total');
  if (mTotal) mTotal.textContent = totalCount;

  const mReviews = document.getElementById('fb-metric-reviews');
  if (mReviews) mReviews.textContent = reviews.length;

  const avgRating = reviews.length > 0 
    ? (reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / reviews.length).toFixed(1)
    : '5.0';
  const mReviewsSub = document.getElementById('fb-metric-reviews-sub');
  if (mReviewsSub) mReviewsSub.textContent = `Avg Rating: ${avgRating} ★ (${reviews.length} Reviews)`;

  const mComplaints = document.getElementById('fb-metric-complaints');
  if (mComplaints) mComplaints.textContent = complaints.length;
  const pendingComplaints = complaints.filter(c => c.status !== 'resolved').length;
  const mComplaintsSub = document.getElementById('fb-metric-complaints-sub');
  if (mComplaintsSub) mComplaintsSub.textContent = `${pendingComplaints} Pending Resolution`;

  const mSuggestions = document.getElementById('fb-metric-suggestions');
  if (mSuggestions) mSuggestions.textContent = suggestions.length;

  const countBadge = document.getElementById('admin-feedback-count-badge');
  if (countBadge) countBadge.textContent = `Showing ${filtered.length} of ${totalCount} entries`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748b;">No feedback entries match your filter.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(f => {
    const typeBadgeBg = f.feedback_type === 'complaint' ? '#fee2e2' : f.feedback_type === 'suggestion' ? '#fef3c7' : '#dcfce7';
    const typeBadgeCol = f.feedback_type === 'complaint' ? '#b91c1c' : f.feedback_type === 'suggestion' ? '#92400e' : '#166534';
    const modTag = f.module_tag ? f.module_tag.toUpperCase() : 'GENERAL';

    return `
      <tr>
        <td><strong>#${f.feedback_id}</strong></td>
        <td>
          <span class="badge-tag" style="background:#f1f5f9; color:#1e293b; font-weight:800; font-size:0.75rem;">
            ${escapeHTML(modTag)}
          </span>
        </td>
        <td><span class="badge-tag" style="background:${typeBadgeBg}; color:${typeBadgeCol};">${escapeHTML(f.feedback_type)}</span></td>
        <td>
          <strong>${escapeHTML(f.customer_name)}</strong><br>
          <small style="color:var(--text-muted);">${escapeHTML(f.customer_email || f.customer_phone || 'Staff User')}</small>
        </td>
        <td style="color:#f59e0b; font-weight:700;">${'★'.repeat(Number(f.rating || 5))}</td>
        <td>
          <strong>${escapeHTML(f.subject)}</strong>
          <div style="font-size:0.83rem; color:#475569; margin-top:3px; line-height:1.4;">${escapeHTML(f.message)}</div>
          ${f.admin_reply ? `<div style="font-size:0.8rem; color:#1e40af; background:#eff6ff; padding:5px 10px; border-radius:5px; margin-top:6px; border:1px solid #bfdbfe;"><strong>Management Reply:</strong> ${escapeHTML(f.admin_reply)}</div>` : ''}
        </td>
        <td><span class="badge-tag">${escapeHTML(f.status || 'published')}</span></td>
        <td>
          <button class="btn-sm btn-primary" onclick="replyToFeedback(${f.feedback_id}, '${escapeHTML(f.feedback_type)}')">Reply / Resolve</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function replyToFeedback(feedbackId, fbType) {
  const userRole = currentUser ? normalizeRole(currentUser.role) : 'admin';
  const userDept = getDepartmentForRole(userRole);

  const reply = prompt('Enter department response / resolution note:');
  if (reply === null) return;
  const newStatus = fbType === 'review' ? 'published' : 'resolved';
  try {
    const res = await fetch(`/api/feedback/${feedbackId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_reply: reply.trim(),
        status: newStatus,
        user_role: userRole,
        user_department: userDept
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save feedback response');
    showToast('Feedback response saved!', 'success');
    loadAdminFeedback();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// CONTACT US MODULE (CUSTOMER INQUIRIES)
// ========================================================
async function loadAdminContactInquiries() {
  const tbody = document.getElementById('admin-contact-tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/contact');
    const data = await res.json();
    const list = data.inquiries || [];
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No customer inquiries yet.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(inq => `
      <tr>
        <td><strong style="font-family:monospace;">${escapeHTML(inq.ticket_ref)}</strong></td>
        <td>
          <strong>${escapeHTML(inq.full_name)}</strong><br>
          <small style="color:var(--text-muted);">${escapeHTML(inq.email)} ${inq.phone ? '| ' + escapeHTML(inq.phone) : ''}</small>
        </td>
        <td>
          <strong>${escapeHTML(inq.subject)}</strong>
          <div style="font-size:0.83rem; color:#475569; margin-top:3px;">${escapeHTML(inq.message)}</div>
          ${inq.admin_response ? `<div style="font-size:0.8rem; color:#065f46; background:#ecfdf5; padding:4px 8px; border-radius:4px; margin-top:6px;"><strong>Response:</strong> ${escapeHTML(inq.admin_response)}</div>` : ''}
        </td>
        <td><span class="badge-tag">${escapeHTML(inq.status)}</span></td>
        <td>
          <button class="btn-sm btn-primary" onclick="replyToContactInquiry(${inq.inquiry_id})">Respond</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">${escapeHTML(err.message)}</td></tr>`;
  }
}

async function replyToContactInquiry(inquiryId) {
  const resp = prompt('Enter response note sent to the customer:');
  if (resp === null) return;
  try {
    const res = await fetch(`/api/contact/${inquiryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_response: resp.trim(), status: 'replied' })
    });
    if (!res.ok) throw new Error('Failed to update inquiry');
    showToast('Inquiry marked as replied!', 'success');
    loadAdminContactInquiries();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// REAL-TIME REPORTS & DECISION ANALYTICS
// ========================================================
let latestRealtimeReport = null;
let currentReportSubTab = 'sales';
let reportsAutoRefreshTimer = null;

function syncReportsAutoRefresh() {
  if (reportsAutoRefreshTimer) {
    clearInterval(reportsAutoRefreshTimer);
    reportsAutoRefreshTimer = null;
  }
  const sec = document.getElementById('module-reports');
  if (sec && sec.classList.contains('active')) {
    reportsAutoRefreshTimer = setInterval(() => {
      loadRealtimeReports(true);
    }, 15000);
  }
}

function toggleReportsAutoRefresh() {
  syncReportsAutoRefresh();
}

function switchReportSubTab(tab) {
  currentReportSubTab = tab || 'sales';
  const domainSelect = document.getElementById('reports-domain-select');
  if (domainSelect && domainSelect.value !== currentReportSubTab) {
    domainSelect.value = currentReportSubTab;
  }
  if (latestRealtimeReport) {
    renderRealtimeReportsView();
  }
}

async function loadRealtimeReports(silent = false) {
  const periodSelect = document.getElementById('reports-period-select');
  const period = periodSelect ? periodSelect.value : 'all';
  const domainSelect = document.getElementById('reports-domain-select');
  if (domainSelect && domainSelect.value) {
    currentReportSubTab = domainSelect.value;
  }
  const syncEl = document.getElementById('reports-last-synced');
  const bodyEl = document.getElementById('realtime-reports-body');

  if (!silent && syncEl) {
    syncEl.textContent = 'Syncing live database...';
  }

  try {
    const res = await fetch(`/api/reports/realtime?period=${encodeURIComponent(period)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Unable to fetch real-time reports');
    }

    latestRealtimeReport = data;

    if (syncEl) {
      const ts = new Date(data.generatedAt || Date.now()).toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      syncEl.textContent = `Live Stream Active • Last synced at ${ts}`;
    }

    renderRealtimeReportsView();
  } catch (err) {
    if (syncEl) syncEl.textContent = 'Sync interrupted — retrying automatically...';
    if (bodyEl && !latestRealtimeReport) {
      bodyEl.innerHTML = `<div style="padding:32px; color:#b91c1c; font-weight:600; text-align:center;">⚠️ ${escapeHTML(err.message)}</div>`;
    }
    if (!silent) showToast(err.message, 'error');
  }
}

function getSelectedDecisionNote(reportKey) {
  const insights = (latestRealtimeReport && latestRealtimeReport.decisionInsights) || [];
  const domainKeywordMap = {
    sales: ['sales', 'profit'],
    cashier_detailed: ['sales', 'profit'],
    cashier_summary: ['sales', 'profit'],
    profit_loss: ['sales', 'profit'],
    purchases: ['purchas', 'inventory'],
    inventory: ['inventory', 'stock'],
    customers: ['customer'],
    staff: ['staff', 'operation']
  };
  const keywords = domainKeywordMap[reportKey] || [];
  const matched = insights.filter(i => {
    const dom = String(i.domain || '').toLowerCase();
    return keywords.some(kw => dom.includes(kw));
  });
  if (matched.length === 0) {
    return 'All monitored metrics for this department are operating within normal shop thresholds.';
  }
  return matched.map(m => m.text).join(' ');
}

function formatPeriodLabel(period) {
  const map = {
    all: 'All Time (Cumulative)',
    today: 'Today',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
    '90d': 'Last 90 Days'
  };
  return map[period] || 'All Time';
}

function wrapInA4Document(docCode, docTitle, innerSectionsHTML) {
  const genDate = new Date((latestRealtimeReport && latestRealtimeReport.generatedAt) || Date.now());
  const formattedDate = genDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const formattedTime = genDate.toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const periodLabel = formatPeriodLabel(latestRealtimeReport ? latestRealtimeReport.period : 'all');
  const preparedBy = (currentUser && currentUser.full_name) ? currentUser.full_name : 'Shop Administrator';

  return `
    <div class="a4-letterhead">
      <div class="a4-brand-block">
        <img src="/images/elight-logo.svg?v=7" alt="Elight Logo">
        <div>
          <h3>ELIGHT ELECTRICAL SHOP</h3>
          <p>
            Elight Plaza, Njuri Ncheke Street, Meru County, Kenya<br>
            Tel: +254 700 123 456 &bull; Email: elightelectrical@ke.com
          </p>
        </div>
      </div>
      <div class="a4-meta-block">
        <div class="a4-meta-badge">Official Management Report</div><br>
        <strong>Doc Ref:</strong> ${escapeHTML(docCode)}<br>
        <strong>Period:</strong> ${escapeHTML(periodLabel)}<br>
        <strong>Generated:</strong> ${escapeHTML(formattedDate)}, ${escapeHTML(formattedTime)}
      </div>
    </div>

    <div class="a4-doc-title-bar">
      <h4>${escapeHTML(docTitle)}</h4>
      <span>Currency: Kenya Shillings (KES)</span>
    </div>

    ${innerSectionsHTML}

    <div class="a4-footer">
      <div>
        <strong>Prepared By:</strong> ${escapeHTML(preparedBy)}<br>
        <span>Source: Elight Live ERP Database (Meru)</span>
      </div>
      <div>
        <strong>Verified By:</strong> <span class="a4-sig-line"></span>
      </div>
      <div style="text-align:right;">
        <strong>Page 1 of 1</strong><br>
        <span>Confidential Management Record</span>
      </div>
    </div>
  `;
}

function buildSalesReportSection(sales) {
  const payRows = (sales.paymentBreakdown || []).map(p => `
    <tr>
      <td>${escapeHTML(p.method)}</td>
      <td class="num">${p.sharePct}%</td>
      <td class="num"><strong>${formatKES(p.amount)}</strong></td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;">No payment records in period.</td></tr>';

  const catRows = (sales.salesByCategory || []).map(c => `
    <tr>
      <td>${escapeHTML(c.category)}</td>
      <td class="num">${c.sharePct}%</td>
      <td class="num"><strong>${formatKES(c.amount)}</strong></td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;">No category sales in period.</td></tr>';

  const txRows = (sales.recentTransactions || []).map((tx, idx) => {
    const cleanDesc = String(tx.description || '—').replace(/\s*\[Cashier:\s*[^\]]+\]/i, '').trim();
    return `
      <tr>
        <td>${idx + 1}</td>
        <td style="font-family:monospace; font-weight:700;">${escapeHTML(tx.reference_no || ('FIN-' + tx.record_id))}</td>
        <td>${escapeHTML(tx.category || 'Sale')}</td>
        <td>${escapeHTML(cleanDesc)}</td>
        <td>${escapeHTML(tx.payment_method || 'M-Pesa')}</td>
        <td class="num"><strong>${formatKES(tx.amount)}</strong></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="text-align:center; padding:12px;">No sales transactions recorded in this period.</td></tr>';

  const topChannel = (sales.paymentBreakdown && sales.paymentBreakdown[0])
    ? `${sales.paymentBreakdown[0].method} (${sales.paymentBreakdown[0].sharePct}%)`
    : 'N/A';
  const topStream = (sales.salesByCategory && sales.salesByCategory[0])
    ? sales.salesByCategory[0].category
    : 'N/A';

  const bodyHTML = `
    <div class="a4-section">
      <h5 class="a4-section-heading">I. Sales Summary Metrics</h5>
      <div class="a4-kpi-grid">
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Total Gross Sales</div>
          <div class="a4-kpi-val" style="color:#047857;">${formatKES(sales.totalRevenue)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Receipts / Transactions</div>
          <div class="a4-kpi-val">${sales.transactionCount} Sales</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Average Sale Ticket</div>
          <div class="a4-kpi-val">${formatKES(sales.avgTransactionValue)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Primary Payment Channel</div>
          <div class="a4-kpi-val" style="font-size:0.84rem;">${escapeHTML(topChannel)}</div>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">II. Executive Sales Note</h5>
      <div class="a4-decision-box">
        Leading revenue stream: <strong>${escapeHTML(topStream)}</strong>. ${escapeHTML(getSelectedDecisionNote('sales'))}
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">III. Sales Distribution by Channel &amp; Stream</h5>
      <div class="a4-two-col">
        <div>
          <table class="a4-table">
            <thead>
              <tr>
                <th>Payment Channel</th>
                <th class="num">Share</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>${payRows}</tbody>
          </table>
        </div>
        <div>
          <table class="a4-table">
            <thead>
              <tr>
                <th>Sales Stream</th>
                <th class="num">Share</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>${catRows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">IV. Itemized Sales Register</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:28px;">#</th>
            <th>Ref No.</th>
            <th>Stream</th>
            <th>Transaction Description</th>
            <th>Method</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${txRows}
          <tr style="background:#f1f5f9; font-weight:800;">
            <td colspan="5" style="text-align:right;">TOTAL GROSS SALES</td>
            <td class="num" style="color:#047857;">${formatKES(sales.totalRevenue)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  return wrapInA4Document('RPT-SALES-2026', 'Sales Report', bodyHTML);
}

function buildCashierDetailedReportSection(cashierSales) {
  const cs = cashierSales || { totalRevenue: 0, totalTransactions: 0, activeCashiersCount: 0, groups: [] };
  const groups = cs.groups || [];

  const groupedTablesHTML = groups.length > 0
    ? groups.map((grp, gIdx) => {
        const rows = (grp.transactions || []).map((tx, idx) => {
          const dateStr = tx.created_at
            ? new Date(tx.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHTML(dateStr)}</td>
              <td style="font-family:monospace; font-weight:700;">${escapeHTML(tx.reference_no)}</td>
              <td>${escapeHTML(tx.category)}</td>
              <td>${escapeHTML(tx.description)}</td>
              <td>${escapeHTML(tx.payment_method)}</td>
              <td class="num"><strong>${formatKES(tx.amount)}</strong></td>
            </tr>
          `;
        }).join('');

        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; background:#eff6ff; border:1px solid #bfdbfe; border-bottom:none; padding:6px 10px; font-size:0.77rem;">
              <span><strong>Cashier ${gIdx + 1}: ${escapeHTML(grp.cashier_name)}</strong> (${escapeHTML(grp.cashier_role)})</span>
              <span><strong>${grp.transactionCount} Receipt(s) &bull; Share: ${grp.sharePct}%</strong></span>
            </div>
            <table class="a4-table">
              <thead>
                <tr>
                  <th style="width:26px;">#</th>
                  <th style="width:76px;">Date</th>
                  <th>Receipt / Ref</th>
                  <th>Stream</th>
                  <th>Item / Sale Description</th>
                  <th>Payment</th>
                  <th class="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr style="background:#f8fafc; font-weight:800;">
                  <td colspan="6" style="text-align:right;">Subtotal — ${escapeHTML(grp.cashier_name)}</td>
                  <td class="num" style="color:#1e3a8a;">${formatKES(grp.totalSales)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')
    : '<p style="text-align:center; padding:14px; font-size:0.8rem;">No cashier sales recorded in this period.</p>';

  const avgPerCashier = cs.activeCashiersCount > 0 ? cs.totalRevenue / cs.activeCashiersCount : 0;

  const bodyHTML = `
    <div class="a4-section">
      <h5 class="a4-section-heading">I. Cashier Detailed Overview</h5>
      <div class="a4-kpi-grid">
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Active Cashiers / Desks</div>
          <div class="a4-kpi-val">${cs.activeCashiersCount} Cashier(s)</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Total Receipts Issued</div>
          <div class="a4-kpi-val">${cs.totalTransactions} Receipts</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Avg. Revenue / Cashier</div>
          <div class="a4-kpi-val">${formatKES(avgPerCashier)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Combined Cashier Sales</div>
          <div class="a4-kpi-val" style="color:#047857;">${formatKES(cs.totalRevenue)}</div>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">II. Itemized Transactions Grouped by Cashier</h5>
      ${groupedTablesHTML}
      <div style="border:1px solid #0f172a; background:#f1f5f9; padding:8px 12px; display:flex; justify-content:space-between; font-size:0.82rem; font-weight:800;">
        <span>GRAND TOTAL SALES ACROSS ALL CASHIERS (${cs.totalTransactions} RECEIPTS)</span>
        <span style="color:#047857;">${formatKES(cs.totalRevenue)}</span>
      </div>
    </div>
  `;

  return wrapInA4Document('RPT-CSHD-2026', 'Sales by Cashier Detailed', bodyHTML);
}

function buildCashierSummaryReportSection(cashierSales) {
  const cs = cashierSales || { totalRevenue: 0, totalTransactions: 0, activeCashiersCount: 0, summary: [] };
  const summary = cs.summary || [];
  const totalMpesa = summary.reduce((s, c) => s + Number(c.mpesaSales || 0), 0);
  const totalOther = summary.reduce((s, c) => s + Number(c.cashOrBankSales || 0), 0);
  const topCashier = summary[0] ? summary[0].cashier_name : '—';

  const summaryRows = summary.length > 0
    ? summary.map((c, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHTML(c.cashier_name)}</strong></td>
          <td style="text-transform:capitalize;">${escapeHTML(c.cashier_role)}</td>
          <td class="num">${c.transactionCount}</td>
          <td class="num">${formatKES(c.mpesaSales)}</td>
          <td class="num">${formatKES(c.cashOrBankSales)}</td>
          <td class="num">${formatKES(c.avgTicket)}</td>
          <td class="num">${c.sharePct}%</td>
          <td class="num"><strong>${formatKES(c.totalSales)}</strong></td>
        </tr>
      `).join('')
    : '<tr><td colspan="9" style="text-align:center; padding:12px;">No cashier sales recorded in this period.</td></tr>';

  const bodyHTML = `
    <div class="a4-section">
      <h5 class="a4-section-heading">I. Cashier Collections Summary</h5>
      <div class="a4-kpi-grid">
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Active Cashiers</div>
          <div class="a4-kpi-val">${cs.activeCashiersCount} Cashier(s)</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">M-Pesa Collections</div>
          <div class="a4-kpi-val" style="color:#047857;">${formatKES(totalMpesa)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Cash / Bank Collections</div>
          <div class="a4-kpi-val">${formatKES(totalOther)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Top Collecting Cashier</div>
          <div class="a4-kpi-val" style="font-size:0.84rem;">${escapeHTML(topCashier)}</div>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">II. Reconciliation Note</h5>
      <div class="a4-decision-box">
        Total verified till and counter collections across <strong>${cs.activeCashiersCount}</strong> cashier station(s) equal <strong>${formatKES(cs.totalRevenue)}</strong> from <strong>${cs.totalTransactions}</strong> confirmed receipt(s).
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">III. Consolidated Sales by Cashier Summary Table</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:26px;">#</th>
            <th>Cashier Name</th>
            <th>Station / Role</th>
            <th class="num">Receipts</th>
            <th class="num">M-Pesa</th>
            <th class="num">Cash / Bank</th>
            <th class="num">Avg Ticket</th>
            <th class="num">Share</th>
            <th class="num">Total Sales</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows}
          <tr style="background:#f1f5f9; font-weight:800;">
            <td colspan="3" style="text-align:right;">GRAND TOTAL</td>
            <td class="num">${cs.totalTransactions}</td>
            <td class="num">${formatKES(totalMpesa)}</td>
            <td class="num">${formatKES(totalOther)}</td>
            <td class="num">${formatKES(cs.totalTransactions > 0 ? cs.totalRevenue / cs.totalTransactions : 0)}</td>
            <td class="num">100%</td>
            <td class="num" style="color:#047857;">${formatKES(cs.totalRevenue)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  return wrapInA4Document('RPT-CSHS-2026', 'Sales by Cashier Summary', bodyHTML);
}

function buildProfitAndLossReportSection(pnl) {
  const p = pnl || {
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    profitMarginPct: 0,
    salesTransactionCount: 0,
    expenseTransactionCount: 0,
    revenueByCategory: [],
    expensesByCategory: [],
    expenseLedger: []
  };

  const revRows = (p.revenueByCategory || []).map((r, idx) => `
    <tr>
      <td>40${idx + 1}</td>
      <td>${escapeHTML(r.category)}</td>
      <td class="num">${r.sharePct}%</td>
      <td class="num"><strong>${formatKES(r.amount)}</strong></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;">No operating revenue recorded in this period.</td></tr>';

  const expCatRows = (p.expensesByCategory || []).map((e, idx) => `
    <tr>
      <td>50${idx + 1}</td>
      <td>${escapeHTML(e.category)}</td>
      <td class="num">${e.sharePct}%</td>
      <td class="num"><strong>(${formatKES(e.amount)})</strong></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;">No operating expenses recorded in this period.</td></tr>';

  const expLedgerRows = (p.expenseLedger || []).map((ex, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td style="font-family:monospace; font-weight:700;">${escapeHTML(ex.reference_no || ('EXP-' + ex.record_id))}</td>
      <td>${escapeHTML(ex.category || 'Expense')}</td>
      <td>${escapeHTML(ex.description || '—')}</td>
      <td>${escapeHTML(ex.payment_method || 'M-Pesa')}</td>
      <td class="num"><strong>${formatKES(ex.amount)}</strong></td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center; padding:10px;">No expense vouchers recorded in this period.</td></tr>';

  const isProfit = Number(p.netProfit || 0) >= 0;

  const bodyHTML = `
    <div class="a4-section">
      <h5 class="a4-section-heading">I. Income Statement Highlights</h5>
      <div class="a4-kpi-grid">
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Total Operating Income</div>
          <div class="a4-kpi-val" style="color:#047857;">${formatKES(p.totalRevenue)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Total Operating Expenses</div>
          <div class="a4-kpi-val" style="color:#b91c1c;">${formatKES(p.totalExpenses)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Net ${isProfit ? 'Profit' : 'Loss'}</div>
          <div class="a4-kpi-val" style="color:${isProfit ? '#047857' : '#b91c1c'};">${formatKES(p.netProfit)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Net Profit Margin</div>
          <div class="a4-kpi-val">${p.profitMarginPct}%</div>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">II. Operating Revenue (Income Schedule)</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:58px;">Acct</th>
            <th>Revenue Stream</th>
            <th class="num">Share of Income</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${revRows}
          <tr style="background:#ecfdf5; font-weight:800;">
            <td colspan="3" style="text-align:right;">TOTAL OPERATING REVENUE (${p.salesTransactionCount} Sales)</td>
            <td class="num" style="color:#047857;">${formatKES(p.totalRevenue)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">III. Less: Operating &amp; Direct Expenses</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:58px;">Acct</th>
            <th>Expense Account / Category</th>
            <th class="num">Share of Costs</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${expCatRows}
          <tr style="background:#fef2f2; font-weight:800;">
            <td colspan="3" style="text-align:right;">TOTAL OPERATING EXPENSES (${p.expenseTransactionCount} Vouchers)</td>
            <td class="num" style="color:#b91c1c;">(${formatKES(p.totalExpenses)})</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:10px; border:2px solid #0f172a; background:${isProfit ? '#ecfdf5' : '#fef2f2'}; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; font-size:0.88rem; font-weight:800;">
        <span>NET OPERATING ${isProfit ? 'PROFIT' : 'LOSS'} FOR THE PERIOD (${p.profitMarginPct}% MARGIN)</span>
        <span style="font-size:1rem; color:${isProfit ? '#047857' : '#b91c1c'};">${formatKES(p.netProfit)}</span>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">IV. Supporting Expense Voucher Schedule</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:28px;">#</th>
            <th>Ref No.</th>
            <th>Category</th>
            <th>Expense Description</th>
            <th>Method</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${expLedgerRows}</tbody>
      </table>
    </div>
  `;

  return wrapInA4Document('RPT-PNL-2026', 'Profit and Loss Statement', bodyHTML);
}

function buildInventoryReportSection(inventory) {
  const catRows = (inventory.categoryInventory || []).map((c, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escapeHTML(c.category)}</strong></td>
      <td class="num">${c.skuCount}</td>
      <td class="num">${c.units}</td>
      <td class="num">${formatKES(c.costValue)}</td>
      <td class="num"><strong>${formatKES(c.retailValue)}</strong></td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center; padding:12px;">No catalog items found.</td></tr>';

  const restockRows = (inventory.restockPriorityList || []).map((item, idx) => {
    const qty = Number(item.quantity_in_stock || 0);
    const reorder = Number(item.reorder_level || 5);
    const statusText = qty === 0 ? 'OUT OF STOCK' : 'LOW STOCK';
    const statusColor = qty === 0 ? '#b91c1c' : '#b45309';
    return `
      <tr>
        <td>${idx + 1}</td>
        <td style="font-family:monospace; font-weight:700;">${escapeHTML(item.sku || ('SKU-' + item.product_id))}</td>
        <td><strong>${escapeHTML(item.product_name)}</strong></td>
        <td>${escapeHTML(item.category_name || '—')}</td>
        <td class="num">${qty} / ${reorder}</td>
        <td style="font-weight:800; color:${statusColor}; font-size:0.7rem;">${statusText}</td>
        <td class="num">${formatKES(item.buying_price)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" style="text-align:center; padding:10px; color:#047857; font-weight:700;">All catalog SKUs are stocked above minimum reorder thresholds.</td></tr>';

  const bodyHTML = `
    <div class="a4-section">
      <h5 class="a4-section-heading">I. Stock Valuation &amp; Flow Summary</h5>
      <div class="a4-kpi-grid">
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Retail Valuation (${inventory.totalUnits} Units)</div>
          <div class="a4-kpi-val" style="color:#047857;">${formatKES(inventory.retailValuation)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Cost Valuation (${inventory.totalSkus} SKUs)</div>
          <div class="a4-kpi-val">${formatKES(inventory.costValuation)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Projected Stock Margin</div>
          <div class="a4-kpi-val" style="color:#1e3a8a;">${formatKES(inventory.projectedGrossMargin)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Alerts &amp; Period Flow</div>
          <div class="a4-kpi-val" style="font-size:0.82rem;">
            ${inventory.outOfStockCount} Out / ${inventory.lowStockCount} Low
            <span style="display:block; font-size:0.7rem; color:#475569; font-weight:600;">+${inventory.stockInUnits} In &bull; -${inventory.stockOutUnits} Out</span>
          </div>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">II. Inventory Health Assessment</h5>
      <div class="a4-decision-box">${escapeHTML(getSelectedDecisionNote('inventory'))}</div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">III. Valuation Schedule by Electrical Category</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:28px;">#</th>
            <th>Product Category</th>
            <th class="num">SKUs</th>
            <th class="num">Units On Hand</th>
            <th class="num">Cost Valuation</th>
            <th class="num">Retail Valuation</th>
          </tr>
        </thead>
        <tbody>${catRows}</tbody>
      </table>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">IV. Priority Restock Action Schedule</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:28px;">#</th>
            <th>SKU</th>
            <th>Product Description</th>
            <th>Category</th>
            <th class="num">Qty / Min</th>
            <th>Status</th>
            <th class="num">Unit Cost</th>
          </tr>
        </thead>
        <tbody>${restockRows}</tbody>
      </table>
    </div>
  `;

  return wrapInA4Document('RPT-INV-2026', 'Inventory Valuation & Stock Report', bodyHTML);
}

function buildCustomerActivityReportSection(cust) {
  const topRows = (cust.topCustomers || []).map((c, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escapeHTML(c.customer_name)}</strong></td>
      <td>${escapeHTML(c.phone)}</td>
      <td>${escapeHTML(c.location)}</td>
      <td class="num">${c.ordersCount}</td>
      <td class="num">${c.bookingsCount}</td>
      <td class="num">${c.warrantiesCount}</td>
      <td class="num"><strong>${formatKES(c.bookingValue)}</strong></td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center; padding:12px;">No customer activity recorded yet.</td></tr>';

  const bodyHTML = `
    <div class="a4-section">
      <h5 class="a4-section-heading">I. Customer Engagement &amp; Satisfaction Summary</h5>
      <div class="a4-kpi-grid">
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Registered Clients</div>
          <div class="a4-kpi-val">${cust.registeredCustomers} Clients (${cust.activeWarranties} Warr.)</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Bookings Pipeline (${cust.confirmedBookingsCount})</div>
          <div class="a4-kpi-val" style="color:#047857;">${formatKES(cust.bookingPipelineValue)}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Dispatches Delivered</div>
          <div class="a4-kpi-val">${cust.deliveredOrders} of ${cust.totalDispatches} Orders</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Rating &amp; Support Queue</div>
          <div class="a4-kpi-val" style="font-size:0.82rem;">
            ${cust.averageRating} / 5.0 (${cust.totalReviews} Rev.)
            <span style="display:block; font-size:0.7rem; color:#b91c1c; font-weight:700;">${cust.unresolvedComplaints} Complaints &bull; ${cust.unreadInquiries} Unread</span>
          </div>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">II. Customer Experience Assessment</h5>
      <div class="a4-decision-box">${escapeHTML(getSelectedDecisionNote('customers'))}</div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">III. Top Customer Activity &amp; Pipeline Register</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:28px;">#</th>
            <th>Customer Name</th>
            <th>Phone</th>
            <th>Location</th>
            <th class="num">Orders</th>
            <th class="num">Bookings</th>
            <th class="num">Warranties</th>
            <th class="num">Booking Value</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>
    </div>
  `;

  return wrapInA4Document('RPT-CUST-2026', 'Customer Activity & Satisfaction Report', bodyHTML);
}

function buildStaffPerformanceReportSection(staff) {
  const rows = (staff.scorecard || []).map((s, idx) => {
    let statusColor = '#0369a1';
    if (s.ratingLabel === 'Top Performer') statusColor = '#047857';
    else if (s.ratingLabel === 'Follow-Up Needed') statusColor = '#b91c1c';

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHTML(s.full_name)}</strong></td>
        <td style="text-transform:capitalize;">${escapeHTML(String(s.role || 'staff').replace(/_/g, ' '))}</td>
        <td class="num">${s.assignedTasks}</td>
        <td class="num">${s.completedTasks}</td>
        <td class="num">${s.inProgressTasks}</td>
        <td class="num">${s.stockOpsLogged} (${s.unitsHandled} u)</td>
        <td class="num"><strong>${s.completionRate}%</strong></td>
        <td style="font-weight:800; color:${statusColor}; font-size:0.72rem;">${escapeHTML(s.ratingLabel)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9" style="text-align:center; padding:12px;">No staff productivity records found.</td></tr>';

  const bodyHTML = `
    <div class="a4-section">
      <h5 class="a4-section-heading">I. Workforce Productivity Summary</h5>
      <div class="a4-kpi-grid">
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Active Personnel</div>
          <div class="a4-kpi-val">${staff.totalStaffCount} Staff</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Service Jobs Completed</div>
          <div class="a4-kpi-val" style="color:#047857;">${staff.completedServiceJobs} of ${staff.totalServiceJobs}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Deliveries Completed</div>
          <div class="a4-kpi-val" style="color:#047857;">${staff.completedDeliveries} of ${staff.totalDeliveries}</div>
        </div>
        <div class="a4-kpi-box">
          <div class="a4-kpi-label">Stock Movements Logged</div>
          <div class="a4-kpi-val">${staff.totalStockMovements} Operations</div>
        </div>
      </div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">II. Operations &amp; Staffing Assessment</h5>
      <div class="a4-decision-box">${escapeHTML(getSelectedDecisionNote('staff'))}</div>
    </div>

    <div class="a4-section">
      <h5 class="a4-section-heading">III. Individual Staff Performance &amp; Appraisal Schedule</h5>
      <table class="a4-table">
        <thead>
          <tr>
            <th style="width:26px;">#</th>
            <th>Staff Name</th>
            <th>Role / Dept</th>
            <th class="num">Assigned</th>
            <th class="num">Done</th>
            <th class="num">Active</th>
            <th class="num">Stock Ops</th>
            <th class="num">Rate</th>
            <th>Standing</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  return wrapInA4Document('RPT-STF-2026', 'Staff Performance & Productivity Report', bodyHTML);
}

function renderRealtimeReportsView() {
  const bodyEl = document.getElementById('realtime-reports-body');
  if (!bodyEl || !latestRealtimeReport) return;

  const { sales, cashierSales, profitAndLoss, purchases, inventory, customerActivity, staffPerformance } = latestRealtimeReport;

  if (currentReportSubTab === 'cashier_detailed') {
    bodyEl.innerHTML = buildCashierDetailedReportSection(cashierSales);
  } else if (currentReportSubTab === 'cashier_summary') {
    bodyEl.innerHTML = buildCashierSummaryReportSection(cashierSales);
  } else if (currentReportSubTab === 'profit_loss') {
    bodyEl.innerHTML = buildProfitAndLossReportSection(profitAndLoss);
  } else if (currentReportSubTab === 'inventory') {
    bodyEl.innerHTML = buildInventoryReportSection(inventory);
  } else if (currentReportSubTab === 'customers') {
    bodyEl.innerHTML = buildCustomerActivityReportSection(customerActivity);
  } else if (currentReportSubTab === 'staff') {
    bodyEl.innerHTML = buildStaffPerformanceReportSection(staffPerformance);
  } else {
    bodyEl.innerHTML = buildSalesReportSection(sales);
  }
}

function csvCell(val) {
  const str = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
  return `"${str}"`;
}

function exportRealtimeReportCSV() {
  if (!latestRealtimeReport) {
    showToast('Wait for report data to load before exporting.', 'error');
    return;
  }

  const r = latestRealtimeReport;
  const selected = currentReportSubTab || 'sales';
  const lines = [];
  const titleMap = {
    sales: 'SALES REPORT',
    cashier_detailed: 'SALES BY CASHIER DETAILED',
    cashier_summary: 'SALES BY CASHIER SUMMARY',
    profit_loss: 'PROFIT AND LOSS STATEMENT',
    purchases: 'PURCHASES REPORT',
    inventory: 'INVENTORY REPORT',
    customers: 'CUSTOMER ACTIVITY REPORT',
    staff: 'STAFF PERFORMANCE REPORT'
  };

  lines.push([`ELIGHT ELECTRICAL SHOP (MERU) - ${titleMap[selected] || 'DECISION REPORT'}`].map(csvCell).join(','));
  lines.push(['Generated At', r.generatedAt, 'Period Filter', r.period].map(csvCell).join(','));
  lines.push('');

  if (selected === 'sales') {
    lines.push(['Metric', 'Value'].map(csvCell).join(','));
    lines.push(['Gross Sales Revenue (KES)', r.sales.totalRevenue].map(csvCell).join(','));
    lines.push(['Total Sales Transactions', r.sales.transactionCount].map(csvCell).join(','));
    lines.push(['Average Ticket Value (KES)', r.sales.avgTransactionValue].map(csvCell).join(','));
    lines.push('');
    lines.push(['Reference', 'Category', 'Description', 'Payment Method', 'Amount (KES)'].map(csvCell).join(','));
    (r.sales.recentTransactions || []).forEach(tx => {
      lines.push([tx.reference_no || tx.record_id, tx.category, tx.description, tx.payment_method, tx.amount].map(csvCell).join(','));
    });
  } else if (selected === 'cashier_detailed') {
    lines.push(['Cashier Name', 'Role / Station', 'Receipt / Ref', 'Date', 'Stream', 'Description', 'Payment Method', 'Amount (KES)'].map(csvCell).join(','));
    ((r.cashierSales && r.cashierSales.detailedTransactions) || []).forEach(tx => {
      lines.push([tx.cashier_name, tx.cashier_role, tx.reference_no, tx.created_at || '', tx.category, tx.description, tx.payment_method, tx.amount].map(csvCell).join(','));
    });
  } else if (selected === 'cashier_summary') {
    lines.push(['Cashier Name', 'Role / Station', 'Receipts', 'M-Pesa Sales (KES)', 'Cash/Bank Sales (KES)', 'Average Ticket (KES)', 'Share (%)', 'Total Sales (KES)'].map(csvCell).join(','));
    ((r.cashierSales && r.cashierSales.summary) || []).forEach(c => {
      lines.push([c.cashier_name, c.cashier_role, c.transactionCount, c.mpesaSales, c.cashOrBankSales, c.avgTicket, c.sharePct, c.totalSales].map(csvCell).join(','));
    });
  } else if (selected === 'profit_loss') {
    const pnl = r.profitAndLoss || {};
    lines.push(['Statement Line', 'Amount (KES)'].map(csvCell).join(','));
    lines.push(['Total Operating Revenue', pnl.totalRevenue || 0].map(csvCell).join(','));
    (pnl.revenueByCategory || []).forEach(cat => {
      lines.push([`  Income: ${cat.category}`, cat.amount].map(csvCell).join(','));
    });
    lines.push(['Total Operating Expenses', pnl.totalExpenses || 0].map(csvCell).join(','));
    (pnl.expensesByCategory || []).forEach(exp => {
      lines.push([`  Expense: ${exp.category}`, exp.amount].map(csvCell).join(','));
    });
    lines.push(['Net Operating Profit / (Loss)', pnl.netProfit || 0].map(csvCell).join(','));
    lines.push(['Net Profit Margin (%)', pnl.profitMarginPct || 0].map(csvCell).join(','));
  } else if (selected === 'inventory') {
    lines.push(['Metric', 'Value'].map(csvCell).join(','));
    lines.push(['Total Catalog SKUs', r.inventory.totalSkus].map(csvCell).join(','));
    lines.push(['Total Units In Stock', r.inventory.totalUnits].map(csvCell).join(','));
    lines.push(['Cost Valuation (KES)', r.inventory.costValuation].map(csvCell).join(','));
    lines.push(['Retail Valuation (KES)', r.inventory.retailValuation].map(csvCell).join(','));
    lines.push(['Projected Gross Margin (KES)', r.inventory.projectedGrossMargin].map(csvCell).join(','));
    lines.push(['Low / Out-of-Stock SKUs', `${r.inventory.lowStockCount} Low / ${r.inventory.outOfStockCount} Out`].map(csvCell).join(','));
    lines.push('');
    lines.push(['Category', 'SKUs', 'Units On Hand', 'Cost Valuation (KES)', 'Retail Valuation (KES)'].map(csvCell).join(','));
    (r.inventory.categoryInventory || []).forEach(c => {
      lines.push([c.category, c.skuCount, c.units, c.costValue, c.retailValue].map(csvCell).join(','));
    });
    lines.push('');
    lines.push(['SKU', 'Product Name', 'Category', 'Qty In Stock', 'Reorder Level', 'Unit Buying Price (KES)'].map(csvCell).join(','));
    (r.inventory.restockPriorityList || []).forEach(item => {
      lines.push([item.sku, item.product_name, item.category_name, item.quantity_in_stock, item.reorder_level, item.buying_price].map(csvCell).join(','));
    });
  } else if (selected === 'customers') {
    lines.push(['Metric', 'Value'].map(csvCell).join(','));
    lines.push(['Registered Customers', r.customerActivity.registeredCustomers].map(csvCell).join(','));
    lines.push(['Active Warranties', r.customerActivity.activeWarranties].map(csvCell).join(','));
    lines.push(['Confirmed Bookings Pipeline (KES)', r.customerActivity.bookingPipelineValue].map(csvCell).join(','));
    lines.push(['Average Customer Rating', r.customerActivity.averageRating].map(csvCell).join(','));
    lines.push(['Open Complaints', r.customerActivity.unresolvedComplaints].map(csvCell).join(','));
    lines.push(['Unread Inquiries', r.customerActivity.unreadInquiries].map(csvCell).join(','));
    lines.push('');
    lines.push(['Customer Name', 'Phone', 'Location', 'Orders', 'Bookings', 'Warranties', 'Booking Pipeline (KES)'].map(csvCell).join(','));
    (r.customerActivity.topCustomers || []).forEach(c => {
      lines.push([c.customer_name, c.phone, c.location, c.ordersCount, c.bookingsCount, c.warrantiesCount, c.bookingValue].map(csvCell).join(','));
    });
  } else if (selected === 'staff') {
    lines.push(['Staff Name', 'Role', 'Assigned Tasks', 'Completed Tasks', 'In Progress', 'Stock Ops', 'Units Handled', 'Completion Rate (%)', 'Standing'].map(csvCell).join(','));
    (r.staffPerformance.scorecard || []).forEach(s => {
      lines.push([s.full_name, s.role, s.assignedTasks, s.completedTasks, s.inProgressTasks, s.stockOpsLogged, s.unitsHandled, s.completionRate, s.ratingLabel].map(csvCell).join(','));
    });
  }

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `elight_${selected}_report_${datePart}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Selected report exported to CSV!', 'success');
}

// ========================================================
// CUSTOMER CARE FOLLOW-UP DESK (STAGE 6 & 8)
// ========================================================
let allCustomerCareTasks = [];

async function loadCustomerCareDesk() {
  const tbody = document.getElementById('customer-care-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">Loading customer follow-up tasks...</td></tr>';
  }

  try {
    const res = await fetch('/api/customer-care/tasks');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load Customer Care tasks');

    allCustomerCareTasks = data.tasks || [];
    const counts = data.counts || {};

    const elTotal = document.getElementById('cc-kpi-total');
    if (elTotal) elTotal.textContent = counts.total || allCustomerCareTasks.length;
    const elPending = document.getElementById('cc-kpi-pending');
    if (elPending) elPending.textContent = counts.pending || 0;
    const elComp = document.getElementById('cc-kpi-completed');
    if (elComp) elComp.textContent = counts.completed || 0;
    const elComplaints = document.getElementById('cc-kpi-complaints');
    if (elComplaints) elComplaints.textContent = counts.complaints || 0;

    renderCustomerCareTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#dc2626; padding:24px;">Failed to load tasks: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function filterCustomerCareTasks() {
  renderCustomerCareTable();
}

function renderCustomerCareTable() {
  const tbody = document.getElementById('customer-care-tbody');
  if (!tbody) return;

  const filterStatus = document.getElementById('cc-filter-status')?.value || 'all';
  const query = (document.getElementById('cc-search-input')?.value || '').toLowerCase().trim();

  let list = [...allCustomerCareTasks];
  if (filterStatus === 'pending') {
    list = list.filter(t => t.status === 'pending');
  } else if (filterStatus === 'completed') {
    list = list.filter(t => t.status === 'completed');
  } else if (filterStatus === 'complaint') {
    list = list.filter(t => t.is_complaint);
  }

  if (query) {
    list = list.filter(t =>
      String(t.order_no || '').toLowerCase().includes(query) ||
      String(t.task_id || '').toLowerCase().includes(query) ||
      String(t.customer_name || '').toLowerCase().includes(query) ||
      String(t.customer_phone || '').toLowerCase().includes(query)
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">No follow-up tasks found matching filter.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(t => {
    const isDone = t.status === 'completed';
    return `
      <tr>
        <td>
          <strong style="font-family:monospace; color:#1e3a8a;">${escapeHTML(t.task_id)}</strong><br>
          <small style="color:#64748b;">Order: <code>${escapeHTML(t.order_no)}</code></small>
        </td>
        <td>
          <strong>${escapeHTML(t.customer_name)}</strong><br>
          <small style="color:#64748b;">📞 ${escapeHTML(t.customer_phone || '-')}</small>
        </td>
        <td>
          <span class="badge-tag" style="background:#e0f2fe; color:#0369a1; font-weight:700;">
            ${escapeHTML(t.trigger_event || 'Order Fulfillment')}
          </span>
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${formatActivityTime(t.created_at)}</div>
        </td>
        <td>
          ${isDone ? `
            <div style="font-size:0.8rem;">
              <div>📦 Condition: <strong>${escapeHTML(t.product_condition || 'Good')}</strong></div>
              <div>🚚 Delivery: <strong>${'⭐'.repeat(Math.min(5, Math.max(1, Number(t.delivery_satisfaction || 5))))}</strong></div>
              ${t.installation_satisfaction ? `<div>🔧 Install: <strong>${'⭐'.repeat(Math.min(5, Math.max(1, Number(t.installation_satisfaction))))}</strong></div>` : ''}
              ${t.feedback ? `<div style="color:#475569; font-style:italic; margin-top:2px;">"${escapeHTML(t.feedback)}"</div>` : ''}
            </div>
          ` : `<span style="color:#64748b; font-size:0.8rem;">Pending Customer Contact</span>`}
        </td>
        <td>
          ${t.is_complaint ? `
            <span class="badge-tag" style="background:#fee2e2; color:#b91c1c; font-weight:800;">
              ⚠️ COMPLAINT
            </span>
          ` : `<span class="badge-tag" style="background:#dcfce7; color:#15803d;">None</span>`}
        </td>
        <td>
          <span class="badge-tag" style="background:${isDone ? '#dcfce7' : '#fef3c7'}; color:${isDone ? '#15803d' : '#b45309'}; font-weight:700;">
            ${isDone ? 'Completed' : 'Pending Follow-Up'}
          </span>
          ${t.completed_by ? `<div style="font-size:0.72rem; color:#64748b; margin-top:2px;">By: ${escapeHTML(t.completed_by)}</div>` : ''}
        </td>
        <td>
          ${!isDone ? `
            <button class="btn-sm" style="background:#1e3a8a; color:#fff; font-weight:700; padding:6px 12px;" onclick="openCustomerCareModal('${escapeHTML(t.task_id)}')">
              📞 Call &amp; Log
            </button>
          ` : `
            <button class="btn-sm" style="background:#f1f5f9; color:#475569; padding:4px 8px; font-size:0.75rem;" onclick="openCustomerCareModal('${escapeHTML(t.task_id)}')">
              👁️ View Log
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function openCustomerCareModal(taskId) {
  const task = allCustomerCareTasks.find(t => t.task_id === taskId);
  if (!task) {
    showToast('Task not found', 'error');
    return;
  }

  document.getElementById('cc_modal_task_id').value = task.task_id;
  document.getElementById('cc_modal_order_no').value = task.order_no;

  const summaryEl = document.getElementById('cc-modal-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="font-weight:800; font-size:1rem; color:#0f172a;">Task: ${escapeHTML(task.task_id)} — Order #${escapeHTML(task.order_no)}</div>
      <div style="font-size:0.85rem; color:#475569; margin-top:4px;">
        👤 Customer: <strong>${escapeHTML(task.customer_name)}</strong> (${escapeHTML(task.customer_phone || '-')})<br>
        🎯 Trigger: <strong>${escapeHTML(task.trigger_event || 'Delivered')}</strong> on ${formatActivityTime(task.created_at)}
      </div>
    `;
  }

  document.getElementById('cc_product_condition').value = task.product_condition || 'Good Condition';
  document.getElementById('cc_delivery_satisfaction').value = task.delivery_satisfaction || '5';
  document.getElementById('cc_installation_satisfaction').value = task.installation_satisfaction || '';
  document.getElementById('cc_delivery_notes').value = task.delivery_notes || '';
  document.getElementById('cc_feedback_notes').value = task.feedback || '';
  document.getElementById('cc_is_complaint').checked = Boolean(task.is_complaint);

  openModal('customer-care-modal');
}

async function handleCustomerCareSubmit(e) {
  e.preventDefault();
  const taskId = document.getElementById('cc_modal_task_id').value;
  const payload = {
    product_condition: document.getElementById('cc_product_condition').value,
    delivery_satisfaction: Number(document.getElementById('cc_delivery_satisfaction').value),
    installation_satisfaction: document.getElementById('cc_installation_satisfaction').value ? Number(document.getElementById('cc_installation_satisfaction').value) : null,
    delivery_notes: document.getElementById('cc_delivery_notes')?.value.trim() || '',
    feedback: document.getElementById('cc_feedback_notes')?.value.trim() || '',
    is_complaint: document.getElementById('cc_is_complaint')?.checked || false,
    agent_name: currentUser?.full_name || 'Customer Care Agent'
  };

  try {
    const res = await fetch(`/api/customer-care/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to complete task');

    closeModal('customer-care-modal');
    showToast(`Customer care follow-up logged for ${taskId}!`, 'success');
    loadCustomerCareDesk();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// INVENTORY MATERIAL REQUESTS & ISSUE WORKFLOW (STEPS 3, 4, 5)
// ========================================================
let allMaterialRequestsCached = [];

async function loadInventoryMaterialRequests() {
  const tbody = document.getElementById('inventory-mr-tbody');
  if (!tbody) return;
  const filter = document.getElementById('inv-mr-filter')?.value || 'all';
  try {
    const res = await fetch(`/api/inventory/material-requests?status=${encodeURIComponent(filter)}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(`Unexpected response from server (${res.status}). Restart the Node server if routes were recently updated.`);
    }
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed loading material requests');
    const list = data.material_requests || [];
    allMaterialRequestsCached = list;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No technician material requests found.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(mr => {
      const itemsHtml = (mr.items || []).map(it => {
        const stockOk = Number(it.current_stock || 0) >= Number(it.requested_qty || 0);
        const stockBadge = stockOk
          ? `<span style="color:#087443; font-weight:700;">Stock: ${it.current_stock}</span>`
          : `<span style="color:#dc2626; font-weight:700;">Stock: ${it.current_stock} (Short)</span>`;
        const qtyMeta = mr.status === 'pending'
          ? `Req: ${it.requested_qty}`
          : `Req: ${it.requested_qty} • App: ${it.approved_qty}`;
        return `<div style="font-size:0.8rem; margin-bottom:2px;">• <strong>${escapeHTML(it.product_name)}</strong> (${qtyMeta}) — ${stockBadge}</div>`;
      }).join('');

      let statusStyle = 'background:#fef3c7; color:#b45309;';
      if (mr.status === 'approved') statusStyle = 'background:#dbeafe; color:#1d4ed8;';
      else if (mr.status === 'partially_approved') statusStyle = 'background:#e0e7ff; color:#4338ca;';
      else if (mr.status === 'issued') statusStyle = 'background:#dcfce7; color:#15803d;';
      else if (mr.status === 'rejected') statusStyle = 'background:#fee2e2; color:#b91c1c;';

      let actionHtml = '';
      if (mr.status === 'pending') {
        actionHtml = `<button type="button" class="btn-sm btn-primary" onclick="openInventoryMrReviewModal(${mr.material_request_id})">📦 Check Stock &amp; Review</button>`;
      } else if (mr.status === 'approved' || mr.status === 'partially_approved') {
        actionHtml = `<button type="button" class="btn-sm" style="background:#087443; color:#fff; font-weight:700;" onclick="issueMaterialRequestFromInventory(${mr.material_request_id})">📤 Issue Materials</button>`;
      } else if (mr.status === 'issued') {
        actionHtml = `<span style="font-size:0.78rem; color:#087443; font-weight:700;">✅ Issued by ${escapeHTML(mr.issued_by || 'Inventory')}<br>Stock Deducted</span>`;
      } else {
        actionHtml = `<span style="font-size:0.78rem; color:#dc2626;">❌ Rejected</span>`;
      }

      return `
        <tr>
          <td>
            <strong>${escapeHTML(mr.request_number)}</strong>
            <div style="font-size:0.74rem; color:#64748b;">${mr.created_at ? new Date(mr.created_at).toLocaleDateString() : ''}</div>
          </td>
          <td>
            <strong>#SR-${mr.service_request_id}</strong><br>
            <small>${escapeHTML(mr.customer_name || '')} • ${escapeHTML(mr.service_type || '')}</small>
          </td>
          <td><strong>${escapeHTML(mr.technician_name)}</strong></td>
          <td>${itemsHtml}${mr.notes ? `<div style="font-size:0.75rem; color:#64748b; margin-top:3px;">Note: ${escapeHTML(mr.notes)}</div>` : ''}</td>
          <td>
            <span class="badge-tag" style="${statusStyle} font-weight:700;">${escapeHTML(String(mr.status).replace(/_/g, ' ').toUpperCase())}</span>
            ${mr.review_notes ? `<div style="font-size:0.74rem; color:#475569; margin-top:3px;">${escapeHTML(mr.review_notes)}</div>` : ''}
          </td>
          <td style="white-space:nowrap;">${actionHtml}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#dc2626;">${escapeHTML(err.message)}</td></tr>`;
  }
}

function openInventoryMrReviewModal(mrId) {
  const mr = allMaterialRequestsCached.find(m => Number(m.material_request_id) === Number(mrId));
  if (!mr) return;
  document.getElementById('inv_mr_review_id').value = mr.material_request_id;
  document.getElementById('inv_mr_review_notes').value = '';
  document.getElementById('inv-mr-review-summary').innerHTML = `
    <strong>${escapeHTML(mr.request_number)}</strong> • Service <strong>#SR-${mr.service_request_id}</strong> (${escapeHTML(mr.service_type || '')})<br>
    <small>Requested by Technician: <strong>${escapeHTML(mr.technician_name)}</strong></small>
  `;
  document.getElementById('inv-mr-review-items').innerHTML = (mr.items || []).map((it, idx) => {
    const avail = Number(it.current_stock || 0);
    const reqQty = Number(it.requested_qty || 1);
    const maxAllowed = Math.min(reqQty, avail);
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; background:#fff;">
        <div style="font-size:0.84rem;">
          <strong>${escapeHTML(it.product_name)}</strong><br>
          <small style="color:#475569;">Requested: <strong>${reqQty}</strong> • Live Stock: <strong style="color:${avail >= reqQty ? '#087443' : '#dc2626'};">${avail}</strong></small>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <label for="inv_mr_app_${idx}" style="font-size:0.76rem; margin:0;">Approve Qty:</label>
          <input type="number" id="inv_mr_app_${idx}" class="inv-mr-app-input" data-product-id="${it.product_id}" min="0" max="${maxAllowed}" value="${maxAllowed}" style="width:76px; padding:5px 8px; border:1px solid #cbd5e1; border-radius:6px;">
        </div>
      </div>
    `;
  }).join('');

  openModal('inventory-mr-review-modal');
}

async function submitInventoryMrReview(action) {
  const mrId = Number(document.getElementById('inv_mr_review_id').value);
  const reviewNotes = document.getElementById('inv_mr_review_notes').value.trim();
  const role = normalizeRole(currentUser?.role);
  const items = Array.from(document.querySelectorAll('#inv-mr-review-items .inv-mr-app-input')).map(inp => ({
    product_id: Number(inp.dataset.productId),
    approved_qty: Math.max(0, parseInt(inp.value || 0, 10) || 0)
  }));

  try {
    const res = await fetch(`/api/inventory/material-requests/${mrId}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Role': role },
      body: JSON.stringify({
        action,
        items,
        review_notes: reviewNotes,
        user_role: role,
        actor: currentUser?.full_name || 'Inventory Manager'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Material review failed');
    closeModal('inventory-mr-review-modal');
    showToast(data.message, 'success');
    loadInventoryMaterialRequests();
    if (typeof loadTechnicianJobs === 'function') loadTechnicianJobs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function issueMaterialRequestFromInventory(mrId) {
  if (!confirm('Officially issue these approved materials to the technician? This will deduct quantities from inventory and record stock movements.')) {
    return;
  }
  const role = normalizeRole(currentUser?.role);
  try {
    const res = await fetch(`/api/inventory/material-requests/${mrId}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Role': role },
      body: JSON.stringify({
        user_role: role,
        actor: currentUser?.full_name || 'Inventory Manager'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed issuing materials');
    showToast(data.message, 'success');
    await Promise.all([
      loadInventoryMaterialRequests(),
      loadInventoryAndMovements()
    ]);
    if (typeof loadTechnicianJobs === 'function') loadTechnicianJobs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// FINANCE MANAGER: SERVICE FEE PAYMENT CONFIRMATION (STEP 9)
// ========================================================
let allFinanceServiceChargesCached = [];

async function loadFinanceServiceCharges() {
  const tbody = document.getElementById('fin-services-tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/finance/service-charges');
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(`Unexpected response from server (${res.status}). Restart the Node server if routes were recently updated.`);
    }
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed loading service charges');
    const list = data.services || [];
    const summary = data.summary || {};
    allFinanceServiceChargesCached = list;

    const pc = document.getElementById('fin-svc-pending-count');
    const pa = document.getElementById('fin-svc-pending-amt');
    const dc = document.getElementById('fin-svc-paid-count');
    const da = document.getElementById('fin-svc-paid-amt');
    if (pc) pc.textContent = summary.pending_payment_count || 0;
    if (pa) pa.textContent = formatKES(summary.pending_amount || 0);
    if (dc) dc.textContent = summary.paid_count || 0;
    if (da) da.textContent = formatKES(summary.collected_amount || 0);

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No completed/billed service jobs yet.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(s => {
      const isPaid = String(s.payment_status || '').toLowerCase() === 'paid';
      const fee = Number(s.service_fee || 0);
      return `
        <tr>
          <td>
            <strong>#SR-${s.request_id}</strong>
            ${s.booking_ref ? `<div style="font-size:0.74rem; color:#64748b;">${escapeHTML(s.booking_ref)}</div>` : ''}
          </td>
          <td>
            <strong>${escapeHTML(s.customer_name)}</strong><br>
            <small style="color:#64748b;">${escapeHTML(s.phone || '')}${s.customer_email ? ` • ${escapeHTML(s.customer_email)}` : ''}</small>
          </td>
          <td>
            <div style="font-weight:600;">${escapeHTML(s.service_type)}</div>
            <small style="color:#0369a1;">Tech: ${escapeHTML(s.technician_name || 'Assigned')}</small>
          </td>
          <td style="font-weight:800; color:#087443;">${formatKES(fee)}</td>
          <td>
            ${isPaid
              ? `<span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700;">✅ Paid</span>
                 <div style="font-size:0.75rem; color:#475569; margin-top:3px;">Receipt: <code>${escapeHTML(s.service_receipt_no || '')}</code> (${escapeHTML(s.service_payment_method || '')})</div>`
              : `<span class="badge-tag" style="background:#fef3c7; color:#b45309; font-weight:700;">⏳ Awaiting Finance Confirmation</span>`}
          </td>
          <td>
            ${isPaid
              ? `<span style="font-size:0.78rem; color:#087443; font-weight:700;">Confirmed by ${escapeHTML(s.service_payment_confirmed_by || 'Finance')}</span>`
              : (fee > 0
                ? `<button type="button" class="btn-sm" style="background:#087443; color:#fff; font-weight:700;" onclick="openFinanceServicePayModal(${s.request_id})">💵 Confirm Payment</button>`
                : `<span style="font-size:0.78rem; color:#64748b;">No Fee Charged</span>`)}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#dc2626;">${escapeHTML(err.message)}</td></tr>`;
  }
}

function openFinanceServicePayModal(requestId) {
  const s = allFinanceServiceChargesCached.find(item => Number(item.request_id) === Number(requestId));
  if (!s) return;
  document.getElementById('fin_svc_pay_id').value = s.request_id;
  document.getElementById('fin_svc_pay_amount').value = Number(s.service_fee || 0).toFixed(2);
  document.getElementById('fin_svc_pay_ref').value = '';
  syncServicePayRefRules();
  document.getElementById('fin-svc-pay-summary').innerHTML = `
    <strong>Service #SR-${s.request_id}: ${escapeHTML(s.service_type)}</strong><br>
    Customer: <strong>${escapeHTML(s.customer_name)}</strong> (${escapeHTML(s.phone || '')})
  `;
  openModal('finance-service-pay-modal');
}

async function handleConfirmServiceFeePaymentSubmit(e) {
  e.preventDefault();
  const requestId = Number(document.getElementById('fin_svc_pay_id').value);
  const amountPaid = Number(document.getElementById('fin_svc_pay_amount').value);
  const method = document.getElementById('fin_svc_pay_method').value;
  const rawRef = document.getElementById('fin_svc_pay_ref').value.trim();
  const svcRefCheck = validatePaymentRefClient(method, rawRef, { required: true, label: 'Transaction reference' });
  if (!svcRefCheck.valid) {
    showToast(svcRefCheck.message, 'error');
    document.getElementById('fin_svc_pay_ref')?.focus();
    return;
  }
  const ref = svcRefCheck.value;
  const role = normalizeRole(currentUser?.role);

  try {
    const res = await fetch(`/api/finance/services/${requestId}/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Role': role },
      body: JSON.stringify({
        amount_paid: amountPaid,
        payment_method: method,
        transaction_ref: ref,
        user_role: role,
        actor: currentUser?.full_name || 'Finance Manager'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Payment confirmation failed');
    closeModal('finance-service-pay-modal');
    showToast(data.message, 'success');
    await Promise.all([
      loadFinanceServiceCharges(),
      loadFinanceRecords()
    ]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
