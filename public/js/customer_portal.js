/**
 * Elight Electrical Shop - Dedicated Customer-Only Portal Script
 * Strictly displays ONLY the logged-in customer's own profile, purchase history,
 * contacts, and warranty details (no Service Manager, Technician, or other staff views).
 */

let loggedCustomerUser = null;
let myCustomerProfile = null;
let myCustomerServices = [];

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

async function loadMyCustomerPortal() {
  const params = new URLSearchParams({
    email: loggedCustomerUser.email || '',
    phone: loggedCustomerUser.phone || '',
    name: loggedCustomerUser.full_name || ''
  });

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
              <td><span class="badge-tag" style="background:${isPaid ? '#dcfce7' : '#fee2e2'}; color:${isPaid ? '#15803d' : '#b91c1c'}; font-weight:700;">${isPaid ? '✓ Paid' : '⏳ Pending'}</span></td>
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
              ${p.source === 'service' && p.request_id
                ? `<button type="button" class="btn-sm btn-primary" style="padding:4px 8px; font-size:0.75rem;" onclick="downloadServiceFeeReceipt(${p.request_id})">📥 Download PDF</button>`
                : `<span style="font-size:0.76rem; color:#087443; font-weight:700;">✓ Verified</span>`}
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
          const statusLabel = String(s.status || 'pending').replace(/_/g, ' ');

          let payBadge = '<span class="badge-tag" style="background:#f1f5f9; color:#475569;">Not Billed Yet</span>';
          if (isPaid) {
            payBadge = `<span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700;">✅ Paid (${escapeHTML(s.service_receipt_no || 'Confirmed')})</span>`;
          } else if (isCompleted && fee > 0) {
            payBadge = '<span class="badge-tag" style="background:#fef3c7; color:#b45309; font-weight:700;">⏳ Awaiting Finance Confirmation</span>';
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
                ${s.completion_notes ? `<div style="font-size:0.76rem; color:#475569; margin-top:3px;">${escapeHTML(s.completion_notes)}</div>` : ''}
              </td>
              <td><strong>${fee > 0 ? `KES ${fee.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Pending Charge'}</strong></td>
              <td>${payBadge}</td>
              <td style="white-space:nowrap;">
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  ${isPaid ? `<button type="button" class="btn-sm btn-primary" style="padding:5px 10px; font-size:0.76rem;" onclick="downloadServiceFeeReceipt(${s.request_id})">📥 Download Receipt</button>` : ''}
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
        bookingsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">No future bookings yet. <a href="/booking" style="color:var(--primary); font-weight:700;">Book a service or reserve a product →</a></td></tr>';
      } else {
        bookingsBody.innerHTML = myBookings.map(b => `
          <tr>
            <td><strong style="font-family:monospace;">${escapeHTML(b.booking_ref)}</strong></td>
            <td>${b.booking_type === 'product' ? '📦 Product' : '🔧 Service'}</td>
            <td><strong>${escapeHTML(b.item_or_service_name)}</strong> (x${b.quantity})</td>
            <td>
              <strong>${escapeHTML(b.preferred_date)}</strong><br>
              ${(!b.preferred_time || b.preferred_time.includes('Pending'))
                ? '<span style="display:inline-block; margin-top:3px; padding:2px 8px; border-radius:12px; font-size:0.75rem; background:#fef3c7; color:#92400e; font-weight:600;">🕒 Time Pending Service Manager</span>'
                : `<span style="display:inline-block; margin-top:3px; padding:2px 8px; border-radius:12px; font-size:0.75rem; background:#dcfce7; color:#166534; font-weight:700;">⏰ ${escapeHTML(b.preferred_time)}</span>`}
            </td>
            <td><strong>KES ${Number(b.estimated_amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            <td><span class="badge-tag badge-${escapeHTML(b.status)}">${escapeHTML(b.status)}</span></td>
          </tr>
        `).join('');
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

function buildCustomerReceiptQuery(requestId) {
  const params = new URLSearchParams({
    email: myCustomerProfile?.email || loggedCustomerUser?.email || '',
    phone: myCustomerProfile?.phone || loggedCustomerUser?.phone || '',
    name: myCustomerProfile?.full_name || loggedCustomerUser?.full_name || '',
    role: String(loggedCustomerUser?.role || '').toLowerCase()
  });
  return `/api/customer/services/${requestId}/receipt?${params.toString()}`;
}

async function downloadServiceFeeReceipt(requestId) {
  try {
    showToast('Downloading official service fee receipt...', 'info');
    const url = buildCustomerReceiptQuery(requestId);
    const res = await fetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || 'Unable to download service fee receipt.');
    }
    const blob = await res.blob();
    const objUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = `Service-Receipt-SR-${requestId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(objUrl), 1500);
    showToast('Service fee receipt downloaded!', 'success');
  } catch (err) {
    showToast(err.message || 'Failed downloading receipt.', 'error');
  }
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
