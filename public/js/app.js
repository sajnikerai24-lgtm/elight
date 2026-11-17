/**
 * Elight Electrical Shop - Storefront JavaScript
 */

let allProducts = [];
let cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
let activeCategory = 'All';

// DOM Elements
const productList = document.getElementById('product-list');
const statusText = document.getElementById('status');
const searchInput = document.getElementById('search');
const cartCount = document.getElementById('cart-count');
const cartItemsContainer = document.getElementById('cart-items');
const categoryChips = document.getElementById('category-chips');

// Image mapping helper
function getProductImage(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('chandelier')) return 'images/chandelier.jpg';
  if (text.includes('strip light') || text.includes('led strip')) return 'images/strip-light.jpg';
  if (text.includes('kettle')) return 'images/kettle.jpg';
  if (text.includes('bulb') || text.includes('lamp') || text.includes('panel')) return 'images/bulb.jpg';
  return null;
}

// Format numbers to Kenyan Shillings
function formatKES(amount) {
  const num = Number(amount || 0);
  return 'KES ' + num.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// XSS-Safe HTML Escaping
function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// Show feedback toast
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

// Load products from API
async function loadProducts() {
  try {
    statusText.textContent = 'Loading live inventory from Supabase...';
    const response = await fetch('/api/inventory');

    if (!response.ok) {
      throw new Error(`API error (${response.status})`);
    }

    const data = await response.json();
    allProducts = Array.isArray(data) ? data : data.products || [];

    setupCategories(allProducts);
    filterAndRender();
    updateCartUI();
  } catch (err) {
    console.error('Failed to load products:', err);
    statusText.innerHTML = `⚠️ Could not load products. <br><small>${escapeHTML(err.message)}</small>`;
  }
}


// Build dynamic category filter chips
function setupCategories(products) {
  if (!categoryChips) return;
  const categories = ['All', ...new Set(products.map(p => p.category_name || 'General'))];
  
  categoryChips.innerHTML = categories.map(cat => `
    <button class="chip ${cat === activeCategory ? 'active' : ''}" data-cat="${escapeHTML(cat)}">
      ${escapeHTML(cat)}
    </button>
  `).join('');

  categoryChips.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.getAttribute('data-cat');
      filterAndRender();
    });
  });
}

// Filter products based on search term and active category
function filterAndRender() {
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const filtered = allProducts.filter(item => {
    const matchesCategory = activeCategory === 'All' || (item.category_name || 'General') === activeCategory;
    const matchesSearch = String(item.product_name || '').toLowerCase().includes(query) ||
                          String(item.category_name || '').toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  renderProducts(filtered);
}

// Render product list to DOM
function renderProducts(products) {
  productList.innerHTML = '';

  if (products.length === 0) {
    statusText.textContent = 'No matching products found.';
    return;
  }

  statusText.textContent = `Showing ${products.length} product(s) in catalog.`;

  products.forEach(product => {
    const name = product.product_name || 'Unnamed product';
    const price = Number(product.selling_price || 0);
    const stock = Number(product.quantity_in_stock || 0);
    const reorder = Number(product.reorder_level || 5);
    const image = getProductImage(name);

    let stockBadge = '';
    if (stock <= 0) {
      stockBadge = '<span class="badge badge-out">Out of Stock</span>';
    } else if (stock <= reorder) {
      stockBadge = '<span class="badge badge-low">Low Stock</span>';
    }

    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-image-wrap">
        ${stockBadge}
        ${image 
          ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(name)}" loading="lazy">` 
          : `<div class="product-placeholder">💡 ${escapeHTML(product.category_name || 'Electrical')}</div>`}
      </div>
      <div class="product-info">
        <span class="category-tag">${escapeHTML(product.category_name || 'General')}</span>
        <h3>${escapeHTML(name)}</h3>
        <p class="price">${formatKES(price)}</p>
        <p class="stock-text">
          ${stock > 0 ? `In Stock: <strong>${stock}</strong>` : '<span style="color:var(--danger)">Currently unavailable</span>'}
        </p>
        <button class="add-btn" ${stock <= 0 ? 'disabled' : ''}>
          ${stock > 0 ? 'Add to Cart' : 'Out of Stock'}
        </button>
      </div>
    `;

    const addBtn = card.querySelector('.add-btn');
    if (stock > 0) {
      addBtn.addEventListener('click', () => addToCart(product));
    }

    productList.appendChild(card);
  });
}

// Add item to shopping cart
function addToCart(product) {
  const existing = cart.find(item => item.product_id === product.product_id);
  const stock = Number(product.quantity_in_stock || 0);

  if (existing) {
    if (existing.quantity >= stock) {
      showToast(`Cannot add more than available stock (${stock})!`, 'error');
      return;
    }
    existing.quantity++;
  } else {
    cart.push({
      product_id: product.product_id,
      product_name: product.product_name,
      selling_price: Number(product.selling_price),
      quantity: 1,
      stock
    });
  }

  saveCart();
  updateCartUI();
  showToast(`Added ${product.product_name} to cart!`, 'success');
}

// Modify cart item quantity
function updateCartQty(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.product_id !== productId);
  } else if (item.quantity > item.stock) {
    item.quantity = item.stock;
    showToast(`Maximum stock reached for this item.`, 'error');
  }

  saveCart();
  updateCartUI();
}

// Persist cart to localStorage
function saveCart() {
  localStorage.setItem('elight_cart', JSON.stringify(cart));
}

// Update Cart rendering and badge count
function updateCartUI() {
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalCount;

  if (!cartItemsContainer) return;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<p style="color:var(--text-muted);">Your shopping cart is empty.</p>';
    return;
  }

  const itemsHtml = cart.map(item => `
    <div class="cart-item">
      <div>
        <div class="cart-item-title">${escapeHTML(item.product_name)}</div>
        <div class="cart-item-meta">${formatKES(item.selling_price)} each</div>
      </div>
      <div class="cart-qty-ctrl">
        <button class="qty-btn" onclick="updateCartQty(${item.product_id}, -1)">−</button>
        <span style="font-weight:600; min-width:20px; text-align:center;">${item.quantity}</span>
        <button class="qty-btn" onclick="updateCartQty(${item.product_id}, 1)">+</button>
      </div>
      <div style="font-weight:700; color:var(--primary); min-width:90px; text-align:right;">
        ${formatKES(item.selling_price * item.quantity)}
      </div>
    </div>
  `).join('');

  const grandTotal = cart.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);

  cartItemsContainer.innerHTML = `
    <div class="cart-items">${itemsHtml}</div>
    <div class="cart-total-box">
      <span>Grand Total:</span>
      <span>${formatKES(grandTotal)}</span>
    </div>
    <div style="margin-top: 15px; display:flex; justify-content:flex-end; gap:10px;">
      <button class="btn-sm btn-danger" onclick="clearCart()">Clear Cart</button>
      <button class="btn-sm btn-primary" onclick="checkout()">Proceed to Checkout</button>
    </div>
  `;
}

function clearCart() {
  if (confirm('Are you sure you want to clear your cart?')) {
    cart = [];
    saveCart();
    updateCartUI();
    showToast('Cart cleared');
  }
}

function checkout() {
  alert(`Thank you for your order! Total: ${formatKES(cart.reduce((s, i) => s + (i.selling_price * i.quantity), 0))}\n\nOur shop representative will contact you for delivery and payment.`);
  cart = [];
  saveCart();
  updateCartUI();
}

// Event Listeners
if (searchInput) {
  searchInput.addEventListener('input', filterAndRender);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', loadProducts);
