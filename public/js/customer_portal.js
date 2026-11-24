/**
 * Elight Electrical Shop - Dedicated Customer-Only Portal Script
 * Strictly displays ONLY the logged-in customer's own profile, purchase history,
 * contacts, and warranty details (no Service Manager, Technician, or other staff views).
 */

let loggedCustomerUser = null;
let myCustomerProfile = null;
let myCustomerServices = [];
let myCustomerBookings = [];
let myCustomerPayments = [];

const CUSTOMER_ACCOUNT_MENU_ITEMS = [
  { href: '/customer', label: '📊 Account Overview' },
  { href: '/customer-profile', label: '👤 My Profile & Contact Details' },
  { href: '/customer-orders', label: '🛍️ My Orders & Purchases' },
  { href: '/customer-payments', label: '💳 My Payments & Official Receipts' },
  { href: '/customer-deliveries', label: '🚚 My Scheduled Deliveries' },
  { href: '/customer-bookings', label: '📅 My Scheduled Bookings' },
  { href: '/customer-services', label: '🛠️ My Electrical Service Jobs, Service Fees & Receipts' },
  { href: '/customer-warranties', label: '🛡️ My Product Warranties' },
  { href: '/customer-feedback', label: '💬 My Feedback & Product Reviews' }
];

function toggleCustomerAccountMenu(forceState) {
  const dropdown = document.getElementById('customerAccountDropdown');
  if (!dropdown) return;
  const shouldOpen = typeof forceState === 'boolean' ? forceState : !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', shouldOpen);
  const toggleBtn = dropdown.querySelector('.nav-dropdown-toggle');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function initCustomerAccountDropdown() {
  const menu = document.getElementById('customerAccountDropdownMenu');
  if (!menu) return;
  const currentPath = (window.location.pathname || '/customer').replace(/\.html$/i, '') || '/customer';

  menu.innerHTML = CUSTOMER_ACCOUNT_MENU_ITEMS.map(item => {
    const isActive = currentPath === item.href;
    return `<a href="${item.href}" class="nav-dropdown-item${isActive ? ' active' : ''}">${item.label}</a>`;
  }).join('');

  // Expand automatically on desktop sidebar; toggle on tap on narrow mobile nav
  toggleCustomerAccountMenu(window.innerWidth > 820);
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function openCustModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeCustModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function logoutCustomer() {
  localStorage.removeItem('elight_user');
  localStorage.removeItem('elight_token');
  window.location.replace('/login');
}

function updateCartPill() {
  try {
    const cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
    const total = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const pill = document.getElementById('cart-count');
    if (pill) pill.textContent = total;
  } catch (e) {}
}

function verifyCustomerSession() {
  if (localStorage.getItem('elight_supplier_session') && !localStorage.getItem('elight_user')) {
    window.location.replace('/supplier-portal');
    return false;
  }

  const raw = localStorage.getItem('elight_user');
  if (!raw) {
    window.location.replace('/login');
    return false;
  }

  try {
    loggedCustomerUser = JSON.parse(raw);
  } catch {
    window.location.replace('/login');
    return false;
  }

  const userRole = String(loggedCustomerUser.role || '').trim().toLowerCase();
  const isAdminPreview = userRole === 'admin' || userRole === 'administrator' || userRole === 'owner' || userRole === 'superadmin';

  if (userRole !== 'customer' && !isAdminPreview) {
    window.location.replace('/admin');
    return false;
  }

  initCustomerAccountDropdown();
  document.getElementById('customerPageBody').style.visibility = 'visible';

  const adminReturnBtn = document.getElementById('adminReturnPortalBtn');
  if (adminReturnBtn) {
    adminReturnBtn.style.display = isAdminPreview ? 'inline-flex' : 'none';
  }

  const cleanDisplayName = String(loggedCustomerUser.full_name || 'Customer')
    .replace(/\s*\(customer\)\s*$/i, '')
    .trim();

  const navBadge = document.getElementById('navCustomerBadge');
  if (navBadge) {
    navBadge.textContent = isAdminPreview
      ? `👑 ${cleanDisplayName} (Admin View)`
      : `👤 ${cleanDisplayName}`;
  }
  const welcomeTitle = document.getElementById('custWelcomeTitle');
  if (welcomeTitle) {
    welcomeTitle.textContent = `Welcome, ${cleanDisplayName}!`;
  }
  return true;
}

let __custNotifWidgetPromise = null;
function ensureCustomerNotificationsWidget() {
  if (typeof window.refreshCustomerNotifications === 'function') {
    return Promise.resolve();
  }
  if (!__custNotifWidgetPromise) {
    __custNotifWidgetPromise = new Promise(resolve => {
      const s = document.createElement('script');
      s.id = 'elightModuleNotifsScript';
      s.src = '/js/module_notifications.js';
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }
  return __custNotifWidgetPromise;
}

async function loadMyCustomerPortal() {
  const custQueryInfo = {
    email: loggedCustomerUser.email || '',
    phone: loggedCustomerUser.phone || '',
    name: loggedCustomerUser.full_name || ''
  };
  ensureCustomerNotificationsWidget().then(() => {
    if (typeof window.refreshCustomerNotifications === 'function') {
      window.refreshCustomerNotifications(custQueryInfo);
    }
  });

  const params = new URLSearchParams(custQueryInfo);

  try {
    const res = await fetch(`/api/customer/my-portal?${params.toString()}`);
    if (!res.ok) throw new Error('Unable to load customer account');
    const data = await res.json();

    myCustomerProfile = data.profile || {};
    const warranties = data.warranties || [];
    const dispatches = data.dispatches || [];
    const orders = data.orders || [];
    const payments = data.payments || [];
    const bookings = data.bookings || [];
    const services = data.services || [];
    myCustomerServices = services;
    myCustomerBookings = bookings;
    myCustomerPayments = payments;

    // Populate Profile Section (only if present on current page)
    const displayName = myCustomerProfile.full_name ||
      String(loggedCustomerUser.full_name || '').replace(/\s*\(customer\)\s*$/i, '');
    if (document.getElementById('prof-name')) document.getElementById('prof-name').textContent = displayName || '—';
    if (document.getElementById('prof-phone')) document.getElementById('prof-phone').textContent = myCustomerProfile.phone || loggedCustomerUser.phone || '—';
    if (document.getElementById('prof-email')) document.getElementById('prof-email').textContent = myCustomerProfile.email || loggedCustomerUser.email || '—';
    if (document.getElementById('prof-location')) document.getElementById('prof-location').textContent = myCustomerProfile.location || 'Meru, Meru County';

    // KPIs
    const activeWarranties = warranties.filter(w => w.status === 'active').length;
    const totalPaymentsKES = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    if (document.getElementById('cust-kpi-warranties')) document.getElementById('cust-kpi-warranties').textContent = activeWarranties;
    if (document.getElementById('cust-kpi-orders')) document.getElementById('cust-kpi-orders').textContent = orders.length;
    if (document.getElementById('cust-kpi-payments')) document.getElementById('cust-kpi-payments').textContent = `KES ${totalPaymentsKES.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (document.getElementById('cust-kpi-deliveries')) document.getElementById('cust-kpi-deliveries').textContent = dispatches.length;
    if (document.getElementById('cust-kpi-bookings')) document.getElementById('cust-kpi-bookings').textContent = bookings.length;

    // 1. Render Customer's Own Orders & Purchases (with independent Delivery Status & Installation Status)
    const ordersBody = document.getElementById('cust-orders-tbody');
    if (ordersBody) {
      if (orders.length === 0) {
        ordersBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:18px; color:var(--text-muted);">No recorded purchases under your account yet. <a href="/products" style="color:var(--primary); font-weight:700;">Browse catalog →</a></td></tr>';
      } else {
        const formatOrderSubStatus = (val, kind) => {
          const st = String(val || '').toLowerCase();
          if (kind === 'delivery') {
            if (st === 'delivered') return { label: '✓ Delivered', bg: '#dcfce7', color: '#15803d' };
            if (st === 'out_for_delivery') return { label: '🚗 Out for Delivery', bg: '#fef9c3', color: '#854d0e' };
            if (st === 'scheduled') return { label: '🚚 Scheduled', bg: '#e0f2fe', color: '#0369a1' };
            if (st === 'failed') return { label: '⚠ Delivery Failed', bg: '#fee2e2', color: '#b91c1c' };
            if (st === 'cancelled') return { label: 'Cancelled', bg: '#fee2e2', color: '#b91c1c' };
            return { label: 'Not Scheduled', bg: '#f1f5f9', color: '#475569' };
          }
          if (st === 'completed') return { label: '✓ Completed', bg: '#dcfce7', color: '#15803d' };
          if (st === 'awaiting_inspection') return { label: '🔍 Awaiting Inspection', bg: '#f3e8ff', color: '#6b21a8' };
          if (st === 'in_progress') return { label: '🔧 In Progress', bg: '#e0f2fe', color: '#0369a1' };
          if (st === 'approved' || st === 'scheduled') return { label: '✓ Approved / Scheduled', bg: '#ede9fe', color: '#5b21b6' };
          if (st === 'requested') return { label: '⏳ Requested', bg: '#fef3c7', color: '#b45309' };
          if (st === 'cancelled') return { label: 'Cancelled', bg: '#fee2e2', color: '#b91c1c' };
          return { label: 'Not Requested', bg: '#f1f5f9', color: '#64748b' };
        };

        ordersBody.innerHTML = orders.map(o => {
          const itemsHtml = (o.items || [])
            .map(i => `${escapeHTML(i.product_name)} <strong>(×${i.quantity})</strong>`)
            .join(', ');
          const isPaid = o.payment_status === 'paid';
          const balDue = Number(o.balance_due || 0);
          const isPartial = o.payment_status === 'partial' || (balDue > 0 && Number(o.amount_paid || 0) > 0);
          const payBadgeStyle = isPaid
            ? 'background:#dcfce7; color:#15803d;'
            : (isPartial ? 'background:#fef3c7; color:#b45309;' : 'background:#fee2e2; color:#b91c1c;');
          const payBadgeText = isPaid
            ? '✓ Paid'
            : (isPartial ? `⚠️ Partial (Bal: KES ${balDue.toLocaleString('en-KE')})` : '⏳ Pending');
          const isCollection = o.fulfillment_type === 'product_collection' || o.fulfillment_mode === 'collection';
          const delBadge = (isCollection && o.fulfillment_status === 'collected')
            ? { label: '✔️ Collected at Shop', bg: '#dcfce7', color: '#15803d' }
            : (isCollection && o.delivery_status !== 'delivered'
              ? { label: '🏬 Shop Pick-Up', bg: '#e0e7ff', color: '#3730a3' }
              : formatOrderSubStatus(o.delivery_status, 'delivery'));
          const instBadge = formatOrderSubStatus(o.installation_status || 'not_requested', 'installation');
          return `
            <tr>
              <td><strong style="font-family:monospace; color:var(--primary);">${escapeHTML(o.order_no)}</strong></td>
              <td>${itemsHtml || 'Shop Product'}</td>
              <td><strong>KES ${Number(o.total_amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
              <td>
                <span class="badge-tag" style="${payBadgeStyle} font-weight:700;">${payBadgeText}</span>
                ${o.finance_release_status === 'pending_finance' || o.finance_release_status === 'pending_credit_review'
                  ? '<div style="font-size:0.7rem; color:#64748b; margin-top:2px;">⏳ Pending Finance Confirmation</div>'
                  : ''}
              </td>
              <td>${escapeHTML(o.payment_method || 'M-Pesa')}</td>
              <td><span class="badge-tag" style="background:${delBadge.bg}; color:${delBadge.color}; font-weight:700;">${delBadge.label}</span></td>
              <td><span class="badge-tag" style="background:${instBadge.bg}; color:${instBadge.color}; font-weight:700;">${instBadge.label}</span></td>
            </tr>
          `;
        }).join('');
      }
    }

    // 2. Render Customer's Own Official Payments & Receipts
    const paymentsBody = document.getElementById('cust-payments-tbody');
    if (paymentsBody) {
      if (payments.length === 0) {
        paymentsBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:18px; color:var(--text-muted);">No payment receipts on record yet.</td></tr>';
      } else {
        paymentsBody.innerHTML = payments.map(p => `
          <tr>
            <td><strong style="font-family:monospace; color:#087443;">${escapeHTML(p.receipt_no)}</strong></td>
            <td><code>${escapeHTML(p.order_no)}</code></td>
            <td style="font-weight:700; color:#087443;">KES ${Number(p.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${escapeHTML(p.payment_method)}</td>
            <td><code>${escapeHTML(p.payment_ref)}</code></td>
            <td>${p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}</td>
            <td>${escapeHTML(p.cashier_name || 'Esther Karimi')}</td>
            <td>
              ${(p.source === 'service' && p.request_id)
                ? `<div style="display:flex; gap:5px; flex-wrap:wrap;">
                     <button type="button" class="btn-sm" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:4px 8px; font-size:0.74rem; font-weight:700;" onclick="openServiceReceiptModal(${p.request_id})">👁️ View</button>
                     <button type="button" class="btn-sm" style="background:#0f172a; color:#fff; padding:4px 8px; font-size:0.74rem; font-weight:700;" onclick="printServiceReceipt(${p.request_id})">🖨️ Print</button>
                     <button type="button" class="btn-sm btn-primary" style="padding:4px 8px; font-size:0.74rem;" onclick="downloadServiceFeeReceipt(${p.request_id})">📥 Download</button>
                   </div>`
                : ((p.source === 'booking' && p.booking_id)
                  ? `<div style="display:flex; gap:5px; flex-wrap:wrap;">
                       <button type="button" class="btn-sm" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:4px 8px; font-size:0.74rem; font-weight:700;" onclick="openBookingReceiptModal(${p.booking_id})">👁️ View</button>
                       <button type="button" class="btn-sm" style="background:#0f172a; color:#fff; padding:4px 8px; font-size:0.74rem; font-weight:700;" onclick="printBookingReceipt(${p.booking_id})">🖨️ Print</button>
                       <button type="button" class="btn-sm btn-primary" style="padding:4px 8px; font-size:0.74rem;" onclick="downloadBookingFeeReceipt(${p.booking_id})">📥 Download</button>
                     </div>`
                  : `<span style="font-size:0.76rem; color:#087443; font-weight:700;">✓ Verified</span>`)}
            </td>
          </tr>
        `).join('');
      }
    }

    // 3. Render Customer's Own Deliveries & Dispatches
    const delivBody = document.getElementById('cust-deliveries-tbody');
    if (delivBody) {
      if (dispatches.length === 0) {
        delivBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">No deliveries scheduled or out for transit.</td></tr>';
      } else {
        delivBody.innerHTML = dispatches.map(d => `
          <tr>
            <td><strong>${escapeHTML(d.order_no)}</strong></td>
            <td>${escapeHTML(d.delivery_address || 'Meru County')}</td>
            <td>${escapeHTML(d.driver_name || 'Assigned Driver')}</td>
            <td>${d.scheduled_date || '—'}</td>
            <td><span class="badge-tag badge-${escapeHTML(d.status)}">${escapeHTML(String(d.status || '').replace(/_/g, ' '))}</span></td>
            <td><small style="color:var(--text-muted);">${escapeHTML(d.driver_notes || 'Standard Delivery')}</small></td>
          </tr>
        `).join('');
      }
    }

    // 5B. Render Customer's Electrical Service Jobs, Service Fees & Receipts
    const svcBody = document.getElementById('cust-services-tbody');
    if (svcBody) {
      if (services.length === 0) {
        svcBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">No electrical service jobs recorded yet. <a href="/booking" style="color:var(--primary); font-weight:700;">Book a technician service →</a></td></tr>';
      } else {
        svcBody.innerHTML = services.map(s => {
          const fee = Number(s.service_fee || 0);
          const isPaid = String(s.payment_status || '').toLowerCase() === 'paid';
          const isCompleted = String(s.status || '').toLowerCase() === 'completed';
          const isConfirmed = Boolean(s.customer_confirmed);
          const statusLabel = String(s.status || 'pending').replace(/_/g, ' ');

          let payBadge = '<span class="badge-tag" style="background:#f1f5f9; color:#475569;">Not Billed Yet</span>';
          if (isPaid) {
            payBadge = `<span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700;">✅ Paid (${escapeHTML(s.service_receipt_no || 'Confirmed')})</span>`;
            if (s.service_payment_method) {
              payBadge += `<div style="font-size:0.73rem; color:#475569; margin-top:3px;">${escapeHTML(s.service_payment_method)}${s.service_payment_ref ? ` • Ref: ${escapeHTML(s.service_payment_ref)}` : ''}</div>`;
            }
          } else if (isCompleted && fee > 0) {
            payBadge = '<span class="badge-tag" style="background:#fef3c7; color:#b45309; font-weight:700;">⏳ Ready for Payment</span>';
          }

          return `
            <tr>
              <td><strong style="font-family:monospace;">#SR-${s.request_id}</strong></td>
              <td>
                <strong>${escapeHTML(s.service_type)}</strong><br>
                <small style="color:var(--text-muted);">Tech: ${escapeHTML(s.technician_name || s.assigned_technician_name || 'Awaiting Assignment')}</small>
              </td>
              <td>
                <span class="badge-tag badge-${escapeHTML(s.status)}">${escapeHTML(statusLabel)}</span>
                ${isConfirmed ? `<div style="margin-top:4px;"><span class="badge-tag" style="background:#dbeafe; color:#1e40af; font-weight:700;">✔️ Confirmed by You</span></div>` : ''}
                ${s.customer_confirmation_notes ? `<div style="font-size:0.74rem; color:#1e3a8a; margin-top:2px;">Note: ${escapeHTML(s.customer_confirmation_notes)}</div>` : ''}
                ${s.completion_notes ? `<div style="font-size:0.76rem; color:#475569; margin-top:3px;">${escapeHTML(s.completion_notes)}</div>` : ''}
              </td>
              <td><strong>${fee > 0 ? `KES ${fee.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Pending Charge'}</strong></td>
              <td>${payBadge}</td>
              <td style="white-space:nowrap;">
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  ${isCompleted && !isConfirmed ? `<button type="button" class="btn-sm" style="background:#16a34a; color:#fff; padding:5px 10px; font-size:0.76rem; font-weight:700;" onclick="openConfirmServiceModal(${s.request_id})">✓ Confirm Service</button>` : ''}
                  ${isCompleted && !isPaid && fee > 0 ? `<button type="button" class="btn-sm" style="background:#087443; color:#fff; padding:5px 10px; font-size:0.76rem; font-weight:700;" onclick="openCustomerServicePayModal(${s.request_id})">💳 Pay Service</button>` : ''}
                  ${isPaid ? `
                    <button type="button" class="btn-sm" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:5px 10px; font-size:0.76rem; font-weight:700;" onclick="openServiceReceiptModal(${s.request_id})">👁️ View Receipt</button>
                    <button type="button" class="btn-sm" style="background:#0f172a; color:#fff; padding:5px 10px; font-size:0.76rem; font-weight:700;" onclick="printServiceReceipt(${s.request_id})">🖨️ Print Receipt</button>
                    <button type="button" class="btn-sm btn-primary" style="padding:5px 10px; font-size:0.76rem;" onclick="downloadServiceFeeReceipt(${s.request_id})">📥 Download</button>
                  ` : ''}
                  ${isCompleted ? `<button type="button" class="btn-sm" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:5px 10px; font-size:0.76rem; font-weight:700;" onclick="openServiceFeedbackModal(${s.request_id})">💬 Give Feedback</button>` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 4. Render Customer's Own Warranties
    const warrBody = document.getElementById('cust-warranties-tbody');
    if (warrBody) {
      if (warranties.length === 0) {
        warrBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">No product warranties registered under your account yet.</td></tr>';
      } else {
        warrBody.innerHTML = warranties.map(w => `
          <tr>
            <td><strong>#WAR-${w.warranty_id}</strong></td>
            <td><strong>${escapeHTML(w.product_name)}</strong></td>
            <td><code>${escapeHTML(w.serial_no || 'N/A')}</code></td>
            <td>${w.start_date || '—'}</td>
            <td>${w.expiry_date || '—'}</td>
            <td><span class="badge-tag badge-${escapeHTML(w.status)}">${escapeHTML(w.status)}</span></td>
          </tr>
        `).join('');
      }
    }

    // 5. Render Customer's Own Scheduled Bookings
    const bookingsBody = document.getElementById('cust-bookings-tbody');
    if (bookingsBody) {
      const myBookings = bookings.length > 0 ? bookings : [];
      if (myBookings.length === 0) {
        bookingsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:18px; color:var(--text-muted);">No future bookings yet. <a href="/booking" style="color:var(--primary); font-weight:700;">Book a service or reserve a product →</a></td></tr>';
      } else {
        bookingsBody.innerHTML = myBookings.map(b => {
          const bkFee = Number(b.booking_fee ?? 200);
          const estTotal = Number(b.estimated_amount || 0);
          const isCancelled = String(b.status || '').toLowerCase() === 'cancelled';
          const isFeePaid = String(b.booking_fee_status || '').toLowerCase() === 'paid';
          return `
            <tr>
              <td><strong style="font-family:monospace;">${escapeHTML(b.booking_ref)}</strong></td>
              <td>${b.booking_type === 'product' ? '📦 Product' : '🔧 Service'}</td>
              <td><strong>${escapeHTML(b.item_or_service_name)}</strong> (x${b.quantity || 1})</td>
              <td>
                <strong>${escapeHTML(b.preferred_date)}</strong><br>
                ${(!b.preferred_time || b.preferred_time.includes('Pending'))
                  ? '<span style="display:inline-block; margin-top:3px; padding:2px 8px; border-radius:12px; font-size:0.75rem; background:#fef3c7; color:#92400e; font-weight:600;">🕒 Time Pending Service Manager</span>'
                  : `<span style="display:inline-block; margin-top:3px; padding:2px 8px; border-radius:12px; font-size:0.75rem; background:#dcfce7; color:#166534; font-weight:700;">⏰ ${escapeHTML(b.preferred_time)}</span>`}
              </td>
              <td>
                <div style="font-weight:700; color:#0284c7;">Fee: KES ${bkFee.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <small style="color:var(--text-muted);">Est. Total: KES ${estTotal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>
              </td>
              <td>
                <span class="badge-tag badge-${escapeHTML(b.status)}">${escapeHTML(b.status)}</span>
                <div style="margin-top:4px;">
                  ${isFeePaid
                    ? `<span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700;">✅ Fee Paid (${escapeHTML(b.booking_receipt_no || 'Receipt Ready')})</span>`
                    : `<span class="badge-tag" style="background:#fef3c7; color:#92400e; font-weight:600;">⏳ Booking Fee Pending</span>`}
                </div>
              </td>
              <td style="white-space:nowrap;">
                ${!isCancelled ? `
                  <div style="display:flex; gap:5px; flex-wrap:wrap;">
                    ${!isFeePaid ? `<button type="button" class="btn-sm" style="background:#087443; color:#fff; padding:5px 10px; font-size:0.75rem; font-weight:700;" onclick="openCustomerBookingPayModal(${b.booking_id})">💳 Pay Fee</button>` : ''}
                    <button type="button" class="btn-sm" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:5px 10px; font-size:0.75rem; font-weight:700;" onclick="openBookingReceiptModal(${b.booking_id})">👁️ View Receipt</button>
                    <button type="button" class="btn-sm" style="background:#0f172a; color:#fff; padding:5px 10px; font-size:0.75rem; font-weight:700;" onclick="printBookingReceipt(${b.booking_id})">🖨️ Print Receipt</button>
                    <button type="button" class="btn-sm btn-primary" style="padding:5px 10px; font-size:0.75rem;" onclick="downloadBookingFeeReceipt(${b.booking_id})">📥 Download</button>
                  </div>
                ` : '<small style="color:#64748b;">Cancelled</small>'}
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Render Customer's Feedback & Reviews
    const fbBody = document.getElementById('cust-feedback-tbody');
    if (fbBody) {
      try {
        const fbRes = await fetch('/api/feedback?scope=all');
        const fbData = await fbRes.json();
        const allFb = fbData.feedback || [];
        const userEmail = (myCustomerProfile.email || loggedCustomerUser.email || '').toLowerCase().trim();
        const userName = (myCustomerProfile.full_name || loggedCustomerUser.full_name || '').toLowerCase().trim();
        const myFb = allFb.filter(f => 
          (userEmail && f.customer_email && f.customer_email.toLowerCase().trim() === userEmail) ||
          (userName && f.customer_name && f.customer_name.toLowerCase().trim() === userName)
        );

        if (myFb.length === 0) {
          fbBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">No feedback or reviews submitted yet. <a href="/feedback" style="color:var(--primary); font-weight:700;">Share your experience or report an issue →</a></td></tr>';
        } else {
          fbBody.innerHTML = myFb.map(f => `
            <tr>
              <td><strong>#${f.feedback_id}</strong></td>
              <td><span class="badge-tag">${escapeHTML(f.feedback_type)}</span></td>
              <td style="color:#f59e0b; font-weight:700;">${'★'.repeat(Number(f.rating || 5))}</td>
              <td>
                <strong>${escapeHTML(f.subject)}</strong>
                <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">${escapeHTML(f.message)}</div>
              </td>
              <td><span class="badge-tag">${escapeHTML(f.status || 'published')}</span></td>
              <td><small style="color:#1e40af;">${escapeHTML(f.admin_reply || 'Awaiting review')}</small></td>
            </tr>
          `).join('');
        }
      } catch (e) {
        fbBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">Feedback unavailable.</td></tr>';
      }
    }
  } catch (err) {
    console.error(err);
    showToast('Could not load account details. Please try again.', 'error');
  }
}

function openEditProfileModal() {
  if (!myCustomerProfile) return;
  document.getElementById('edit_cust_name').value =
    myCustomerProfile.full_name || String(loggedCustomerUser.full_name || '').replace(/\s*\(customer\)\s*$/i, '');
  document.getElementById('edit_cust_phone').value =
    myCustomerProfile.phone || loggedCustomerUser.phone || '';
  document.getElementById('edit_cust_location').value =
    myCustomerProfile.location || '';
  openCustModal('cust-profile-modal');
}

// Input restriction for profile phone
const editCustPhoneInput = document.getElementById('edit_cust_phone');
if (editCustPhoneInput) {
  editCustPhoneInput.addEventListener('input', function() {
    let v = this.value;
    if (/^\+254/.test(v)) {
      v = '0' + v.replace(/^\+254/, '');
    } else if (/^254\d/.test(v)) {
      v = '0' + v.replace(/^254/, '');
    }
    this.value = v.replace(/\D/g, '').slice(0, 10);
  });
}

const custProfileFormEl = document.getElementById('custProfileForm');
if (custProfileFormEl) custProfileFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!myCustomerProfile?.customer_id) return;

  const full_name = document.getElementById('edit_cust_name').value.trim();
  const phone = document.getElementById('edit_cust_phone').value.trim();
  const location = document.getElementById('edit_cust_location').value.trim();

  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('254') && cleanPhone.length === 12) {
    cleanPhone = '0' + cleanPhone.slice(3);
  }
  if (cleanPhone.length !== 10) {
    showToast('Customer phone number must be exactly 10 digits (e.g. 07XXXXXXXX or 01XXXXXXXX).', 'error');
    return;
  }

  try {
    const res = await fetch('/api/customer/my-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: myCustomerProfile.customer_id,
        user_id: loggedCustomerUser.user_id,
        full_name,
        phone: cleanPhone,
        location
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Profile update failed');
    }

    loggedCustomerUser.full_name = full_name;
    loggedCustomerUser.phone = cleanPhone;
    localStorage.setItem('elight_user', JSON.stringify(loggedCustomerUser));

    closeCustModal('cust-profile-modal');
    showToast('Your profile has been updated!', 'success');
    const navBadge = document.getElementById('navCustomerBadge');
    if (navBadge) navBadge.textContent = `👤 ${full_name}`;
    const welcomeTitle = document.getElementById('custWelcomeTitle');
    if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${full_name}!`;
    loadMyCustomerPortal();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function getCustomerIdentityPayload() {
  return {
    email: myCustomerProfile?.email || loggedCustomerUser?.email || '',
    phone: myCustomerProfile?.phone || loggedCustomerUser?.phone || '',
    name: myCustomerProfile?.full_name || loggedCustomerUser?.full_name || '',
    role: String(loggedCustomerUser?.role || '').toLowerCase()
  };
}

function buildCustomerReceiptQuery(requestId, preview = false) {
  const params = new URLSearchParams(getCustomerIdentityPayload());
  if (preview) params.set('preview', '1');
  return `/api/customer/services/${requestId}/receipt?${params.toString()}`;
}

function buildBookingReceiptQuery(bookingIdOrRef, preview = false) {
  const params = new URLSearchParams(getCustomerIdentityPayload());
  if (preview) params.set('preview', '1');
  return `/api/customer/bookings/${encodeURIComponent(bookingIdOrRef)}/receipt?${params.toString()}`;
}

function resolveBookingReceiptData(bookingId) {
  const idNum = Number(bookingId);
  const b = myCustomerBookings.find(item => Number(item.booking_id) === idNum || String(item.booking_ref) === String(bookingId));
  if (b) return b;
  const pay = myCustomerPayments.find(p => p.source === 'booking' && Number(p.booking_id) === idNum);
  if (pay) {
    return {
      booking_id: idNum,
      booking_ref: pay.booking_ref || pay.order_no,
      booking_type: 'service',
      item_or_service_name: pay.item_or_service_name || 'Scheduled Booking',
      booking_fee: Number(pay.amount || 200),
      estimated_amount: Number(pay.amount || 200),
      booking_fee_status: 'paid',
      booking_receipt_no: pay.receipt_no,
      booking_payment_method: pay.payment_method,
      booking_payment_ref: pay.payment_ref,
      booking_paid_at: pay.paid_at,
      booking_payment_confirmed_by: pay.cashier_name,
      customer_name: myCustomerProfile?.full_name || loggedCustomerUser?.full_name || 'Valued Customer',
      customer_phone: myCustomerProfile?.phone || loggedCustomerUser?.phone || '-',
      customer_email: myCustomerProfile?.email || loggedCustomerUser?.email || '-',
      preferred_date: '-',
      preferred_time: '-',
      status: 'confirmed'
    };
  }
  return null;
}

function buildPrintableBookingReceiptHtml(b) {
  const fee = Number(b.booking_fee ?? 200);
  const isPaid = String(b.booking_fee_status || '').toLowerCase() === 'paid';
  const receiptNo = b.booking_receipt_no || `RCP-${b.booking_ref || `BK-${b.booking_id}`}`;
  const dateStr = b.booking_paid_at || b.created_at;
  const issueDate = dateStr ? new Date(dateStr).toLocaleString('en-KE') : 'N/A';
  const feeText = `KES ${fee.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const estText = `KES ${Number(b.estimated_amount || fee).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif; color:#0f172a; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; background:#ffffff;">
      <div style="background:#102b46; color:#ffffff; padding:18px 22px; border-bottom:4px solid #ffc107; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="font-size:1.15rem; font-weight:800; letter-spacing:0.4px;">ELIGHT ELECTRICAL SHOP</div>
          <div style="font-size:0.78rem; color:#e2e8f0; margin-top:2px;">Meru Town, Meru County, Kenya • Tel: +254 700 123 456 • elightelectrical@ke.com</div>
        </div>
        <div style="background:${isPaid ? '#dcfce7' : '#e0f2fe'}; color:${isPaid ? '#15803d' : '#0369a1'}; padding:5px 12px; border-radius:999px; font-size:0.78rem; font-weight:800;">
          ${isPaid ? 'BOOKING FEE PAID' : 'CONFIRMED BOOKING FEE'}
        </div>
      </div>

      <div style="padding:18px 22px;">
        <div style="text-align:center; font-size:0.95rem; font-weight:800; color:#102b46; letter-spacing:0.5px; margin-bottom:14px;">OFFICIAL BOOKING FEE RECEIPT</div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; font-size:0.84rem; margin-bottom:14px;">
          <div>
            <div><strong>Receipt No:</strong> <code>${escapeHTML(receiptNo)}</code></div>
            <div><strong>Booking Ref:</strong> <code>${escapeHTML(b.booking_ref || `BK-${b.booking_id}`)}</code></div>
            <div><strong>Date:</strong> ${escapeHTML(issueDate)}</div>
          </div>
          <div>
            <div><strong>Payment Method:</strong> ${escapeHTML(b.booking_payment_method || 'M-Pesa / Cash at Shop')}</div>
            <div><strong>Payment Ref:</strong> <code>${escapeHTML(b.booking_payment_ref || b.booking_ref || 'CONFIRMED')}</code></div>
            <div><strong>Status:</strong> ${escapeHTML(String(b.status || 'confirmed').toUpperCase())}</div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:0.84rem; margin-bottom:14px;">
          <tbody>
            <tr>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569; width:24%;">Customer Name</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; font-weight:700;">${escapeHTML(b.customer_name || 'Valued Customer')}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569; width:22%;">Booking Type</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; font-weight:700;">${b.booking_type === 'product' ? 'Product Reservation' : 'Electrical Service'}</td>
            </tr>
            <tr>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Phone</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(b.customer_phone || '-')}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Item / Service</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(b.item_or_service_name || 'Booking')}</td>
            </tr>
            <tr>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Scheduled Date</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(b.preferred_date || '-')}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Time Slot</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(b.preferred_time || 'Pending Assignment')}</td>
            </tr>
          </tbody>
        </table>

        <div style="background:#ecfdf5; border:1px solid #86efac; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <div>
            <div style="font-size:0.78rem; font-weight:700; color:#166534;">${isPaid ? 'TOTAL BOOKING FEE PAID' : 'OFFICIAL BOOKING FEE'}</div>
            <div style="font-size:0.74rem; color:#475569;">Estimated Booking Total: ${escapeHTML(estText)}</div>
          </div>
          <div style="font-size:1.3rem; font-weight:800; color:#087443;">${escapeHTML(feeText)}</div>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:0.8rem; color:#334155;">
          <strong>Booking Notes:</strong> ${escapeHTML(b.confirmation_note || b.location_or_notes || `Confirmed booking ${b.booking_ref}.`)}
        </div>
      </div>
    </div>
  `;
}

function resolveServiceReceiptData(requestId) {
  const idNum = Number(requestId);
  const svc = myCustomerServices.find(s => Number(s.request_id) === idNum);
  if (svc) return svc;
  const pay = myCustomerPayments.find(p => p.source === 'service' && Number(p.request_id) === idNum);
  if (pay) {
    return {
      request_id: idNum,
      service_type: pay.service_type || 'Electrical Service',
      service_fee: Number(pay.amount || 0),
      service_receipt_no: pay.receipt_no || `RCP-SR-${idNum}`,
      service_payment_method: pay.payment_method || 'M-Pesa',
      service_payment_ref: pay.payment_ref || 'VERIFIED',
      service_paid_at: pay.paid_at,
      service_payment_confirmed_by: pay.cashier_name || 'Elight Electrical Shop',
      customer_name: myCustomerProfile?.full_name || loggedCustomerUser?.full_name || 'Valued Customer',
      phone: myCustomerProfile?.phone || loggedCustomerUser?.phone || '-',
      customer_email: myCustomerProfile?.email || loggedCustomerUser?.email || '-',
      location: myCustomerProfile?.location || 'Meru County',
      payment_status: 'paid'
    };
  }
  return null;
}

function buildPrintableServiceReceiptHtml(sr) {
  const receiptNo = sr.service_receipt_no || `RCP-SR-${sr.request_id}`;
  const paidAtStr = sr.service_paid_at || sr.approved_at || sr.created_at;
  const paidDate = paidAtStr ? new Date(paidAtStr).toLocaleString('en-KE') : 'N/A';
  const feeText = `KES ${Number(sr.service_fee || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const custConfirmedText = sr.customer_confirmed
    ? `Confirmed by Customer${sr.customer_confirmed_at ? ` (${new Date(sr.customer_confirmed_at).toLocaleDateString('en-KE')})` : ''}`
    : 'Not Yet Confirmed';

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif; color:#0f172a; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; background:#ffffff;">
      <div style="background:#102b46; color:#ffffff; padding:18px 22px; border-bottom:4px solid #ffc107; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="font-size:1.15rem; font-weight:800; letter-spacing:0.4px;">ELIGHT ELECTRICAL SHOP</div>
          <div style="font-size:0.78rem; color:#e2e8f0; margin-top:2px;">Meru Town, Meru County, Kenya • Tel: +254 700 123 456 • elightelectrical@ke.com</div>
        </div>
        <div style="background:#dcfce7; color:#15803d; padding:5px 12px; border-radius:999px; font-size:0.78rem; font-weight:800;">OFFICIAL RECEIPT • PAID</div>
      </div>

      <div style="padding:18px 22px;">
        <div style="text-align:center; font-size:0.95rem; font-weight:800; color:#102b46; letter-spacing:0.5px; margin-bottom:14px;">OFFICIAL SERVICE FEE PAYMENT RECEIPT</div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; font-size:0.84rem; margin-bottom:14px;">
          <div>
            <div><strong>Receipt No:</strong> <code>${escapeHTML(receiptNo)}</code></div>
            <div><strong>Service Job Ref:</strong> #SR-${escapeHTML(String(sr.request_id))}</div>
            <div><strong>Payment Date:</strong> ${escapeHTML(paidDate)}</div>
          </div>
          <div>
            <div><strong>Payment Method:</strong> ${escapeHTML(sr.service_payment_method || 'M-Pesa')}</div>
            <div><strong>Payment Ref:</strong> <code>${escapeHTML(sr.service_payment_ref || 'VERIFIED')}</code></div>
            <div><strong>Customer Confirmation:</strong> ${escapeHTML(custConfirmedText)}</div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:0.84rem; margin-bottom:14px;">
          <tbody>
            <tr>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569; width:24%;">Customer Name</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; font-weight:700;">${escapeHTML(sr.customer_name || 'Valued Customer')}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569; width:22%;">Service Type</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; font-weight:700;">${escapeHTML(sr.service_type || 'Electrical Service')}</td>
            </tr>
            <tr>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Phone</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(sr.phone || '-')}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Technician</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(sr.technician_name || sr.assigned_technician_name || 'Assigned Tech')}</td>
            </tr>
            <tr>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Site Location</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(sr.location || 'Meru County')}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">Recorded By</td>
              <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(sr.service_payment_confirmed_by || 'Elight Finance Desk')}</td>
            </tr>
          </tbody>
        </table>

        <div style="background:#ecfdf5; border:1px solid #86efac; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <div>
            <div style="font-size:0.78rem; font-weight:700; color:#166534;">TOTAL SERVICE FEE PAID</div>
            <div style="font-size:0.74rem; color:#475569;">Verified payment for completed electrical service</div>
          </div>
          <div style="font-size:1.3rem; font-weight:800; color:#087443;">${escapeHTML(feeText)}</div>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:0.8rem; color:#334155;">
          <strong>Work &amp; Materials Summary:</strong>
          ${escapeHTML(sr.completion_notes || 'Service completed and approved.')}${sr.materials_used ? ` • Materials: ${escapeHTML(sr.materials_used)}` : ''}
          ${sr.customer_confirmation_notes ? `<br><strong>Customer Remark:</strong> ${escapeHTML(sr.customer_confirmation_notes)}` : ''}
        </div>
      </div>
    </div>
  `;
}

function ensureServiceReceiptModal() {
  let modal = document.getElementById('cust-service-receipt-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'cust-service-receipt-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
        <h3 style="margin:0;">🧾 Official Service Fee Receipt</h3>
        <button type="button" class="btn-sm" onclick="closeCustModal('cust-service-receipt-modal')">✕</button>
      </div>
      <div id="cust-service-receipt-body" style="max-height:70vh; overflow-y:auto;"></div>
      <div class="modal-actions" style="margin-top:14px; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" id="receiptModalPrintBtn" class="btn-sm" style="background:#0f172a; color:#fff; font-weight:700;">🖨️ Print Receipt</button>
          <button type="button" id="receiptModalViewPdfBtn" class="btn-sm" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700;">📄 View PDF</button>
          <button type="button" id="receiptModalDownloadBtn" class="btn-sm btn-primary">📥 Download PDF</button>
        </div>
        <button type="button" class="btn-sm" onclick="closeCustModal('cust-service-receipt-modal')">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function showOfficialReceiptModal({ modalTitle, receiptHtml, onPrint, previewUrl, onDownload }) {
  ensureServiceReceiptModal();
  const titleEl = document.querySelector('#cust-service-receipt-modal h3');
  if (titleEl && modalTitle) titleEl.textContent = modalTitle;

  const bodyEl = document.getElementById('cust-service-receipt-body');
  if (bodyEl) bodyEl.innerHTML = receiptHtml;

  const printBtn = document.getElementById('receiptModalPrintBtn');
  if (printBtn) printBtn.onclick = onPrint;

  const viewPdfBtn = document.getElementById('receiptModalViewPdfBtn');
  if (viewPdfBtn) viewPdfBtn.onclick = () => window.open(previewUrl, '_blank', 'noopener');

  const dlBtn = document.getElementById('receiptModalDownloadBtn');
  if (dlBtn) dlBtn.onclick = onDownload;

  openCustModal('cust-service-receipt-modal');
}

function printReceiptDocument(docTitle, receiptMarkup) {
  const fullDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHTML(docTitle)}</title><style>@page{margin:14mm;}body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:12px;background:#fff;}</style></head><body>${receiptMarkup}</body></html>`;

  const oldFrame = document.getElementById('elight-print-receipt-frame');
  if (oldFrame) oldFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'elight-print-receipt-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(fullDoc);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      const win = window.open('', '_blank', 'width=820,height=720');
      if (win) {
        win.document.open();
        win.document.write(fullDoc);
        win.document.close();
        win.focus();
        win.print();
      }
    }
  }, 150);
}

function openServiceReceiptModal(requestId) {
  const sr = resolveServiceReceiptData(requestId);
  if (!sr || String(sr.payment_status || '').toLowerCase() !== 'paid') {
    showToast('Receipt will be available once payment is completed.', 'info');
    return;
  }
  showOfficialReceiptModal({
    modalTitle: '🧾 Official Service Fee Receipt',
    receiptHtml: buildPrintableServiceReceiptHtml(sr),
    onPrint: () => printServiceReceipt(requestId),
    previewUrl: buildCustomerReceiptQuery(requestId, true),
    onDownload: () => downloadServiceFeeReceipt(requestId)
  });
}

function printServiceReceipt(requestId) {
  const sr = resolveServiceReceiptData(requestId);
  if (!sr || String(sr.payment_status || '').toLowerCase() !== 'paid') {
    showToast('Receipt will be available to print once payment is completed.', 'info');
    return;
  }
  printReceiptDocument(`Receipt ${sr.service_receipt_no || `SR-${sr.request_id}`}`, buildPrintableServiceReceiptHtml(sr));
}

function openBookingReceiptModal(bookingId) {
  const b = resolveBookingReceiptData(bookingId);
  if (!b || String(b.status || '').toLowerCase() === 'cancelled') {
    showToast('Booking receipt is unavailable.', 'info');
    return;
  }
  showOfficialReceiptModal({
    modalTitle: '🧾 Official Booking Fee Receipt',
    receiptHtml: buildPrintableBookingReceiptHtml(b),
    onPrint: () => printBookingReceipt(bookingId),
    previewUrl: buildBookingReceiptQuery(b.booking_id || b.booking_ref, true),
    onDownload: () => downloadBookingFeeReceipt(b.booking_id || b.booking_ref)
  });
}

function printBookingReceipt(bookingId) {
  const b = resolveBookingReceiptData(bookingId);
  if (!b || String(b.status || '').toLowerCase() === 'cancelled') {
    showToast('Booking receipt is unavailable to print.', 'info');
    return;
  }
  printReceiptDocument(`Receipt ${b.booking_receipt_no || b.booking_ref}`, buildPrintableBookingReceiptHtml(b));
}

function openConfirmServiceModal(requestId) {
  const svc = myCustomerServices.find(s => Number(s.request_id) === Number(requestId));
  if (!svc) return;
  document.getElementById('conf_service_request_id').value = svc.request_id;
  document.getElementById('conf_service_notes').value = '';
  const sumEl = document.getElementById('conf-service-summary');
  if (sumEl) {
    sumEl.innerHTML = `
      <strong>#SR-${svc.request_id}: ${escapeHTML(svc.service_type)}</strong><br>
      Technician: <strong>${escapeHTML(svc.technician_name || svc.assigned_technician_name || 'Assigned Team')}</strong>
      ${svc.completion_notes ? `<div style="margin-top:4px; color:#334155;">Completion Report: ${escapeHTML(svc.completion_notes)}</div>` : ''}
      ${Number(svc.service_fee || 0) > 0 ? `<div style="margin-top:4px; color:#087443; font-weight:700;">Service Fee: KES ${Number(svc.service_fee).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</div>` : ''}
    `;
  }
  openCustModal('cust-service-confirm-modal');
}

function applyCustPayRefRules(methodId, refId, labelId) {
  const method = String(document.getElementById(methodId)?.value || 'M-Pesa').toLowerCase();
  const input = document.getElementById(refId);
  const label = document.getElementById(labelId);
  if (!input) return;

  if (method.includes('m-pesa') || method.includes('mpesa')) {
    if (label) label.textContent = 'M-Pesa Transaction Reference *';
    input.required = true;
    input.maxLength = 10;
    input.inputMode = 'text';
    input.style.textTransform = 'uppercase';
    input.placeholder = 'e.g. SLK884290Q';
    input.oninput = () => {
      input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
    };
    input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
  } else if (method.includes('bank')) {
    if (label) label.textContent = 'Bank Transfer Reference (Numbers Only) *';
    input.required = true;
    input.maxLength = 12;
    input.inputMode = 'numeric';
    input.style.textTransform = 'none';
    input.placeholder = 'e.g. 123456789012';
    input.oninput = () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 12);
    };
    input.value = input.value.replace(/[^0-9]/g, '').slice(0, 12);
  } else {
    if (label) label.textContent = 'Cash Receipt / Reference (Optional)';
    input.required = false;
    input.maxLength = 40;
    input.inputMode = 'text';
    input.style.textTransform = 'none';
    input.placeholder = 'Optional cash receipt code';
    input.oninput = null;
  }
}

function syncCustServicePayRefRules() {
  applyCustPayRefRules('cust_svc_pay_method', 'cust_svc_pay_ref', 'cust_svc_pay_ref_label');
}

function syncCustBookingPayRefRules() {
  applyCustPayRefRules('cust_bk_pay_method', 'cust_bk_pay_ref', 'cust_bk_pay_ref_label');
}

function openCustomerBookingPayModal(bookingId) {
  const b = resolveBookingReceiptData(bookingId);
  if (!b) return;
  const fee = Number(b.booking_fee ?? 200);
  document.getElementById('pay_booking_id').value = b.booking_id;
  document.getElementById('cust_bk_pay_amount').value = fee.toFixed(2);
  document.getElementById('cust_bk_pay_method').value = 'M-Pesa';
  document.getElementById('cust_bk_pay_ref').value = '';
  syncCustBookingPayRefRules();

  const sumEl = document.getElementById('pay-booking-summary');
  if (sumEl) {
    sumEl.innerHTML = `
      <strong>Booking ${escapeHTML(b.booking_ref)}</strong><br>
      ${escapeHTML(b.item_or_service_name || 'Booking')} • Scheduled: <strong>${escapeHTML(b.preferred_date || '-')}</strong>
    `;
  }
  openCustModal('cust-booking-pay-modal');
}

function openCustomerServicePayModal(requestId) {
  const svc = myCustomerServices.find(s => Number(s.request_id) === Number(requestId));
  if (!svc) return;
  const fee = Number(svc.service_fee || 0);
  document.getElementById('pay_service_request_id').value = svc.request_id;
  document.getElementById('cust_svc_pay_amount').value = fee.toFixed(2);
  document.getElementById('cust_svc_pay_method').value = 'M-Pesa';
  document.getElementById('cust_svc_pay_ref').value = '';
  syncCustServicePayRefRules();

  const sumEl = document.getElementById('pay-service-summary');
  if (sumEl) {
    sumEl.innerHTML = `
      <strong>#SR-${svc.request_id}: ${escapeHTML(svc.service_type)}</strong><br>
      Technician: ${escapeHTML(svc.technician_name || svc.assigned_technician_name || 'Assigned Team')} • Status: <strong>${svc.customer_confirmed ? 'Confirmed Completed' : 'Completed'}</strong>
    `;
  }
  openCustModal('cust-service-pay-modal');
}

const custSvcConfirmForm = document.getElementById('custServiceConfirmForm');
if (custSvcConfirmForm) {
  custSvcConfirmForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const requestId = Number(document.getElementById('conf_service_request_id').value);
    const notes = document.getElementById('conf_service_notes').value.trim();

    try {
      const res = await fetch(`/api/customer/services/${requestId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getCustomerIdentityPayload(),
          confirmation_notes: notes
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to confirm service completion.');
      closeCustModal('cust-service-confirm-modal');
      showToast(data.message || 'Service confirmed completed!', 'success');
      await loadMyCustomerPortal();
    } catch (err) {
      showToast(err.message || 'Failed confirming service.', 'error');
    }
  });
}

const custSvcPayForm = document.getElementById('custServicePayForm');
if (custSvcPayForm) {
  custSvcPayForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const requestId = Number(document.getElementById('pay_service_request_id').value);
    const amountPaid = Number(document.getElementById('cust_svc_pay_amount').value || 0);
    const method = document.getElementById('cust_svc_pay_method').value;
    const rawRef = document.getElementById('cust_svc_pay_ref').value.trim();
    const methodLower = method.toLowerCase();

    if ((methodLower.includes('m-pesa') || methodLower.includes('mpesa')) && !/^[A-Z0-9]{1,10}$/.test(rawRef.toUpperCase())) {
      showToast('M-Pesa reference must be up to 10 alphanumeric characters (e.g. SLK884290Q).', 'error');
      document.getElementById('cust_svc_pay_ref')?.focus();
      return;
    }
    if (methodLower.includes('bank') && !/^[0-9]{1,12}$/.test(rawRef)) {
      showToast('Bank transfer reference must contain numbers only (up to 12 digits).', 'error');
      document.getElementById('cust_svc_pay_ref')?.focus();
      return;
    }

    try {
      const res = await fetch(`/api/customer/services/${requestId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getCustomerIdentityPayload(),
          amount_paid: amountPaid,
          payment_method: method,
          transaction_ref: rawRef
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Payment failed.');
      closeCustModal('cust-service-pay-modal');
      showToast(data.message || 'Service payment recorded! Opening receipt...', 'success');
      await loadMyCustomerPortal();
      openServiceReceiptModal(requestId);
    } catch (err) {
      showToast(err.message || 'Service payment failed.', 'error');
    }
  });
}

const custBkPayForm = document.getElementById('custBookingPayForm');
if (custBkPayForm) {
  custBkPayForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bookingId = Number(document.getElementById('pay_booking_id').value);
    const amountPaid = Number(document.getElementById('cust_bk_pay_amount').value || 200);
    const method = document.getElementById('cust_bk_pay_method').value;
    const rawRef = document.getElementById('cust_bk_pay_ref').value.trim();
    const methodLower = method.toLowerCase();

    if ((methodLower.includes('m-pesa') || methodLower.includes('mpesa')) && !/^[A-Z0-9]{1,10}$/.test(rawRef.toUpperCase())) {
      showToast('M-Pesa reference must be up to 10 alphanumeric characters (e.g. SLK884290Q).', 'error');
      document.getElementById('cust_bk_pay_ref')?.focus();
      return;
    }
    if (methodLower.includes('bank') && !/^[0-9]{1,12}$/.test(rawRef)) {
      showToast('Bank transfer reference must contain numbers only (up to 12 digits).', 'error');
      document.getElementById('cust_bk_pay_ref')?.focus();
      return;
    }

    try {
      const res = await fetch(`/api/customer/bookings/${bookingId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getCustomerIdentityPayload(),
          amount_paid: amountPaid,
          payment_method: method,
          transaction_ref: rawRef
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Booking fee payment failed.');
      closeCustModal('cust-booking-pay-modal');
      showToast(data.message || 'Booking fee paid! Opening receipt...', 'success');
      await loadMyCustomerPortal();
      openBookingReceiptModal(bookingId);
    } catch (err) {
      showToast(err.message || 'Booking fee payment failed.', 'error');
    }
  });
}

async function downloadOfficialPdfReceipt(url, fileName, successLabel) {
  try {
    showToast(`Downloading ${successLabel}...`, 'info');
    const res = await fetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Unable to download ${successLabel}.`);
    }
    const blob = await res.blob();
    const objUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(objUrl), 1500);
    showToast(`${successLabel} downloaded!`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed downloading receipt.', 'error');
  }
}

function downloadServiceFeeReceipt(requestId) {
  return downloadOfficialPdfReceipt(
    buildCustomerReceiptQuery(requestId),
    `Service-Receipt-SR-${requestId}.pdf`,
    'official service fee receipt'
  );
}

function downloadBookingFeeReceipt(bookingIdOrRef) {
  const b = resolveBookingReceiptData(bookingIdOrRef);
  const labelRef = b?.booking_ref || bookingIdOrRef;
  return downloadOfficialPdfReceipt(
    buildBookingReceiptQuery(bookingIdOrRef),
    `Booking-Receipt-${labelRef}.pdf`,
    'official booking fee receipt'
  );
}

function openServiceFeedbackModal(requestId) {
  const svc = myCustomerServices.find(s => Number(s.request_id) === Number(requestId));
  document.getElementById('fb_service_request_id').value = requestId;
  document.getElementById('fb_service_rating').value = '5';
  document.getElementById('fb_service_subject').value = svc
    ? `Service Feedback (#SR-${svc.request_id}): ${svc.service_type}`
    : `Service Feedback (#SR-${requestId})`;
  document.getElementById('fb_service_message').value = '';
  const sumEl = document.getElementById('fb-service-summary');
  if (sumEl) {
    sumEl.innerHTML = svc
      ? `<strong>#SR-${svc.request_id}: ${escapeHTML(svc.service_type)}</strong><br>Technician: ${escapeHTML(svc.technician_name || svc.assigned_technician_name || 'Elight Team')} • Fee Paid: KES ${Number(svc.service_fee || 0).toLocaleString()}`
      : `Service #SR-${requestId}`;
  }
  openCustModal('cust-service-feedback-modal');
}

const custSvcFbForm = document.getElementById('custServiceFeedbackForm');
if (custSvcFbForm) {
  custSvcFbForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      customer_name: myCustomerProfile?.full_name || String(loggedCustomerUser?.full_name || '').replace(/\s*\(customer\)\s*$/i, '') || 'Customer',
      customer_email: myCustomerProfile?.email || loggedCustomerUser?.email || '',
      customer_phone: myCustomerProfile?.phone || loggedCustomerUser?.phone || '',
      module_tag: 'services',
      feedback_type: 'review',
      rating: Number(document.getElementById('fb_service_rating').value || 5),
      subject: document.getElementById('fb_service_subject').value.trim(),
      message: document.getElementById('fb_service_message').value.trim()
    };

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed submitting feedback');
      closeCustModal('cust-service-feedback-modal');
      showToast('Thank you! Your service feedback has been submitted.', 'success');
      loadMyCustomerPortal();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (verifyCustomerSession()) {
    updateCartPill();
    loadMyCustomerPortal();
    if (typeof startElightLiveSync === 'function') {
      startElightLiveSync(() => loadMyCustomerPortal());
    }
  }
});
