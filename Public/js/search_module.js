/**
 * Elight Electrical Shop - Global Product Search Module
 * Provides live instant-autocomplete search, keyword highlighting,
 * recent search history, keyboard navigation, and quick Add-to-Cart.
 */

const ElightSearch = (() => {
  const RECENT_STORAGE_KEY = 'elight_recent_searches';
  const POPULAR_TAGS = [
    'LED Bulb',
    'Chandelier',
    '2.5mm Cable',
    'Voltage Guard',
    'Breaker',
    'Socket',
    'Solar',
    'Kettle'
  ];

  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightText(text, query) {
    const safeText = escapeHTML(text);
    const tokens = String(query || '').trim().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return safeText;

    const pattern = tokens.map(t => escapeRegExp(escapeHTML(t))).join('|');
    if (!pattern) return safeText;
    const regex = new RegExp(`(${pattern})`, 'gi');
    return safeText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function formatKES(amount) {
    return 'KES ' + Number(amount || 0).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function resolveImage(product) {
    if (product.image_url) return product.image_url;
    const name = String(product.product_name || '').toLowerCase();
    if (name.includes('chandelier')) return 'images/chandelier.jpg';
    if (name.includes('strip')) return 'images/strip-light.jpg';
    if (name.includes('kettle')) return 'images/kettle.jpg';
    if (name.includes('bulb') || name.includes('lamp') || name.includes('panel')) return 'images/bulb.jpg';
    return 'images/bulb.jpg';
  }

  function getRecentSearches() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? raw.slice(0, 5) : [];
    } catch {
      return [];
    }
  }

  function saveRecentSearch(term) {
    const clean = String(term || '').trim();
    if (clean.length < 2) return;
    const list = getRecentSearches().filter(item => item.toLowerCase() !== clean.toLowerCase());
    list.unshift(clean);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
  }

  function clearRecentSearches() {
    localStorage.removeItem(RECENT_STORAGE_KEY);
  }

  function quickAddToCart(product) {
    const stock = Number(product.quantity_in_stock || 0);
    if (stock <= 0) return;

    let currentCart = [];
    try {
      currentCart = JSON.parse(localStorage.getItem('elight_cart') || '[]');
    } catch {
      currentCart = [];
    }

    const existing = currentCart.find(item => item.product_id === product.product_id);
    if (existing) {
      if (existing.quantity >= stock) {
        notifyToast(`Maximum available stock (${stock}) reached!`, 'error');
        return;
      }
      existing.quantity += 1;
    } else {
      currentCart.push({
        product_id: product.product_id,
        product_name: product.product_name,
        category_name: product.category_name || 'General',
        selling_price: Number(product.selling_price || 0),
        quantity: 1,
        stock,
        image_url: resolveImage(product)
      });
    }

    localStorage.setItem('elight_cart', JSON.stringify(currentCart));

    // Sync global cart variable if page script uses one
    if (typeof window.cart !== 'undefined' && Array.isArray(window.cart)) {
      window.cart = currentCart;
    }
    const totalCount = currentCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    document.querySelectorAll('#cart-count').forEach(el => {
      el.textContent = totalCount;
    });

    notifyToast(
      `Added <strong>${escapeHTML(product.product_name)}</strong> to cart! <a href="/cart" style="color:#ffc107; font-weight:700; margin-left:8px; text-decoration:underline;">View Cart →</a>`,
      'success'
    );
  }

  function notifyToast(html, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(html, type);
      return;
    }
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = html;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function navigateToCatalogSearch(query) {
    const clean = String(query || '').trim();
    if (clean) saveRecentSearch(clean);

    // If already on /products page and handler exists, filter directly in place
    if (window.location.pathname === '/products' && typeof window.triggerCatalogSearch === 'function') {
      window.triggerCatalogSearch(clean);
      return;
    }

    const target = clean
      ? `/products?q=${encodeURIComponent(clean)}`
      : '/products';
    window.location.href = target;
  }

  function attach(wrapperEl, options = {}) {
    if (!wrapperEl) return;
    const input = wrapperEl.querySelector('input');
    if (!input) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'elight-search-dropdown';
    dropdown.setAttribute('role', 'listbox');
    wrapperEl.appendChild(dropdown);

    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];

    function closeDropdown() {
      dropdown.classList.remove('open');
      activeIndex = -1;
    }

    function openDropdown() {
      dropdown.classList.add('open');
    }

    function renderIdleSuggestions() {
      const recents = getRecentSearches();
      let html = '';

      if (recents.length > 0) {
        html += `
          <div class="search-dd-section">
            <div class="search-dd-header">
              <span>🕒 Recent Searches</span>
              <button type="button" class="search-dd-clear-btn" data-clear-recent="1">Clear</button>
            </div>
            <div class="search-dd-tags">
              ${recents.map(r => `<button type="button" class="search-dd-tag recent" data-tag="${escapeHTML(r)}">${escapeHTML(r)}</button>`).join('')}
            </div>
          </div>
        `;
      }

      html += `
        <div class="search-dd-section">
          <div class="search-dd-header"><span>⚡ Popular Electrical Searches</span></div>
          <div class="search-dd-tags">
            ${POPULAR_TAGS.map(t => `<button type="button" class="search-dd-tag" data-tag="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join('')}
          </div>
        </div>
      `;

      dropdown.innerHTML = html;
      currentItems = [];
      activeIndex = -1;
      openDropdown();

      const clearBtn = dropdown.querySelector('[data-clear-recent]');
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearRecentSearches();
          renderIdleSuggestions();
        });
      }

      dropdown.querySelectorAll('[data-tag]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const term = btn.getAttribute('data-tag');
          input.value = term;
          runLiveSearch(term);
          if (options.onSelectQuery) options.onSelectQuery(term);
        });
      });
    }

    async function runLiveSearch(rawQuery) {
      const q = String(rawQuery || '').trim();
      if (!q) {
        renderIdleSuggestions();
        return;
      }

      try {
        const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(q)}&limit=6`);
        if (!res.ok) throw new Error('Search request failed');
        const data = await res.json();
        const products = data.products || [];
        const totalMatches = Number(data.totalMatches || products.length);
        currentItems = products;
        activeIndex = -1;

        if (products.length === 0) {
          dropdown.innerHTML = `
            <div class="search-dd-empty">
              <div style="font-size:1.4rem; margin-bottom:4px;">🔍</div>
              <div>No products matched "<strong>${escapeHTML(q)}</strong>"</div>
              <small>Try searching by product name or category (e.g., LED, Cable, Breaker, Solar).</small>
            </div>
          `;
          openDropdown();
          return;
        }

        const rowsHtml = products.map((prod, idx) => {
          const stock = Number(prod.quantity_in_stock || 0);
          const reorder = Number(prod.reorder_level || 5);
          const img = resolveImage(prod);
          let stockPill = `<span class="search-stock-pill in">In Stock (${stock})</span>`;
          if (stock <= 0) stockPill = `<span class="search-stock-pill out">Out of Stock</span>`;
          else if (stock <= reorder) stockPill = `<span class="search-stock-pill low">Low Stock (${stock})</span>`;

          return `
            <div class="search-dd-item" data-idx="${idx}" role="option">
              <img src="${escapeHTML(img)}" alt="${escapeHTML(prod.product_name)}" class="search-dd-thumb">
              <div class="search-dd-meta">
                <div class="search-dd-title">${highlightText(prod.product_name, q)}</div>
                <div class="search-dd-sub">
                  <span class="search-dd-cat">${highlightText(prod.category_name || 'General', q)}</span>
                  ${stockPill}
                </div>
              </div>
              <div class="search-dd-right">
                <div class="search-dd-price">${formatKES(prod.selling_price)}</div>
                <button type="button" class="search-dd-cart-btn" data-cart-idx="${idx}" ${stock <= 0 ? 'disabled' : ''}>
                  ${stock > 0 ? '+ Cart' : 'Sold Out'}
                </button>
              </div>
            </div>
          `;
        }).join('');

        dropdown.innerHTML = `
          <div class="search-dd-list">${rowsHtml}</div>
          <div class="search-dd-footer" data-view-all="1">
            View all <strong>${totalMatches}</strong> matching product${totalMatches === 1 ? '' : 's'} for "<strong>${escapeHTML(q)}</strong>" →
          </div>
        `;
        openDropdown();

        // Bind item click
        dropdown.querySelectorAll('.search-dd-item').forEach(row => {
          row.addEventListener('click', (e) => {
            if (e.target.closest('[data-cart-idx]')) return;
            const idx = Number(row.getAttribute('data-idx'));
            const prod = currentItems[idx];
            if (prod) {
              saveRecentSearch(q);
              closeDropdown();
              navigateToCatalogSearch(prod.product_name);
            }
          });
        });

        // Bind quick +Cart click
        dropdown.querySelectorAll('[data-cart-idx]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(btn.getAttribute('data-cart-idx'));
            const prod = currentItems[idx];
            if (prod) quickAddToCart(prod);
          });
        });

        // Bind footer View All click
        const viewAll = dropdown.querySelector('[data-view-all]');
        if (viewAll) {
          viewAll.addEventListener('click', () => {
            closeDropdown();
            navigateToCatalogSearch(q);
          });
        }
      } catch (err) {
        console.error('Live search error:', err);
      }
    }

    function highlightActiveRow() {
      const rows = dropdown.querySelectorAll('.search-dd-item');
      rows.forEach((r, i) => {
        if (i === activeIndex) {
          r.classList.add('active');
          r.scrollIntoView({ block: 'nearest' });
        } else {
          r.classList.remove('active');
        }
      });
    }

    input.addEventListener('focus', () => {
      const q = input.value.trim();
      if (q) runLiveSearch(q);
      else renderIdleSuggestions();
    });

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      debounceTimer = setTimeout(() => {
        runLiveSearch(q);
      }, 160);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDropdown();
        return;
      }
      if (e.key === 'ArrowDown' && currentItems.length > 0) {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % currentItems.length;
        highlightActiveRow();
        return;
      }
      if (e.key === 'ArrowUp' && currentItems.length > 0) {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
        highlightActiveRow();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        closeDropdown();
        if (activeIndex >= 0 && currentItems[activeIndex]) {
          navigateToCatalogSearch(currentItems[activeIndex].product_name);
        } else {
          navigateToCatalogSearch(input.value);
        }
      }
    });

    const submitBtn = wrapperEl.querySelector('[data-search-submit]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        closeDropdown();
        navigateToCatalogSearch(input.value);
      });
    }

    document.addEventListener('click', (e) => {
      if (!wrapperEl.contains(e.target)) {
        closeDropdown();
      }
    });
  }

  // Global "/" shortcut to focus primary search input
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      const primaryInput = document.querySelector('#search, #hero-search-input');
      if (primaryInput) {
        e.preventDefault();
        primaryInput.focus();
      }
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-elight-search]').forEach(el => attach(el));
  });

  return {
    attach,
    highlightText,
    saveRecentSearch,
    navigateToCatalogSearch
  };
})();

window.ElightSearch = ElightSearch;

