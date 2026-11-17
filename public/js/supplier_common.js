// Elight Electrical Shop - Shared Supplier Portal Common Logic
const SUPPLIER_SESSION_KEY = 'elight_supplier_session';
let currentSupplierProfile = null;

function getAuthToken() {
  const raw = localStorage.getItem(SUPPLIER_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.session?.access_token || null;
  } catch (e) {
    return null;
  }
}

function logoutSupplier() {
  localStorage.removeItem(SUPPLIER_SESSION_KEY);
  window.location.replace('/supplier-login');
}

async function authFetch(url, options = {}) {
  const token = getAuthToken();
  if (!token) {
    logoutSupplier();
    return;
  }
  options.headers = {
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`
  };
  const res = await fetch(url, options);
  if (res.status === 401) {
    logoutSupplier();
  }
  return res;
}

function formatKES(val) {
  const n = Number(val || 0);
  return 'KSh ' + n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg) {
  let t = document.getElementById('toast-msg');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast-msg';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3800);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// Initialize header, active tab, and supplier identity
async function initSupplierHeader(activeTab) {
  const token = getAuthToken();
  if (!token) {
    window.location.replace('/supplier-login');
    return false;
  }

  // Pre-fill supplier name from local storage cache for instant zero-flicker display
  try {
    const raw = localStorage.getItem(SUPPLIER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cachedSupplier = parsed?.supplier;
      const initialName = cachedSupplier?.contact_name || cachedSupplier?.supplier_name;
      if (initialName) {
        const headerEl = document.getElementById('headerSupplierName');
        if (headerEl) headerEl.innerHTML = `<span>🏢</span> Supplier (${escapeHtml(initialName)})`;
        const welcomeEl = document.getElementById('supplierWelcomeName');
        if (welcomeEl) welcomeEl.textContent = initialName;
      }
    }
  } catch (e) {}

  // Highlight active nav link (Left sidebar navigation)
  if (activeTab) {
    document.querySelectorAll('.nav-links a, .subnav-tab').forEach(tab => {
      if (tab.dataset.tab === activeTab) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  // Load latest supplier profile from API
  try {
    const res = await authFetch('/api/supplier/auth/me');
    if (res && res.ok) {
      const data = await res.json();
      currentSupplierProfile = data.supplier;
      const sName = currentSupplierProfile.contact_name
        ? currentSupplierProfile.contact_name
        : (currentSupplierProfile.supplier_name || 'Partner');
      const el = document.getElementById('headerSupplierName');
      if (el) {
        el.innerHTML = `<span>🏢</span> Supplier (${escapeHtml(sName)})`;
      }
      const welcomeEl = document.getElementById('supplierWelcomeName');
      if (welcomeEl) {
        welcomeEl.textContent = sName;
      }
      return currentSupplierProfile;
    }
  } catch (err) {
    console.error('Error fetching supplier profile:', err);
  }
  return null;
}

