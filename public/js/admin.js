/**
 * Elight Electrical Shop - Admin Dashboard JavaScript
 * Handles Write Access: Add, Edit, Restock, Delete Products
 */

let inventory = [];

// DOM Elements
const inventoryTableBody = document.getElementById('inventory-table-body');
const totalProductsEl = document.getElementById('total-products');
const lowStockCountEl = document.getElementById('low-stock-count');
const outOfStockCountEl = document.getElementById('out-of-stock-count');
const totalValueEl = document.getElementById('total-inventory-value');

// Modal Elements
const productModal = document.getElementById('product-modal');
const modalTitle = document.getElementById('modal-title');
const productForm = document.getElementById('product-form');
const editIdInput = document.getElementById('edit-product-id');

function formatKES(val) {
  return 'KES ' + Number(val || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

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
  }, 3000);
}

// Fetch Inventory from Supabase backend
async function fetchInventory() {
  try {
    const res = await fetch('/api/inventory');
    if (!res.ok) throw new Error('Failed to load inventory.');
    
    const data = await res.json();
    inventory = data.products || [];
    renderDashboard();
  } catch (err) {
    console.error(err);
    showToast('Failed to load inventory from server.', 'error');
  }
}


// Render metrics & table
function renderDashboard() {
  let totalStockUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalVal = 0;

  inventory.forEach(p => {
    const stock = Number(p.quantity_in_stock || 0);
    const reorder = Number(p.reorder_level || 5);
    const buyPrice = Number(p.buying_price || 0);

    totalStockUnits += stock;
    totalVal += stock * buyPrice;

    if (stock <= 0) {
      outOfStockCount++;
    } else if (stock <= reorder) {
      lowStockCount++;
    }
  });

  if (totalProductsEl) totalProductsEl.textContent = inventory.length;
  if (lowStockCountEl) lowStockCountEl.textContent = lowStockCount;
  if (outOfStockCountEl) outOfStockCountEl.textContent = outOfStockCount;
  if (totalValueEl) totalValueEl.textContent = formatKES(totalVal);

  renderTable();
}

function renderTable() {
  if (!inventoryTableBody) return;

  if (inventory.length === 0) {
    inventoryTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
          No products in database. Click <strong>+ Add Product</strong> to create one!
        </td>
      </tr>
    `;
    return;
  }

  inventoryTableBody.innerHTML = inventory.map(item => {
    const stock = Number(item.quantity_in_stock || 0);
    const reorder = Number(item.reorder_level || 5);
    const buy = Number(item.buying_price || 0);
    const sell = Number(item.selling_price || 0);
    const margin = buy > 0 ? (((sell - buy) / buy) * 100).toFixed(0) + '%' : 'N/A';

    let statusBadge = '<span class="badge" style="background:#dcfce7; color:#166534;">In Stock</span>';
    if (stock <= 0) {
      statusBadge = '<span class="badge badge-out">Out of Stock</span>';
    } else if (stock <= reorder) {
      statusBadge = '<span class="badge badge-low">Low Stock</span>';
    }

    return `
      <tr>
        <td><strong>#${item.product_id}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:12px;">
            <img src="${escapeHTML(item.image_url || 'images/bulb.jpg')}" alt="${escapeHTML(item.product_name)}" style="width:40px; height:40px; object-fit:contain; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; padding:2px;">
            <div>
              <div style="font-weight:600;">${item.product_name}</div>
              <small style="color:var(--text-muted);">${item.category_name || 'General'}</small>
            </div>
          </div>
        </td>
        <td>${formatKES(buy)}</td>
        <td style="font-weight:600; color:var(--success);">${formatKES(sell)}</td>
        <td><small style="color:#2563eb; font-weight:600;">${margin}</small></td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn-sm" style="background:#f1f5f9; border:1px solid #cbd5e1;" onclick="adjustStock(${item.product_id}, -1)">−</button>
            <span style="font-weight:700; min-width:24px; text-align:center;">${stock}</span>
            <button class="btn-sm" style="background:#f1f5f9; border:1px solid #cbd5e1;" onclick="adjustStock(${item.product_id}, 1)">+</button>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div class="action-btns">
            <button class="btn-sm btn-primary" onclick="openEditModal(${item.product_id})">Edit</button>
            <button class="btn-sm btn-danger" onclick="deleteProduct(${item.product_id})">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Adjust stock by +/- 1
async function adjustStock(productId, delta) {
  const item = inventory.find(p => p.product_id === productId);
  if (!item) return;

  const newStock = Math.max(0, Number(item.quantity_in_stock || 0) + delta);

  try {
    const res = await fetch(`/api/inventory/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity_in_stock: newStock })
    });

    const data = await res.json();
    if (!res.ok) {
      if (data.tableMissing) {
        alert(data.message + '\n\nPlease open your Supabase SQL editor and execute supabase_setup.sql.');
        return;
      }
      throw new Error(data.message || 'Stock update failed');
    }

    item.quantity_in_stock = newStock;
    renderDashboard();
    showToast(`Stock updated for ${item.product_name}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Open modal for Adding New Product
function openAddModal() {
  productForm.reset();
  editIdInput.value = '';
  modalTitle.textContent = 'Add New Product to Inventory';
  productModal.classList.add('active');
}

// Open modal for Editing an Existing Product
function openEditModal(productId) {
  const item = inventory.find(p => p.product_id === productId);
  if (!item) return;

  editIdInput.value = item.product_id;
  document.getElementById('product_name').value = item.product_name;
  document.getElementById('category_name').value = item.category_name || 'Lighting';
  document.getElementById('buying_price').value = item.buying_price;
  document.getElementById('selling_price').value = item.selling_price;
  document.getElementById('quantity_in_stock').value = item.quantity_in_stock;
  document.getElementById('reorder_level').value = item.reorder_level;
  document.getElementById('image_url').value = item.image_url || '';

  modalTitle.textContent = `Edit Product #${item.product_id}`;
  productModal.classList.add('active');
}

function closeModal() {
  productModal.classList.remove('active');
}

// Form Submission (Create or Update)
if (productForm) {
  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = editIdInput.value;
    const payload = {
      product_name: document.getElementById('product_name').value.trim(),
      category_name: document.getElementById('category_name').value.trim(),
      buying_price: Number(document.getElementById('buying_price').value),
      selling_price: Number(document.getElementById('selling_price').value),
      quantity_in_stock: Number(document.getElementById('quantity_in_stock').value),
      reorder_level: Number(document.getElementById('reorder_level').value),
      image_url: document.getElementById('image_url').value.trim() || null
    };

    const isEdit = Boolean(id);
    const url = isEdit ? `/api/inventory/${id}` : '/api/inventory';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) {
        if (result.tableMissing) {
          alert('Database Setup Required:\n\n' + result.message + '\n\nOpen https://supabase.com/dashboard/project/qummnlgfaduqnkxbvzjx/sql and run the script in supabase_setup.sql.');
          return;
        }
        throw new Error(result.message || 'Error saving product');
      }

      closeModal();
      showToast(isEdit ? 'Product updated successfully!' : 'Product added to inventory!', 'success');
      fetchInventory();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Delete Product
async function deleteProduct(productId) {
  const item = inventory.find(p => p.product_id === productId);
  if (!confirm(`Are you sure you want to permanently delete "${item?.product_name || 'this product'}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/inventory/${productId}`, { method: 'DELETE' });
    const result = await res.json();

    if (!res.ok) {
      if (result.tableMissing) {
        alert(result.message);
        return;
      }
      throw new Error(result.message || 'Error deleting product');
    }

    showToast('Product deleted.', 'success');
    fetchInventory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', fetchInventory);
