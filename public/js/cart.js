/**
 * Elight Electrical Shop - Dedicated Cart & Checkout Script
 */

let cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
let deliveryCost = 300.00; // Default: Meru Town & Makutano courier

// DOM Elements
const cartContent = document.getElementById('cart-content');
const emptyCartState = document.getElementById('empty-cart-state');
const cartItemsList = document.getElementById('cart-items-list');
const cartItemsTotalQty = document.getElementById('cart-items-total-qty');
const summarySubtotal = document.getElementById('summary-subtotal');
const summaryShipping = document.getElementById('summary-shipping');
const summaryGrandTotal = document.getElementById('summary-grand-total');
const cartCount = document.getElementById('cart-count');
const orderModal = document.getElementById('order-modal');
const orderReceiptDetails = document.getElementById('order-receipt-details');

function formatKES(amount) {
  const num = Number(amount || 0);
  return 'KES ' + num.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function showToast(messageHtml, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = messageHtml;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function renderCartPage() {
  updateCartBadge();

  if (!cart || cart.length === 0) {
    if (cartContent) cartContent.style.display = 'none';
    if (emptyCartState) emptyCartState.style.display = 'block';
    return;
  }

  if (cartContent) cartContent.style.display = 'grid';
  if (emptyCartState) emptyCartState.style.display = 'none';

  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartItemsTotalQty) cartItemsTotalQty.textContent = totalQty;

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.selling_price) * item.quantity), 0);

  if (cartItemsList) {
    cartItemsList.innerHTML = cart.map(item => {
      const itemSubtotal = Number(item.selling_price) * item.quantity;
      const imageSrc = item.image_url || 'images/bulb.jpg';

      return `
        <div class="cart-row">
          <div class="cart-thumb">
            <img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(item.product_name)}">
          </div>
          <div>
            <div style="font-weight:700; color:var(--primary); font-size:1rem; margin-bottom:2px;">
              ${escapeHTML(item.product_name)}
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">
              ${escapeHTML(item.category_name || 'Electrical')}
            </div>
            <div style="font-weight:600; color:#087443; font-size:0.9rem;">
              ${formatKES(item.selling_price)} each
            </div>
          </div>
          <div class="cart-qty-ctrl">
            <button class="qty-btn" onclick="updateQty(${item.product_id}, -1)">−</button>
            <span style="font-weight:700; min-width:24px; text-align:center;">${item.quantity}</span>
            <button class="qty-btn" onclick="updateQty(${item.product_id}, 1)">+</button>
          </div>
          <div style="font-weight:700; color:var(--primary); font-size:1.05rem; text-align:right;">
            ${formatKES(itemSubtotal)}
          </div>
          <div style="text-align:right;">
            <button class="cart-remove-btn" onclick="removeItem(${item.product_id})" title="Remove item">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Update Summary calculation
  if (summarySubtotal) summarySubtotal.textContent = formatKES(subtotal);
  if (summaryGrandTotal) summaryGrandTotal.textContent = formatKES(subtotal + deliveryCost);
}

function updateDeliveryOption() {
  const select = document.getElementById('cust_delivery');
  if (!select) return;

  if (select.value === 'meru_town' || select.value === 'meru') {
    deliveryCost = 300.00;
    if (summaryShipping) summaryShipping.textContent = 'KES 300.00 (Meru Town & Makutano)';
  } else if (select.value === 'meru_subcounty') {
    deliveryCost = 500.00;
    if (summaryShipping) summaryShipping.textContent = 'KES 500.00 (Meru Sub-Counties)';
  } else {
    deliveryCost = 0.00;
    if (summaryShipping) summaryShipping.textContent = 'FREE (Meru Town Pick-Up)';
  }

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.selling_price) * item.quantity), 0);
  if (summaryGrandTotal) summaryGrandTotal.textContent = formatKES(subtotal + deliveryCost);
}

function getSignedInUser() {
  try {
    const raw = localStorage.getItem('elight_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && (parsed.username || parsed.email || parsed.user_id || parsed.full_name)) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function closeSignInPrompt() {
  const modal = document.getElementById('signin-required-modal');
  if (modal) modal.classList.remove('active');
}

function openDeliveryDetailsStep() {
  if (!cart || cart.length === 0) {
    showToast('Your cart is empty.', 'error');
    return;
  }

  // Require user to sign in first before proceeding with delivery & payment
  const user = getSignedInUser();
  if (!user) {
    showToast('Please sign in first before proceeding with payment.', 'error');
    const signInModal = document.getElementById('signin-required-modal');
    if (signInModal) signInModal.classList.add('active');
    return;
  }

  const confirmBox = document.getElementById('confirm-step-box');
  const checkoutForm = document.getElementById('checkout-form');
  if (confirmBox) confirmBox.style.display = 'none';
  if (checkoutForm) {
    checkoutForm.style.display = 'block';

    // Pre-fill customer details from signed-in account
    const nameInput = document.getElementById('cust_name');
    const phoneInput = document.getElementById('cust_phone');
    const cleanName = String(user.full_name || '').replace(/\s*\([^)]+\)\s*$/i, '').trim();
    if (nameInput && !nameInput.value && cleanName) nameInput.value = cleanName;
    if (phoneInput && !phoneInput.value && user.phone) phoneInput.value = user.phone;

    checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (nameInput) nameInput.focus();
  }
}

function backToConfirmStep() {
  const confirmBox = document.getElementById('confirm-step-box');
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) checkoutForm.style.display = 'none';
  if (confirmBox) confirmBox.style.display = 'block';
}

function updateQty(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.product_id !== productId);
    showToast(`Removed from cart.`, 'info');
  } else if (item.quantity > item.stock) {
    item.quantity = item.stock;
    showToast(`Maximum available stock is ${item.stock}.`, 'error');
  }

  saveCart();
  renderCartPage();
}

function removeItem(productId) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;

  cart = cart.filter(i => i.product_id !== productId);
  saveCart();
  renderCartPage();
  showToast(`Removed ${item.product_name} from cart.`, 'info');
}

function clearCart() {
  if (confirm('Are you sure you want to clear all items from your cart?')) {
    cart = [];
    saveCart();
    renderCartPage();
    showToast('Your cart has been cleared.', 'info');
  }
}

function saveCart() {
  localStorage.setItem('elight_cart', JSON.stringify(cart));
}

function updateCartBadge() {
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalCount;
}

function toggleStorefrontPaymentNotice() {
  const method = document.getElementById('cust_payment')?.value || 'mpesa';
  const phoneGroup = document.getElementById('cust_phone_group');
  const phoneInput = document.getElementById('cust_phone');
  const submitBtn = document.getElementById('checkout-submit-btn');

  if (phoneGroup) {
    if (method === 'mpesa') {
      phoneGroup.style.display = 'block';
      if (phoneInput) phoneInput.required = true;
    } else {
      phoneGroup.style.display = 'none';
      if (phoneInput) {
        phoneInput.required = false;
        phoneInput.value = '';
      }
    }
  }

  if (submitBtn) {
    submitBtn.innerHTML = method === 'mpesa'
      ? '📲 Pay via M-Pesa &amp; Place Order'
      : '🔒 Complete &amp; Place Order';
  }
}

async function handleCheckout(e) {
  e.preventDefault();

  const user = getSignedInUser();
  if (!user) {
    showToast('Please sign in first before proceeding with payment.', 'error');
    const signInModal = document.getElementById('signin-required-modal');
    if (signInModal) signInModal.classList.add('active');
    return;
  }

  if (cart.length === 0) {
    alert('Your cart is empty.');
    return;
  }

  const name = document.getElementById('cust_name').value.trim();
  const phoneInput = document.getElementById('cust_phone');
  const paymentVal = document.getElementById('cust_payment').value;
  const paymentLabel = document.getElementById('cust_payment').selectedOptions[0].text;
  const rawPhone = phoneInput ? phoneInput.value.trim() : '';

  // If M-Pesa is selected, validate phone number
  if (paymentVal === 'mpesa') {
    if (!rawPhone || rawPhone.length < 9) {
      showToast('Please enter your M-Pesa phone number to proceed.', 'error');
      phoneInput?.focus();
      return;
    }
  }

  const phone = rawPhone || user.phone || 'Cash Customer';
  const delivery = document.getElementById('cust_delivery').selectedOptions[0].text;
  const location = document.getElementById('cust_location').value.trim() || 'Meru';

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.selling_price) * item.quantity), 0);
  const grandTotal = subtotal + deliveryCost;
  const orderNumber = 'EL-' + Math.floor(100000 + Math.random() * 900000);
  const orderedSnapshot = cart.map(i => ({ ...i }));

  const orderCtx = {
    orderNumber,
    name,
    phone,
    delivery,
    location,
    paymentVal,
    paymentLabel,
    grandTotal,
    orderedSnapshot
  };

  if (paymentVal === 'mpesa') {
    const mpesaCode = (document.getElementById('cust_mpesa_code')?.value || '').trim().toUpperCase();
    if (mpesaCode && !/^[A-Z0-9]{1,10}$/.test(mpesaCode)) {
      showToast('M-Pesa reference must be up to 10 alphanumeric characters (letters & numbers only).', 'error');
      document.getElementById('cust_mpesa_code')?.focus();
      return;
    }
    showToast(`✅ Order ${orderNumber} placed via M-Pesa!`, 'success');
    finalizeOrderPlacement(orderCtx, mpesaCode);
    return;
  }

  // Cash on Delivery / Counter
  showToast(`✅ Order ${orderNumber} placed successfully!`, 'success');
  finalizeOrderPlacement(orderCtx, '');
}

function finalizeOrderPlacement(orderCtx, mpesaReceipt) {
  const { orderNumber, name, phone, delivery, location, paymentVal, paymentLabel, grandTotal, orderedSnapshot } = orderCtx;

  // Sync live order to ERP so Reports, Cashier, Finance, Dispatch & Inventory update immediately
  fetch('/api/orders/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_no: orderNumber,
      customer_name: name,
      customer_phone: phone,
      delivery_address: `${delivery} — ${location}`,
      payment_method: paymentVal === 'cash' ? 'Cash' : 'M-Pesa',
      mpesa_receipt: mpesaReceipt || '',
      total_amount: grandTotal,
      items: orderedSnapshot
    })
  }).catch(err => console.warn('Checkout sync warning:', err));

  // Build receipt details
  if (orderReceiptDetails) {
    orderReceiptDetails.innerHTML = `
      <div style="margin-bottom:8px;"><strong>Order Number:</strong> <span style="color:#087443; font-weight:800;">${orderNumber}</span></div>
      <div style="margin-bottom:8px;"><strong>Customer:</strong> ${escapeHTML(name)}${phone && phone !== 'Cash Customer' ? ` (${escapeHTML(phone)})` : ''}</div>
      <div style="margin-bottom:8px;"><strong>Delivery:</strong> ${escapeHTML(delivery)} — ${escapeHTML(location)}</div>
      <div style="margin-bottom:8px;"><strong>Payment Method:</strong> ${escapeHTML(paymentLabel)}</div>
      ${mpesaReceipt ? `
        <div style="margin-bottom:10px; background:#dcfce7; border:1px solid #86efac; border-radius:6px; padding:8px 10px; color:#14532d; font-size:0.86rem;">
          ✅ <strong>M-Pesa Payment Reference:</strong><br>
          Transaction Code: <strong style="font-family:monospace; font-size:0.95rem;">${escapeHTML(mpesaReceipt)}</strong> (Till 5894210)
        </div>
      ` : ''}
      <div style="margin-top:12px; padding-top:8px; border-top:1px dashed var(--border);">
        <strong>Items Ordered (${orderedSnapshot.reduce((s, i) => s + i.quantity, 0)}):</strong>
        <ul style="margin: 6px 0 0 20px; font-size:0.85rem; color:#4b5563;">
          ${orderedSnapshot.map(i => `<li>${escapeHTML(i.product_name)} × ${i.quantity} — ${formatKES(i.selling_price * i.quantity)}</li>`).join('')}
        </ul>
      </div>
      <div style="margin-top:14px; padding-top:10px; border-top:2px solid var(--border); font-size:1.1rem; font-weight:800; color:var(--primary); display:flex; justify-content:space-between;">
        <span>${mpesaReceipt ? 'Total Paid (M-Pesa):' : 'Total Due:'}</span>
        <span>${formatKES(grandTotal)}</span>
      </div>
    `;
  }

  // Open modal
  if (orderModal) orderModal.classList.add('active');

  // Clear cart after checkout
  cart = [];
  saveCart();
  updateCartBadge();
}

document.addEventListener('DOMContentLoaded', () => {
  renderCartPage();
  toggleStorefrontPaymentNotice();

  // Automatically open Delivery & Payment step when returning from Sign-In
  const params = new URLSearchParams(window.location.search);
  if (params.get('step') === 'delivery' && cart.length > 0 && getSignedInUser()) {
    openDeliveryDetailsStep();
  }
});

