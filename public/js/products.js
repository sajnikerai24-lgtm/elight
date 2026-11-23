/**
 * Elight Electrical Shop - Dedicated Products Catalog & Search Script
 */

let allProducts = [];
let cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
let activeCategory = 'All';
let sortOrder = 'relevance';
let searchDebounce = null;

// DOM Elements
const productList = document.getElementById('product-list');
const statusText = document.getElementById('status');
const searchInput = document.getElementById('search');
const categoryFilter = document.getElementById('category-filter');
const sortSelect = document.getElementById('sort-select');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const categoryChips = document.getElementById('category-chips');
const cartCount = document.getElementById('cart-count');

function getProductImage(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('chandelier') || text.includes('pendant') || text.includes('sconce')) return 'images/chandelier.jpg';
  if (text.includes('strip light') || text.includes('led strip')) return 'images/strip-light.jpg';
  if (text.includes('track') || text.includes('downlight')) return 'images/track-light.jpg';
  if (text.includes('solar') || text.includes('emergency')) return 'images/solar-light.jpg';
  if (text.includes('floodlight') || text.includes('bulkhead') || text.includes('bollard')) return 'images/floodlight.jpg';
  if (text.includes('panel') || text.includes('tube') || text.includes('high-bay')) return 'images/panel-light.jpg';
  if (text.includes('kettle')) return 'images/kettle.jpg';
  if (text.includes('bulb') || text.includes('lamp')) return 'images/bulb.jpg';
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

function highlightMatch(text, query) {
  if (window.ElightSearch && typeof window.ElightSearch.highlightText === 'function') {
    return window.ElightSearch.highlightText(text, query);
  }
  return escapeHTML(text);
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
window.showToast = showToast;

// Read initial query parameters from URL
function initFromUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q');
  const cat = urlParams.get('category');
  const sort = urlParams.get('sort');

  if (q && searchInput) searchInput.value = q;
  if (cat) activeCategory = cat;
  if (sort && sortSelect) {
    sortOrder = sort;
    sortSelect.value = sort;
  } else if (!q && sortSelect) {
    sortOrder = 'name-asc';
    sortSelect.value = 'name-asc';
  }
}

function syncUrlParams() {
  const params = new URLSearchParams();
  const q = searchInput ? searchInput.value.trim() : '';

  if (q) params.set('q', q);
  if (activeCategory && activeCategory !== 'All') params.set('category', activeCategory);

  const qs = params.toString();
  const newUrl = qs ? `/products?${qs}` : '/products';
  window.history.replaceState({}, '', newUrl);
}

function updateResetButtonVisibility() {
  if (!resetFiltersBtn) return;
  const hasQuery = Boolean(searchInput && searchInput.value.trim());
  const hasCategory = activeCategory !== 'All';

  resetFiltersBtn.style.display = (hasQuery || hasCategory)
    ? 'inline-block'
    : 'none';
}

// Fetch initial categories & run search via backend Search Module API
async function loadCatalog() {
  try {
    initFromUrlParams();
    statusText.textContent = 'Loading live products catalog...';

    const baseRes = await fetch('/api/inventory');
    if (!baseRes.ok) throw new Error('API error (' + baseRes.status + ')');
    const baseData = await baseRes.json();
    allProducts = baseData.products || [];

    setupCategories(allProducts);
    await executeProductSearch();
    updateCartBadge();
  } catch (err) {
    console.error('Catalog load error:', err);
    statusText.textContent = 'Unable to load products. Check server connection.';
  }
}

// Populate both Category Dropdown and Category Chips dynamically
function setupCategories(products) {
  const uniqueCategories = [...new Set(products.map(p => p.category_name || 'General'))].sort();
  const categories = ['All', ...uniqueCategories];

  if (categoryFilter) {
    categoryFilter.innerHTML = categories.map(cat =>
      `<option value="${escapeHTML(cat)}">${cat === 'All' ? 'All Categories' : escapeHTML(cat)}</option>`
    ).join('');
    if (categories.includes(activeCategory)) {
      categoryFilter.value = activeCategory;
    } else {
      activeCategory = 'All';
    }
  }

  if (categoryChips) {
    categoryChips.innerHTML = categories.map(cat => `
      <button class="chip ${cat === activeCategory ? 'active' : ''}" data-cat="${escapeHTML(cat)}">
        ${escapeHTML(cat)}
      </button>
    `).join('');

    categoryChips.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-cat');
        if (categoryFilter) categoryFilter.value = activeCategory;
        updateActiveChip();
        executeProductSearch();
      });
    });
  }
}

