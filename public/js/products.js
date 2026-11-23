/**
 * Elight Electrical Shop - Dedicated Products Catalog & Search Script
 */

let allProducts = [];
let cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
let activeCategory = 'All';
let sortOrder = 'latest';
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
  if (sort && sort !== 'name-asc' && sortSelect) {
    sortOrder = sort;
    sortSelect.value = sort;
  } else if (!q && sortSelect) {
    sortOrder = 'latest';
    sortSelect.value = 'latest';
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
    const ratingAvg = product.rating_avg !== undefined ? Number(product.rating_avg).toFixed(1) : '5.0';
    const reviewCount = Number(product.review_count || 0);
    const warrantyLabel = product.warranty_label || '12M Warranty';

    let stockBadge = '';
    if (stock <= 0) {
      stockBadge = '<span class="badge badge-out">Out of Stock</span>';
    } else if (stock <= reorder) {
      stockBadge = '<span class="badge badge-low">Low Stock</span>';
    }

    const card = document.createElement('article');
    card.className = 'product-card product-card-clickable';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View details, warranty and reviews for ${name}`);
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
        <div class="product-card-meta-row">
          <span class="card-rating-pill" title="Customer rating">★ ${escapeHTML(ratingAvg)}${reviewCount > 0 ? ` (${reviewCount})` : ''}</span>
          <span class="card-warranty-pill" title="Included warranty">🛡️ ${escapeHTML(warrantyLabel)}</span>
        </div>
        <p class="price">${formatKES(price)}</p>
        <p class="stock-text">
          ${stock > 0 ? `In Stock: <strong>${stock} units</strong>` : '<span style="color:var(--danger)">Currently Out of Stock</span>'}
        </p>
        <div class="card-details-link">View details, warranty &amp; reviews →</div>
        <button class="add-btn" ${stock <= 0 ? 'disabled' : ''}>
          ${stock > 0 ? 'Add to Cart' : 'Out of Stock'}
        </button>
      </div>
    `;

    const addBtn = card.querySelector('.add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (stock > 0) addToCart(product, 1);
      });
    }

    card.addEventListener('click', () => openProductDetailsModal(product));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement === addBtn) return;
        e.preventDefault();
        openProductDetailsModal(product);
      }
    });

    productList.appendChild(card);
  });
}

