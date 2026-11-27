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
      showToast('Please enter your phone number to proceed.', 'error');
      phoneInput?.focus();
      return;
    }
  }

  const phone = rawPhone || user.phone || 'Cash Customer';
  const deliveryOption = document.getElementById('cust_delivery').value;
  const delivery = document.getElementById('cust_delivery').selectedOptions[0].text;
  const location = document.getElementById('cust_location').value.trim() || 'Meru';
  const requiresInstallation = Boolean(document.getElementById('cust_requires_installation')?.checked);

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.selling_price) * item.quantity), 0);
  const grandTotal = subtotal + deliveryCost;
  const orderNumber = 'EL-' + Math.floor(100000 + Math.random() * 900000);
  const orderedSnapshot = cart.map(i => ({ ...i }));

  const orderCtx = {
    orderNumber,
    name,
    phone,
    deliveryOption,
    delivery,
    location,
    requiresInstallation,
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
    await finalizeOrderPlacement(orderCtx, mpesaCode);
    return;
  }

  // Cash on Delivery / Counter
  showToast(`✅ Order ${orderNumber} placed successfully!`, 'success');
  await finalizeOrderPlacement(orderCtx, '');
}

async function downloadCheckoutPdfReceipt(url, fileName) {
  try {
    showToast('Downloading official payment receipt...', 'info');
    const res = await fetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || 'Unable to download receipt PDF.');
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
    showToast('Official receipt downloaded!', 'success');
  } catch (err) {
    showToast(err.message || 'Failed downloading receipt.', 'error');
  }
}

function printCheckoutReceiptHtml(docTitle, innerHtml) {
  const fullDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHTML(docTitle)}</title><style>@page{margin:14mm;}body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:18px;color:#0f172a;background:#fff;}</style></head><body><div style="border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;"><div style="background:#102b46;color:#fff;padding:16px 20px;border-bottom:4px solid #ffc107;"><div style="font-size:1.15rem;font-weight:800;">ELIGHT ELECTRICAL SHOP</div><div style="font-size:0.78rem;color:#e2e8f0;">Meru Town, Meru County, Kenya • Tel: +254 700 123 456 • elightelectrical@ke.com</div></div><div style="padding:18px 20px;">${innerHtml}</div></div></body></html>`;
  const oldFrame = document.getElementById('elight-cart-print-frame');
  if (oldFrame) oldFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'elight-cart-print-frame';
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
      const win = window.open('', '_blank', 'width=800,height=680');
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

async function finalizeOrderPlacement(orderCtx, mpesaReceipt) {
  const { orderNumber, name, phone, deliveryOption, delivery, location, requiresInstallation, paymentVal, paymentLabel, grandTotal, orderedSnapshot } = orderCtx;
  const signedUser = getSignedInUser() || {};

  // Sync live order to ERP so Reports, Cashier, Finance, Dispatch & Inventory update immediately
  try {
    await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no: orderNumber,
        customer_name: name,
        customer_phone: phone,
        customer_email: signedUser.email || '',
        delivery_address: `${delivery} — ${location}`,
        fulfillment_mode: deliveryOption === 'pickup' ? 'collection' : 'delivery',
        requires_installation: Boolean(requiresInstallation),
        payment_method: paymentVal === 'cash' ? 'Cash' : 'M-Pesa',
        mpesa_receipt: mpesaReceipt || '',
        total_amount: grandTotal,
        items: orderedSnapshot
      })
    });
  } catch (err) {
    console.warn('Checkout sync warning:', err);
  }

  // Build receipt details
  const receiptMarkup = `
    <div style="margin-bottom:8px;"><strong>Receipt No:</strong> <code style="color:#087443; font-weight:800;">RCP-${escapeHTML(orderNumber)}</code></div>
    <div style="margin-bottom:8px;"><strong>Order Number:</strong> <span style="color:#087443; font-weight:800;">${escapeHTML(orderNumber)}</span></div>
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

  if (orderReceiptDetails) {
    orderReceiptDetails.innerHTML = receiptMarkup;
  }

  const actionsEl = document.getElementById('order-receipt-actions');
  if (actionsEl) {
    const receiptParams = new URLSearchParams({
      email: signedUser.email || '',
      phone: phone || signedUser.phone || '',
      name: name || signedUser.full_name || '',
      role: String(signedUser.role || 'customer').toLowerCase()
    });
    const dlUrl = `/api/customer/orders/${encodeURIComponent(orderNumber)}/receipt?${receiptParams.toString()}`;
    const viewUrl = `${dlUrl}&preview=1`;

    actionsEl.innerHTML = '';
    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'btn-sm';
    printBtn.style.cssText = 'background:#0f172a; color:#fff; padding:9px 14px; font-size:0.86rem; font-weight:700; border-radius:6px; border:none; cursor:pointer;';
    printBtn.textContent = mpesaReceipt ? '🖨️ Print Receipt' : '🖨️ Print Order Summary';
    printBtn.onclick = () => printCheckoutReceiptHtml(`Receipt RCP-${orderNumber}`, receiptMarkup);
    actionsEl.appendChild(printBtn);

    if (mpesaReceipt) {
      const viewPdfBtn = document.createElement('button');
      viewPdfBtn.type = 'button';
      viewPdfBtn.className = 'btn-sm';
      viewPdfBtn.style.cssText = 'background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:9px 14px; font-size:0.86rem; font-weight:700; border-radius:6px; cursor:pointer;';
      viewPdfBtn.textContent = '👁️ View Receipt (PDF)';
      viewPdfBtn.onclick = () => window.open(viewUrl, '_blank', 'noopener');
      actionsEl.appendChild(viewPdfBtn);

      const dlPdfBtn = document.createElement('button');
      dlPdfBtn.type = 'button';
      dlPdfBtn.className = 'btn-sm btn-primary';
      dlPdfBtn.style.cssText = 'padding:9px 14px; font-size:0.86rem; font-weight:700; border-radius:6px; cursor:pointer;';
      dlPdfBtn.textContent = '📥 Download PDF';
      dlPdfBtn.onclick = () => downloadCheckoutPdfReceipt(dlUrl, `Order-Receipt-${orderNumber}.pdf`);
      actionsEl.appendChild(dlPdfBtn);
    }
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