function updateActiveChip() {
  if (!categoryChips) return;
  categoryChips.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-cat') === activeCategory);
  });
}

// Query the backend Product Search Module API
async function executeProductSearch() {
  const q = searchInput ? searchInput.value.trim() : '';

  updateResetButtonVisibility();
  syncUrlParams();

  const apiParams = new URLSearchParams();
  if (q) apiParams.set('q', q);
  if (activeCategory && activeCategory !== 'All') apiParams.set('category', activeCategory);
  apiParams.set('sort', sortOrder);

  try {
    const res = await fetch(`/api/inventory/search?${apiParams.toString()}`);
    if (!res.ok) throw new Error('Search request failed');
    const data = await res.json();
    renderCatalog(data.products || [], q);
  } catch (err) {
    console.error('Search error:', err);
    statusText.textContent = 'Search failed. Please check connection.';
  }
}

function renderCatalog(products, activeQuery = '') {
  productList.innerHTML = '';

  if (products.length === 0) {
    statusText.innerHTML = activeQuery
      ? `No products matched "<strong>${escapeHTML(activeQuery)}</strong>" with current filters.`
      : 'No matching products found for your selected filters.';
    return;
  }

  statusText.innerHTML = activeQuery
    ? `Found <strong>${products.length}</strong> product(s) matching "<strong>${escapeHTML(activeQuery)}</strong>".`
    : `Displaying <strong>${products.length}</strong> product(s) in catalog.`;

  products.forEach(product => {
    const name = product.product_name || 'Unnamed product';
    const category = product.category_name || 'General';
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
          : `<div class="product-placeholder">💡 ${escapeHTML(category)}</div>`}
      </div>
      <div class="product-info">
        <span class="category-tag">${highlightMatch(category, activeQuery)}</span>
        <h3>${highlightMatch(name, activeQuery)}</h3>
        <p class="price">${formatKES(price)}</p>
        <p class="stock-text">
          ${stock > 0 ? `In Stock: <strong>${stock} units</strong>` : '<span style="color:var(--danger)">Currently Out of Stock</span>'}
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

function addToCart(product) {
  cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
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
  cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalCount;
}

// Allow global search bar on /products to filter immediately without full reload
window.triggerCatalogSearch = function(query) {
  if (searchInput) {
    searchInput.value = query;
  }
  if (query && sortSelect && sortOrder === 'name-asc') {
    sortOrder = 'relevance';
    sortSelect.value = 'relevance';
  }
  executeProductSearch();
};

// Event Listeners for Live Search, Price Range, Stock, Sort, and Reset
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    if (searchInput.value.trim() && sortSelect && sortOrder === 'name-asc') {
      sortOrder = 'relevance';
      sortSelect.value = 'relevance';
    }
    searchDebounce = setTimeout(executeProductSearch, 160);
  });
}

if (categoryFilter) {
  categoryFilter.addEventListener('change', () => {
    activeCategory = categoryFilter.value;
    updateActiveChip();
    executeProductSearch();
  });
}

if (sortSelect) {
  sortSelect.addEventListener('change', () => {
    sortOrder = sortSelect.value;
    executeProductSearch();
  });
}

if (resetFiltersBtn) {
  resetFiltersBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    activeCategory = 'All';
    sortOrder = 'name-asc';
    if (categoryFilter) categoryFilter.value = 'All';
    if (sortSelect) sortSelect.value = 'name-asc';
    updateActiveChip();
    executeProductSearch();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadCatalog();
  if (typeof startElightLiveSync === 'function') {
    startElightLiveSync(() => executeProductSearch());
  }
});