function renderStarsText(rating) {
  const r = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function getModalElements() {
  return {
    overlay: document.getElementById('product-detail-modal'),
    title: document.getElementById('pdm-title'),
    category: document.getElementById('pdm-category'),
    body: document.getElementById('pdm-body'),
    closeBtn: document.getElementById('pdm-close-btn')
  };
}

function closeProductDetailsModal() {
  const { overlay } = getModalElements();
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function openProductDetailsModal(product) {
  const { overlay, title, category, body } = getModalElements();
  if (!overlay || !body) return;

  const prodName = product.product_name || 'Electrical Product';
  const prodCat = product.category_name || 'General';
  if (title) title.textContent = prodName;
  if (category) category.textContent = prodCat;

  body.innerHTML = `<div class="pdm-loading">Loading details, warranty &amp; customer reviews for <strong>${escapeHTML(prodName)}</strong>...</div>`;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  try {
    const res = await fetch(`/api/inventory/${encodeURIComponent(product.product_id)}/details`);
    if (!res.ok) throw new Error('Unable to fetch product details.');
    const payload = await res.json();
    if (!payload.success) throw new Error(payload.message || 'Product details unavailable.');

    renderProductDetailsModalContent(payload);
  } catch (err) {
    console.error('Product modal error:', err);
    body.innerHTML = `
      <div class="pdm-error-box">
        <p>Could not load full product details right now.</p>
        <small>${escapeHTML(err.message)}</small>
      </div>
    `;
  }
}

function renderProductDetailsModalContent(payload) {
  const { body } = getModalElements();
  if (!body) return;

  const prod = payload.product || {};
  const details = payload.details || {};
  const warranty = payload.warranty || {};
  const summary = payload.reviewSummary || { averageRating: 5.0, totalReviews: 0 };
  const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];

  const name = prod.product_name || 'Electrical Product';
  const category = prod.category_name || 'General';
  const price = Number(prod.selling_price || 0);
  const stock = Number(prod.quantity_in_stock || 0);
  const reorder = Number(prod.reorder_level || 5);
  const image = prod.image_url || getProductImage(name);

  let stockText = `<span class="pdm-stock in">In Stock (${stock} units available)</span>`;
  if (stock <= 0) stockText = '<span class="pdm-stock out">Currently Out of Stock</span>';
  else if (stock <= reorder) stockText = `<span class="pdm-stock low">Low Stock (Only ${stock} left)</span>`;

  let currentUser = null;
  try {
    const rawUser = localStorage.getItem('elight_user');
    if (rawUser) currentUser = JSON.parse(rawUser);
  } catch (e) {}
  const prefillName = currentUser && currentUser.full_name
    ? String(currentUser.full_name).replace(/\s*\(customer\)\s*$/i, '').trim()
    : '';

  const specsHtml = (details.specs || []).map(sp => `
    <div class="pdm-spec-item">
      <span class="pdm-spec-label">${escapeHTML(sp.label)}</span>
      <strong class="pdm-spec-value">${escapeHTML(sp.value)}</strong>
    </div>
  `).join('');

  const highlightsHtml = (details.highlights || []).map(hl => `
    <li>${escapeHTML(hl)}</li>
  `).join('');

  const coversHtml = (warranty.covers || []).map(item => `
    <li>✓ ${escapeHTML(item)}</li>
  `).join('');

  const exclusionsHtml = (warranty.exclusions || []).map(item => `
    <li>• ${escapeHTML(item)}</li>
  `).join('');

  const reviewsHtml = reviews.length > 0
    ? reviews.map(rev => {
        const dateStr = rev.created_at
          ? new Date(rev.created_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })
          : '';
        return `
          <article class="pdm-review-card">
            <div class="pdm-review-top">
              <div>
                <strong>${escapeHTML(rev.customer_name || 'Customer')}</strong>
                ${rev.customer_location ? `<span class="pdm-rev-loc"> • ${escapeHTML(rev.customer_location)}</span>` : ''}
                ${rev.verified_purchase ? '<span class="pdm-verified-badge">✓ Verified Buyer</span>' : ''}
              </div>
              <div class="pdm-rev-stars" aria-label="${Number(rev.rating || 5)} out of 5 stars">${renderStarsText(rev.rating)}</div>
            </div>
            ${rev.title ? `<div class="pdm-rev-title">${escapeHTML(rev.title)}</div>` : ''}
            <p class="pdm-rev-comment">${escapeHTML(rev.comment)}</p>
            ${dateStr ? `<div class="pdm-rev-date">${escapeHTML(dateStr)}</div>` : ''}
          </article>
        `;
      }).join('')
    : '<p class="pdm-no-reviews">No reviews yet for this item. Be the first customer to share your experience!</p>';

  body.innerHTML = `
    <div class="pdm-hero">
      <div class="pdm-img-panel">
        ${image
          ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(name)}">`
          : `<div class="product-placeholder">💡 ${escapeHTML(category)}</div>`}
      </div>
      <div class="pdm-summary-panel">
        <div class="pdm-price-row">
          <div class="pdm-price">${formatKES(price)}</div>
          ${stockText}
        </div>
        <div class="pdm-badges-row">
          <span class="pdm-rating-badge" id="pdm-jump-reviews">★ ${Number(summary.averageRating || 5).toFixed(1)} / 5 (${summary.totalReviews} ${summary.totalReviews === 1 ? 'review' : 'reviews'})</span>
          <span class="pdm-warranty-pill">🛡️ ${escapeHTML(warranty.durationLabel || 'Manufacturer Warranty')}</span>
        </div>
        <p class="pdm-description">${escapeHTML(details.description || '')}</p>
        ${highlightsHtml ? `<ul class="pdm-highlights">${highlightsHtml}</ul>` : ''}
        <div class="pdm-cart-actions">
          <div class="pdm-qty-box">
            <button type="button" id="pdm-qty-dec" aria-label="Decrease quantity">−</button>
            <input type="number" id="pdm-qty-input" value="1" min="1" max="${Math.max(1, stock)}" ${stock <= 0 ? 'disabled' : ''}>
            <button type="button" id="pdm-qty-inc" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="add-btn pdm-add-cart-btn" id="pdm-add-cart-btn" ${stock <= 0 ? 'disabled' : ''}>
            ${stock > 0 ? '🛒 Add to Cart' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </div>

    <div class="pdm-section-nav">
      <button type="button" class="pdm-nav-pill active" data-target="pdm-section-details">📋 Product Details</button>
      <button type="button" class="pdm-nav-pill" data-target="pdm-section-warranty">🛡️ Warranty Coverage</button>
      <button type="button" class="pdm-nav-pill" data-target="pdm-section-reviews">💬 Customer Reviews (${summary.totalReviews})</button>
    </div>

    <section class="pdm-section" id="pdm-section-details">
      <h4>📋 Product Details &amp; Technical Specifications</h4>
      <div class="pdm-specs-grid">${specsHtml}</div>
    </section>

    <section class="pdm-section pdm-warranty-section" id="pdm-section-warranty">
      <div class="pdm-section-head">
        <h4>🛡️ Warranty Protection</h4>
        <span class="pdm-warranty-duration">${escapeHTML(warranty.durationLabel || `${warranty.durationMonths || 12} Months Warranty`)}</span>
      </div>
      <div class="pdm-warranty-type">
        <strong>Coverage Type:</strong> ${escapeHTML(warranty.coverageType || 'Official Replacement or Free Repair')}
      </div>
      <div class="pdm-warranty-cols">
        <div class="pdm-warranty-col covers">
          <h5>What Is Covered</h5>
          <ul>${coversHtml}</ul>
        </div>
        <div class="pdm-warranty-col excludes">
          <h5>Exclusions &amp; Care</h5>
          <ul>${exclusionsHtml}</ul>
        </div>
      </div>
      <div class="pdm-warranty-claim">
        <strong>How to Claim Warranty:</strong> ${escapeHTML(warranty.claimProcess || '')}
      </div>
    </section>

    <section class="pdm-section" id="pdm-section-reviews">
      <div class="pdm-section-head">
        <div>
          <h4>💬 Customer Reviews</h4>
          <small class="pdm-rev-sub">Average Rating: <strong>${Number(summary.averageRating || 5).toFixed(1)} / 5.0</strong> across ${summary.totalReviews} customer ${summary.totalReviews === 1 ? 'review' : 'reviews'}</small>
        </div>
        <button type="button" class="pdm-write-review-btn" id="pdm-toggle-review-form">✍️ Write a Review</button>
      </div>

      <form class="pdm-review-form" id="pdm-review-form" style="display:none;">
        <div class="pdm-form-row">
          <div class="form-group">
            <label for="pdm-rev-name">Your Name *</label>
            <input type="text" id="pdm-rev-name" required value="${escapeHTML(prefillName)}" placeholder="e.g. Grace Muthoni">
          </div>
          <div class="form-group">
            <label for="pdm-rev-location">Town / Estate</label>
            <input type="text" id="pdm-rev-location" placeholder="e.g. Makutano, Meru">
          </div>
          <div class="form-group">
            <label for="pdm-rev-rating">Rating *</label>
            <select id="pdm-rev-rating">
              <option value="5">★★★★★ (5 - Excellent)</option>
              <option value="4">★★★★☆ (4 - Good)</option>
              <option value="3">★★★☆☆ (3 - Average)</option>
              <option value="2">★★☆☆☆ (2 - Fair)</option>
              <option value="1">★☆☆☆☆ (1 - Poor)</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="pdm-rev-title">Review Headline</label>
          <input type="text" id="pdm-rev-title" placeholder="e.g. Bright and reliable quality">
        </div>
        <div class="form-group">
          <label for="pdm-rev-comment">Your Review *</label>
          <textarea id="pdm-rev-comment" rows="3" required placeholder="Share how this product worked for you..."></textarea>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" class="btn-reset-search" id="pdm-cancel-review-btn">Cancel</button>
          <button type="submit" class="btn-primary pdm-submit-review-btn" id="pdm-submit-review-btn">Post Review</button>
        </div>
      </form>

      <div class="pdm-reviews-list" id="pdm-reviews-list">${reviewsHtml}</div>
    </section>
  `;

  // Bind quantity & Add to Cart inside modal
  const qtyInput = document.getElementById('pdm-qty-input');
  const decBtn = document.getElementById('pdm-qty-dec');
  const incBtn = document.getElementById('pdm-qty-inc');
  const modalAddBtn = document.getElementById('pdm-add-cart-btn');

  if (decBtn && qtyInput) {
    decBtn.addEventListener('click', () => {
      const val = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
      qtyInput.value = val;
    });
  }
  if (incBtn && qtyInput) {
    incBtn.addEventListener('click', () => {
      const val = Math.min(Math.max(1, stock), (parseInt(qtyInput.value, 10) || 1) + 1);
      qtyInput.value = val;
    });
  }
  if (modalAddBtn && stock > 0) {
    modalAddBtn.addEventListener('click', () => {
      const qty = Math.max(1, Math.min(stock, parseInt(qtyInput?.value, 10) || 1));
      addToCart(prod, qty);
    });
  }

  // Bind section jump pills
  body.querySelectorAll('.pdm-nav-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.pdm-nav-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-target'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const jumpRev = document.getElementById('pdm-jump-reviews');
  if (jumpRev) {
    jumpRev.addEventListener('click', () => {
      const target = document.getElementById('pdm-section-reviews');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Bind Write a Review toggle & submit
  const toggleReviewBtn = document.getElementById('pdm-toggle-review-form');
  const cancelReviewBtn = document.getElementById('pdm-cancel-review-btn');
  const reviewForm = document.getElementById('pdm-review-form');
  if (toggleReviewBtn && reviewForm) {
    toggleReviewBtn.addEventListener('click', () => {
      reviewForm.style.display = reviewForm.style.display === 'none' ? 'block' : 'none';
    });
  }
  if (cancelReviewBtn && reviewForm) {
    cancelReviewBtn.addEventListener('click', () => {
      reviewForm.style.display = 'none';
    });
  }
  if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('pdm-submit-review-btn');
      const revName = document.getElementById('pdm-rev-name')?.value.trim() || '';
      const revLoc = document.getElementById('pdm-rev-location')?.value.trim() || '';
      const revRating = Number(document.getElementById('pdm-rev-rating')?.value || 5);
      const revTitle = document.getElementById('pdm-rev-title')?.value.trim() || '';
      const revComment = document.getElementById('pdm-rev-comment')?.value.trim() || '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';
      }

      try {
        const res = await fetch(`/api/inventory/${encodeURIComponent(prod.product_id)}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: revName,
            customer_location: revLoc || 'Meru County',
            rating: revRating,
            title: revTitle,
            comment: revComment
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Could not save review.');
        }

        showToast('⭐ Thank you! Your review has been published.', 'success');
        payload.reviews = data.reviews;
        payload.reviewSummary = data.reviewSummary;
        renderProductDetailsModalContent(payload);
        executeProductSearch();
      } catch (err) {
        showToast(escapeHTML(err.message), 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Post Review';
        }
      }
    });
  }
}

