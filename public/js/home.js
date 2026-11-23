/**
 * Elight Electrical Shop - Home Page Script
 */

let featuredProducts = [];
let cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');

const featuredList = document.getElementById('featured-product-list');
const statusText = document.getElementById('status');
const cartCount = document.getElementById('cart-count');

function getProductImage(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('desk lamp') || text.includes('study')) return 'images/desk-lamp.jpg';
  if (text.includes('table lamp')) return 'images/table-lamp.jpg';
  if (text.includes('floor lamp')) return 'images/floor-lamp.jpg';
  if (text.includes('pendant lamp') || text.includes('nordic pendant')) return 'images/pendant-lamp.jpg';
  if (text.includes('edison') || text.includes('filament')) return 'images/edison-lamp.jpg';
  if (text.includes('lantern')) return 'images/wall-lantern-lamp.jpg';
  if (text.includes('shower')) return 'images/instant-shower.jpg';
  if (text.includes('charge controller') || text.includes('mppt')) return 'images/solar-controller.jpg';
  if (text.includes('inverter')) return 'images/power-inverter.jpg';
  if (text.includes('changeover')) return 'images/changeover-switch.jpg';
  if (text.includes('single core')) return 'images/single-core-cable.jpg';
  if (text.includes('armoured')) return 'images/armoured-cable.jpg';
  if (text.includes('touch') && text.includes('switch')) return 'images/touch-switch.jpg';
  if (text.includes('outdoor') && text.includes('socket')) return 'images/outdoor-socket.jpg';
  if (text.includes('exhaust') || text.includes('ventilation fan')) return 'images/exhaust-fan.jpg';
  if (text.includes('chandelier')) return 'images/chandelier.jpg';
  if (text.includes('strip light') || text.includes('led strip')) return 'images/strip-light.jpg';
  if (text.includes('kettle')) return 'images/kettle.jpg';
  if (text.includes('bulb') || text.includes('lamp') || text.includes('panel')) return 'images/bulb.jpg';
  return null;
}

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
  }, 3500);
}

// Load top featured products for the Home landing page
async function loadFeaturedProducts() {
  try {
    const res = await fetch('/api/inventory');
    if (!res.ok) throw new Error('API error');

    const data = await res.json();
    const all = data.products || [];

    // Select 4 diverse showcase items for the home landing page
    featuredProducts = all.slice(0, 4);

    if (statusText) statusText.style.display = 'none';
    renderFeatured(featuredProducts);
    updateCartBadge();
  } catch (err) {
    console.error(err);
    if (statusText) statusText.textContent = 'Explore our catalog by clicking Browse Categories above.';
  }
}

function renderFeatured(products) {
  if (!featuredList) return;
  featuredList.innerHTML = '';

  products.forEach(product => {
    const name = product.product_name || 'Unnamed product';
    const price = Number(product.selling_price || 0);
    const stock = Number(product.quantity_in_stock || 0);
    const reorder = Number(product.reorder_level || 5);
    const image = product.image_url || getProductImage(name);

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
          ${stock > 0 ? `In Stock: <strong>${stock}</strong>` : '<span style="color:var(--danger)">Out of Stock</span>'}
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

    featuredList.appendChild(card);
  });
}

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
      category_name: product.category_name || 'General',
      selling_price: Number(product.selling_price),
      quantity: 1,
      stock,
      image_url: product.image_url || getProductImage(product.product_name)
    });
  }

  saveCart();
  updateCartBadge();
  showToast(`Added <strong>${escapeHTML(product.product_name)}</strong> to cart! <a href="/cart" style="color:#ffc107; font-weight:700; margin-left:8px; text-decoration:underline;">View Cart →</a>`, 'success');
}

function saveCart() {
  localStorage.setItem('elight_cart', JSON.stringify(cart));
}

function updateCartBadge() {
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalCount;
}

document.addEventListener('DOMContentLoaded', loadFeaturedProducts);
