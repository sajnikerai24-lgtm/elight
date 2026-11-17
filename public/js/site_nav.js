// Shared Navigation Helper for Elight Storefront & Engagement Pages
(function () {
  // 1. Update Cart Pill Count
  try {
    const cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
    const totalQty = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const pill = document.getElementById('cart-count');
    if (pill) pill.textContent = totalQty;
  } catch (e) {}

  // 2. Update Auth Link (Customer vs Staff/Admin vs Guest)
  try {
    const rawUser = localStorage.getItem('elight_user');
    const authLink = document.getElementById('navAuthLink');
    if (rawUser && authLink) {
      const user = JSON.parse(rawUser);
      const role = String(user.role || '').trim().toLowerCase();
      const cleanName = String(user.full_name || 'Account')
        .replace(/\s*\([^)]+\)\s*$/i, '')
        .trim();
      authLink.innerHTML = role === 'customer' ? `👤 ${cleanName}` : `👑 ${cleanName}`;
      authLink.href = role === 'customer' ? '/customer' : '/admin';
    }

    // 3. Add Dedicated Supplier Portal link inside .nav-auth-box
    const authBox = document.querySelector('.nav-auth-box');
    if (authBox && !document.getElementById('navSupplierLink')) {
      const supRaw = localStorage.getItem('elight_supplier_session');
      const supBtn = document.createElement('a');
      supBtn.id = 'navSupplierLink';
      supBtn.className = 'admin-link-btn';
      supBtn.style.marginTop = '8px';
      supBtn.style.background = '#0b2545';
      supBtn.style.color = '#fde68a';
      supBtn.style.border = '1px solid rgba(245, 158, 11, 0.45)';
      if (supRaw) {
        const supObj = JSON.parse(supRaw);
        const sName = supObj?.supplier?.supplier_name || 'Supplier Portal';
        supBtn.href = '/supplier-portal';
        supBtn.innerHTML = `🏢 ${sName}`;
      } else {
        supBtn.href = '/supplier-login';
        supBtn.innerHTML = '🏢 Supplier Portal';
      }
      authBox.appendChild(supBtn);
    }
  } catch (e) {}
})();