function addToCart(product, quantityToAdd = 1) {
  cart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
  const existing = cart.find(item => item.product_id === product.product_id);
  const stock = Number(product.quantity_in_stock || 0);
  const addQty = Math.max(1, Number(quantityToAdd || 1));

  if (existing) {
    if (existing.quantity + addQty > stock) {
      showToast(`Cannot add more than available stock (${stock})!`, 'error');
      return;
    }
    existing.quantity += addQty;
  } else {
    cart.push({
      product_id: product.product_id,
      product_name: product.product_name,
      category_name: product.category_name || 'General',
      selling_price: Number(product.selling_price),
      quantity: Math.min(addQty, stock),
      stock,
      image_url: product.image_url || getProductImage(product.product_name)
    });
  }

  saveCart();
  updateCartBadge();
  showToast(`Added ${addQty > 1 ? `<strong>${addQty}×</strong> ` : ''}<strong>${escapeHTML(product.product_name)}</strong> to cart! <a href="/cart" style="color:#ffc107; font-weight:700; margin-left:8px; text-decoration:underline;">View Cart →</a>`, 'success');
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
  if (query && sortSelect && sortOrder === 'latest') {
    sortOrder = 'relevance';
    sortSelect.value = 'relevance';
  }
  executeProductSearch();
};

// Event Listeners for Live Search, Price Range, Stock, Sort, and Reset
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    if (searchInput.value.trim() && sortSelect && sortOrder === 'latest') {
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
    sortOrder = 'latest';
    if (categoryFilter) categoryFilter.value = 'All';
    if (sortSelect) sortSelect.value = 'latest';
    updateActiveChip();
    executeProductSearch();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const { overlay, closeBtn } = getModalElements();
  if (closeBtn) {
    closeBtn.addEventListener('click', closeProductDetailsModal);
  }
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeProductDetailsModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) {
      closeProductDetailsModal();
    }
  });

  loadCatalog().then(() => {
    const pid = new URLSearchParams(window.location.search).get('productId');
    if (pid) {
      const target = allProducts.find(p => Number(p.product_id) === Number(pid));
      if (target) openProductDetailsModal(target);
    }
  });

  if (typeof startElightLiveSync === 'function') {
    startElightLiveSync(() => executeProductSearch());
  }
});
