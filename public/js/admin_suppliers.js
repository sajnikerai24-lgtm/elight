// =========================================================================
// MULTI-SUPPLIER PORTAL ERP INTEGRATION
// Admin (Accounts) + Inventory Manager (POs, Quotes, Deliveries) + Finance Manager (Invoices & Payments)
// =========================================================================

(function () {
  let adminSuppliersCache = [];
  let procurementCache = {
    suppliers: [], purchase_orders: [], purchase_items: [],
    quotations: [], quotation_items: [], deliveries: [], purchases: [], products: []
  };
  let financeSupCache = {
    invoices: [], payments: [], suppliers: [], purchase_orders: []
  };

  function getErpHeaders() {
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : JSON.parse(localStorage.getItem('elight_user') || '{}');
    return {
      'Content-Type': 'application/json',
      'x-user-role': u.role || '',
      'x-user-name': u.full_name || u.username || u.role || 'ERP Staff',
      'x-user-email': u.email || ''
    };
  }

  function esc(str) {
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(str ?? ''))
      : String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    return typeof formatKES === 'function'
      ? formatKES(Number(n || 0))
      : `KES ${Number(n || 0).toLocaleString()}`;
  }

  function badge(st) {
    const clean = String(st || 'pending').toLowerCase();
    const palette = {
      active: 'background:#dcfce7;color:#166534;',
      approved: 'background:#dcfce7;color:#166534;',
      approved_awaiting_delivery: 'background:#dcfce7;color:#166534;',
      confirmed: 'background:#dcfce7;color:#166534;',
      received: 'background:#dcfce7;color:#166534;',
      delivered: 'background:#dcfce7;color:#166534;',
      paid: 'background:#dcfce7;color:#166534;',
      acknowledged: 'background:#dbeafe;color:#1e40af;',
      quotation_submitted: 'background:#e0e7ff;color:#3730a3;',
      dispatched: 'background:#dbeafe;color:#1e40af;',
      in_transit: 'background:#dbeafe;color:#1e40af;',
      partially_delivered: 'background:#fef3c7;color:#92400e;',
      partially_paid: 'background:#dbeafe;color:#1e40af;',
      pending: 'background:#fef3c7;color:#92400e;',
      pending_supplier_quotation: 'background:#fef3c7;color:#92400e;',
      submitted: 'background:#fef3c7;color:#92400e;',
      pending_review: 'background:#fef3c7;color:#92400e;',
      inactive: 'background:#fee2e2;color:#991b1b;',
      rejected: 'background:#fee2e2;color:#991b1b;'
    };
    const labelMap = {
      approved_awaiting_delivery: 'Approved – Awaiting Delivery',
      pending_supplier_quotation: 'Pending Supplier Quotation',
      quotation_submitted: 'Quotation Submitted',
      partially_delivered: 'Partially Delivered',
      partially_paid: 'Partially Paid'
    };
    const style = palette[clean] || 'background:#f1f5f9;color:#334155;';
    const label = labelMap[clean] || clean.replace(/_/g, ' ');
    return `<span class="badge-tag" style="${style} text-transform:uppercase; font-size:0.72rem; font-weight:800;">${esc(label)}</span>`;
  }

  async function erpFetch(url, options = {}) {
    const headers = { ...getErpHeaders(), ...(options.headers || {}) };
    return fetch(url, { ...options, headers });
  }

  async function downloadErpSupplierDoc(docType, id, fileName) {
    try {
      const res = await erpFetch(`/api/erp/suppliers/documents/${docType}/${id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.message || 'Could not retrieve document.', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `${docType}-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      showToast('Document download failed.', 'error');
    }
  }

  function ensureContainer(hostId, sectionId) {
    let el = document.getElementById(hostId);
    if (el) return el;
    const sec = document.getElementById(sectionId);
    if (!sec) return null;
    el = document.createElement('div');
    el.id = hostId;
    sec.appendChild(el);
    return el;
  }

  // =========================================================================
  // 1. ADMIN MODULE: SUPPLIER ACCOUNT MANAGEMENT
  // =========================================================================
  window.loadAdminSuppliers = async function () {
    const host = ensureContainer('erp-admin-suppliers-container', 'module-suppliers');
    if (!host) return;
    host.innerHTML = '<div style="padding:18px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; margin-top:22px;">Loading supplier accounts...</div>';

    try {
      const res = await erpFetch('/api/erp/suppliers');
      const data = await res.json();
      if (!res.ok || !data.success) {
        host.innerHTML = `<div style="padding:16px; color:#991b1b;">${esc(data.message || 'Access denied or failed loading suppliers.')}</div>`;
        return;
      }
      adminSuppliersCache = data.suppliers || [];

      host.innerHTML = `
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px; box-shadow:0 2px 10px rgba(15,23,42,0.04);">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Supplier Company</th>
                  <th>Login Email &amp; Contact</th>
                  <th>POs / Billed</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${adminSuppliersCache.length === 0 ? '<tr><td colspan="6" style="text-align:center;">No suppliers registered yet.</td></tr>' : adminSuppliersCache.map(s => `
                  <tr>
                    <td><strong>${esc(s.supplier_code || `SUP-${s.supplier_id}`)}</strong></td>
                    <td>
                      <strong>${esc(s.supplier_name)}</strong>
                      <div style="font-size:0.75rem;color:#64748b;">${esc(s.address || '—')} ${s.kra_pin ? '• PIN: ' + esc(s.kra_pin) : ''}</div>
                    </td>
                    <td>
                      <div><code>${esc(s.email || '—')}</code></div>
                      <div style="font-size:0.76rem;color:#475569;">${esc(s.contact_person || '—')} • ${esc(s.phone || '—')}</div>
                    </td>
                    <td>
                      <strong>${s.stats?.po_count || 0} POs</strong>
                      <div style="font-size:0.75rem;color:#64748b;">Paid: ${fmtMoney(s.stats?.total_paid || 0)}</div>
                    </td>
                    <td>${badge(s.status || 'active')}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn-sm" style="background:#f1f5f9;color:#0f172a;" onclick="viewAdminSupplierDetails(${s.supplier_id})">Details</button>
                      <button class="btn-sm" style="background:${String(s.status).toLowerCase() === 'active' ? '#fef3c7;color:#92400e;' : '#dcfce7;color:#166534;'}" onclick="toggleAdminSupplierStatus(${s.supplier_id})">
                        ${String(s.status).toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button class="btn-sm" style="background:#e0e7ff;color:#1e3a8a;" onclick="openSupplierResetPwdModal(${s.supplier_id})">🔑 Reset Password</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      host.innerHTML = `<div style="padding:16px; color:#991b1b;">Error loading supplier accounts: ${esc(err.message)}</div>`;
    }
  };

  window.openRegisterSupplierModal = function () {
    document.getElementById('supRegForm')?.reset();
    openModal('supplier-register-modal');
  };

  window.handleRegisterSupplier = async function (e) {
    e.preventDefault();
    const payload = {
      supplier_name: document.getElementById('reg_sup_name').value.trim(),
      contact_person: document.getElementById('reg_sup_contact').value.trim(),
      email: document.getElementById('reg_sup_email').value.trim(),
      phone: document.getElementById('reg_sup_phone').value.trim(),
      address: document.getElementById('reg_sup_address').value.trim(),
      kra_pin: document.getElementById('reg_sup_kra').value.trim(),
      business_description: document.getElementById('reg_sup_desc').value.trim(),
      initial_password: document.getElementById('reg_sup_password').value.trim(),
      status: document.getElementById('reg_sup_status').value
    };
    try {
      const res = await erpFetch('/api/erp/suppliers', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Registration failed.');
      showToast(data.message, 'success');
      closeModal('supplier-register-modal');
      await loadAdminSuppliers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.toggleAdminSupplierStatus = async function (supplierId) {
    try {
      const res = await erpFetch(`/api/erp/suppliers/${supplierId}/toggle-status`, { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Toggle failed.');
      showToast(data.message, 'success');
      await loadAdminSuppliers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.openSupplierResetPwdModal = function (supplierId) {
    const s = adminSuppliersCache.find(x => Number(x.supplier_id) === Number(supplierId));
    if (!s) return;
    document.getElementById('reset_sup_id').value = s.supplier_id;
    document.getElementById('reset_sup_label').textContent = `${s.supplier_name} (${s.email})`;
    document.getElementById('reset_sup_temp_pwd').value = '';
    document.getElementById('reset_sup_link_box').style.display = 'none';
    openModal('supplier-reset-pwd-modal');
  };

  window.handleAdminResetSupplierPassword = async function (e) {
    e.preventDefault();
    const supplierId = document.getElementById('reset_sup_id').value;
    const tempPwd = document.getElementById('reset_sup_temp_pwd').value.trim();
    try {
      const res = await erpFetch(`/api/erp/suppliers/${supplierId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ temporary_password: tempPwd || undefined })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Password reset failed.');
      showToast(data.message, 'success');
      if (data.recovery_link) {
        const box = document.getElementById('reset_sup_link_box');
        box.style.display = 'block';
        box.innerHTML = `<strong>Supabase Recovery Link Generated:</strong><div style="word-break:break-all;font-size:0.78rem;margin-top:4px;">${esc(data.recovery_link)}</div>`;
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.viewAdminSupplierDetails = async function (supplierId) {
    try {
      const res = await erpFetch(`/api/erp/suppliers/${supplierId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed fetching supplier details.');
      const s = data.supplier;
      document.getElementById('sup_details_body').innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.88rem; margin-bottom:14px;">
          <div><strong>Code:</strong> ${esc(s.supplier_code)}</div>
          <div><strong>Status:</strong> ${badge(s.status)}</div>
          <div><strong>Company:</strong> ${esc(s.supplier_name)}</div>
          <div><strong>Contact Person:</strong> ${esc(s.contact_person || '—')}</div>
          <div><strong>Email:</strong> ${esc(s.email)}</div>
          <div><strong>Phone:</strong> ${esc(s.phone || '—')}</div>
          <div><strong>Address:</strong> ${esc(s.address || '—')}</div>
          <div><strong>KRA PIN:</strong> ${esc(s.kra_pin || '—')}</div>
          <div style="grid-column:span 2;"><strong>Auth User UUID:</strong> <code>${esc(s.auth_user_id || 'Unlinked')}</code></div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px;">
          <div style="background:#f8fafc;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:0.72rem;color:#64748b;">POs</div><strong>${data.purchase_orders.length}</strong></div>
          <div style="background:#f8fafc;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:0.72rem;color:#64748b;">Quotations</div><strong>${data.quotations.length}</strong></div>
          <div style="background:#f8fafc;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:0.72rem;color:#64748b;">Deliveries</div><strong>${data.deliveries.length}</strong></div>
          <div style="background:#f8fafc;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:0.72rem;color:#64748b;">Payments</div><strong>${data.payments.length}</strong></div>
        </div>
      `;
      openModal('supplier-details-modal');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // =========================================================================
  // 2. INVENTORY MANAGER PAGES: POs, QUOTATIONS & DELIVERY CONFIRMATION
  // =========================================================================
  async function fetchInventoryProcurementData() {
    const res = await erpFetch('/api/erp/suppliers/procurement/overview');
    const data = await res.json();
    if (!res.ok || !data.success) return null;
    procurementCache = data;
    const supMap = {};
    (data.suppliers || []).forEach(s => { supMap[Number(s.supplier_id)] = s; });
    const poMap = {};
    (data.purchase_orders || []).forEach(p => { poMap[Number(p.po_id)] = p; });
    return { data, supMap, poMap };
  }

  window.loadInventoryPurchaseOrdersPage = async function () {
    const host = ensureContainer('erp-inv-pos-container', 'module-inventory_pos');
    if (!host) return;
    try {
      const bundle = await fetchInventoryProcurementData();
      if (!bundle) return;
      const { data, supMap } = bundle;
      const poItemsByPo = {};
      (data.purchase_items || []).forEach(it => {
        const key = Number(it.po_id);
        if (!poItemsByPo[key]) poItemsByPo[key] = [];
        poItemsByPo[key].push(it);
      });
      host.innerHTML = `
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px;">
          <div class="table-responsive">
            <table>
              <thead><tr><th>PO #</th><th>Supplier</th><th>Items &amp; Price Limits (KES)</th><th>Quoted Cost (KES)</th><th>Total (KES)</th><th>Expected</th><th>GRN / Payment</th><th>Status / Delivery</th></tr></thead>
              <tbody>
                ${data.purchase_orders.length === 0 ? '<tr><td colspan="8" style="text-align:center;">No purchase orders issued yet.</td></tr>' : data.purchase_orders.map(p => {
                  const items = poItemsByPo[Number(p.po_id)] || [];
                  const firstCost = items.length ? Number(items[0].unit_cost || 0) : 0;
                  const unitCostDisplay = firstCost > 0 ? fmtMoney(firstCost) : '<span style="color:#64748b;font-style:italic;">Awaiting Quote</span>';
                  const totalDisplay = Number(p.total_amount || 0) > 0 ? `<strong>${fmtMoney(p.total_amount)}</strong>` : '<span style="color:#64748b;font-style:italic;">Pending Quote</span>';
                  const itemsWithBoundsHtml = items.length > 0
                    ? items.map(it => {
                        const maxP = Number(it.max_unit_price || 0);
                        const rangeTag = maxP > 0
                          ? `<div style="font-size:0.74rem; color:#1e40af; font-weight:600;">Max Price: ${fmtMoney(maxP)} / unit</div>`
                          : '';
                        return `<div style="margin-bottom:4px;"><strong>${Number(it.ordered_qty || 1)}x ${esc(it.product_name)}</strong>${rangeTag}</div>`;
                      }).join('')
                    : esc(p.items_summary);
                  return `
                    <tr>
                      <td><strong>${esc(p.po_number || `PO-${p.po_id}`)}</strong></td>
                      <td>${esc(p.supplier_name || supMap[Number(p.supplier_id)]?.supplier_name)}</td>
                      <td>${itemsWithBoundsHtml}</td>
                      <td>${unitCostDisplay}</td>
                      <td>${totalDisplay}</td>
                      <td>${esc(p.expected_date || '—')}</td>
                      <td>
                        ${p.grn_number ? `<code>${esc(p.grn_number)}</code> ` : ''}
                        ${p.forwarded_to_finance ? badge(p.payment_status || 'pending') : '<span style="color:#94a3b8;font-size:0.8rem;">—</span>'}
                      </td>
                      <td>${badge(p.status)} ${badge(p.delivery_status || 'pending')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('loadInventoryPurchaseOrdersPage error:', err);
    }
  };

  window.loadInventoryQuotationsPage = async function () {
    const host = ensureContainer('erp-inv-quotations-container', 'module-inventory_quotations');
    if (!host) return;
    try {
      const bundle = await fetchInventoryProcurementData();
      if (!bundle) return;
      const { data, supMap, poMap } = bundle;
      const qItemsByQ = {};
      (data.quotation_items || []).forEach(it => {
        const key = Number(it.quotation_id);
        if (!qItemsByQ[key]) qItemsByQ[key] = [];
        qItemsByQ[key].push(it);
      });
      host.innerHTML = `
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px;">
          <div class="table-responsive">
            <table>
              <thead><tr><th>Quote #</th><th>PO #</th><th>Supplier</th><th>Quoted Products, Price Limits &amp; Validation</th><th>Total (KES)</th><th>Expected Date</th><th>Doc</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${data.quotations.length === 0 ? '<tr><td colspan="9" style="text-align:center;">No quotations submitted yet.</td></tr>' : data.quotations.map(q => {
                  const qItems = qItemsByQ[Number(q.quotation_id)] || [];
                  const itemsSummary = qItems.length
                    ? `<table style="width:100%; border-collapse:collapse; font-size:0.78rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
                        <thead>
                          <tr style="background:#f1f5f9; color:#334155;">
                            <th style="padding:4px 6px; text-align:left;">Product</th>
                            <th style="padding:4px 6px; text-align:right;">Max Unit Price (KES)</th>
                            <th style="padding:4px 6px; text-align:right;">Quoted (KES)</th>
                            <th style="padding:4px 6px; text-align:center;">Price Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${qItems.map(i => {
                            const vStatus = String(i.price_validation_status || 'within_range').toLowerCase();
                            const statusBadge = vStatus === 'within_range'
                              ? '<span class="badge-tag" style="background:#dcfce7; color:#166534; font-size:0.7rem; font-weight:700;">✓ Accepted</span>'
                              : '<span class="badge-tag" style="background:#fee2e2; color:#991b1b; font-size:0.7rem; font-weight:700;">⚠ Exceeds Max</span>';
                            return `
                              <tr style="border-top:1px solid #e2e8f0;">
                                <td style="padding:4px 6px;"><strong>${esc(i.product_name)}</strong> <small>(x${Number(i.available_qty || i.requested_qty || 1)})</small></td>
                                <td style="padding:4px 6px; text-align:right;">${fmtMoney(i.max_unit_price)}</td>
                                <td style="padding:4px 6px; text-align:right; font-weight:800; color:#0f172a;">${fmtMoney(i.unit_price)}</td>
                                <td style="padding:4px 6px; text-align:center;">${statusBadge}</td>
                              </tr>
                            `;
                          }).join('')}
                        </tbody>
                      </table>`
                    : esc(q.title);
                  const poRef = q.po_id ? (poMap[Number(q.po_id)]?.po_number || `PO-${q.po_id}`) : 'Standalone';
                  const quoteTotal = Number(q.total_amount || 0);
                  const hasZeroItem = qItems.some(i => Number(i.unit_price || 0) <= 0);
                  const hasOutOfRange = qItems.some(i => String(i.price_validation_status || 'within_range') !== 'within_range');
                  const isZeroQuote = quoteTotal <= 0 || hasZeroItem;
                  const blockApprove = isZeroQuote || hasOutOfRange;
                  return `
                    <tr>
                      <td><strong>${esc(q.quotation_number)}</strong></td>
                      <td><strong>${esc(poRef)}</strong></td>
                      <td>${esc(supMap[Number(q.supplier_id)]?.supplier_name || `Supplier #${q.supplier_id}`)}</td>
                      <td style="font-size:0.82rem; min-width:390px;">${itemsSummary}</td>
                      <td><strong>${fmtMoney(q.total_amount)}</strong></td>
                      <td>${esc(q.expected_delivery_date || '—')}</td>
                      <td>${q.document_path ? `<button class="btn-sm" onclick="downloadErpDocProxy('quotation', ${q.quotation_id}, '${esc(q.document_name)}')">📎 View</button>` : '—'}</td>
                      <td>${badge(q.status)}</td>
                      <td style="white-space:nowrap;">
                        ${String(q.status).toLowerCase() === 'submitted' ? `
                          ${blockApprove
                            ? `<button class="btn-sm" disabled style="background:#e2e8f0;color:#94a3b8;font-weight:700;cursor:not-allowed;" title="${isZeroQuote ? 'Cannot approve a quotation with KSh 0 amount' : 'Cannot approve out-of-range quoted price'}">✓ Approve</button>`
                            : `<button class="btn-sm" style="background:#dcfce7;color:#166534;font-weight:700;" onclick="reviewSupplierQuotation(${q.quotation_id}, 'approve', ${quoteTotal}, ${hasZeroItem})">✓ Approve</button>`}
                          <button class="btn-sm" style="background:#fee2e2;color:#991b1b;font-weight:700;" onclick="reviewSupplierQuotation(${q.quotation_id}, 'reject', ${quoteTotal}, ${hasZeroItem})">✕ Reject</button>
                          ${isZeroQuote ? `<div style="color:#dc2626;font-size:0.74rem;font-weight:700;margin-top:3px;">⚠ KSh 0 quote cannot be accepted</div>` : (hasOutOfRange ? `<div style="color:#dc2626;font-size:0.74rem;font-weight:700;margin-top:3px;">⚠ Out-of-range price</div>` : '')}
                        ` : `<small style="color:#64748b;">${esc(q.reviewed_by || 'Reviewed')}</small>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('loadInventoryQuotationsPage error:', err);
    }
  };

  window.loadInventoryDeliveriesPage = async function () {
    const host = ensureContainer('erp-inv-deliveries-container', 'module-inventory_deliveries');
    if (!host) return;
    try {
      const bundle = await fetchInventoryProcurementData();
      if (!bundle) return;
      const { data, supMap, poMap } = bundle;
      host.innerHTML = `
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px;">
          <div class="table-responsive">
            <table>
              <thead><tr><th>Delivery #</th><th>Supplier</th><th>PO #</th><th>Dispatched Qty</th><th>Status</th><th>Delivery Note</th><th>GRN &amp; Stock Confirmation</th></tr></thead>
              <tbody>
                ${data.deliveries.length === 0 ? '<tr><td colspan="7" style="text-align:center;">No supplier deliveries logged yet.</td></tr>' : data.deliveries.map(d => `
                  <tr>
                    <td><strong>${esc(d.delivery_number)}</strong></td>
                    <td>${esc(supMap[Number(d.supplier_id)]?.supplier_name || `Supplier #${d.supplier_id}`)}</td>
                    <td>${esc(poMap[Number(d.po_id)]?.po_number || `PO-${d.po_id}`)}</td>
                    <td><strong>${d.dispatched_qty} units</strong></td>
                    <td>${badge(d.delivery_status)}</td>
                    <td>
                      ${esc(d.delivery_note_ref || '—')}
                      ${d.delivery_note_doc_path ? `<button class="btn-sm" onclick="downloadErpDocProxy('delivery', ${d.delivery_id}, '${esc(d.delivery_note_doc_name)}')">📎</button>` : ''}
                    </td>
                    <td>
                      ${d.inventory_confirmed
                        ? `<span class="badge-tag" style="background:#dcfce7;color:#166534;">✓ Confirmed (${d.confirmed_received_qty} rec${d.outstanding_qty > 0 ? `, ${d.outstanding_qty} out` : ''})</span> ${d.grn_number ? `<code style="margin-left:4px;">${esc(d.grn_number)}</code>` : ''}`
                        : `<button class="btn-sm btn-primary" onclick="confirmSupplierDelivery(${d.delivery_id}, ${d.dispatched_qty})">✓ Confirm Received &amp; Generate GRN</button>`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('loadInventoryDeliveriesPage error:', err);
    }
  };

  window.loadInventoryInvoicesPage = async function () {
    const host = ensureContainer('erp-inv-invoices-container', 'module-inventory_invoices');
    if (!host) return;
    try {
      const bundle = await fetchInventoryProcurementData();
      if (!bundle) return;
      const { data, supMap, poMap } = bundle;
      host.innerHTML = `
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px;">
          <div class="table-responsive">
            <table>
              <thead><tr><th>Invoice #</th><th>Supplier</th><th>PO #</th><th>Delivery / GRN</th><th>Total (KES)</th><th>Doc</th><th>Status</th><th>Pass to Finance</th></tr></thead>
              <tbody>
                ${(data.invoices || []).length === 0 ? '<tr><td colspan="8" style="text-align:center;">No supplier invoices uploaded to Inventory Manager yet.</td></tr>' : (data.invoices || []).map(i => {
                  const st = String(i.status || '').toLowerCase();
                  const linkedPo = i.po_id ? poMap[Number(i.po_id)] : null;
                  const deliveryConfirmed = !i.po_id || Boolean(linkedPo?.forwarded_to_finance || i.grn_number);
                  const grnDisplay = i.grn_number || linkedPo?.grn_number;
                  const invTotal = Number(i.total_amount || 0);
                  const isZeroInvoice = invTotal <= 0;
                  return `
                    <tr>
                      <td><strong>${esc(i.invoice_number)}</strong></td>
                      <td>${esc(supMap[Number(i.supplier_id)]?.supplier_name || `Supplier #${i.supplier_id}`)}</td>
                      <td>${i.po_id ? esc(linkedPo?.po_number || `PO-${i.po_id}`) : '—'}</td>
                      <td>${grnDisplay ? `<code>${esc(grnDisplay)}</code>` : (deliveryConfirmed ? '✓ Confirmed' : '<span style="color:#b45309;font-size:0.8rem;">⏳ Confirm delivery first</span>')}</td>
                      <td><strong>${fmtMoney(i.total_amount)}</strong></td>
                      <td>${i.document_path ? `<button class="btn-sm" onclick="downloadErpDocProxy('invoice', ${i.invoice_id}, '${esc(i.document_name)}')">📎 View</button>` : '—'}</td>
                      <td>${badge(st)}</td>
                      <td style="white-space:nowrap;">
                        ${st === 'pending_review' ? `
                          ${isZeroInvoice
                            ? `<button class="btn-sm" disabled style="background:#e2e8f0;color:#94a3b8;font-weight:700;cursor:not-allowed;" title="Cannot accept an invoice with KSh 0 amount">✓ Pass to Finance for Payment</button>`
                            : `<button class="btn-sm" style="background:#dcfce7;color:#166534;font-weight:700;" onclick="reviewSupplierInvoice(${i.invoice_id}, 'approve', ${invTotal})">✓ Pass to Finance for Payment</button>`}
                          <button class="btn-sm" style="background:#fee2e2;color:#991b1b;font-weight:700;" onclick="reviewSupplierInvoice(${i.invoice_id}, 'reject', ${invTotal})">✕ Reject</button>
                          ${isZeroInvoice ? `<div style="color:#dc2626;font-size:0.74rem;font-weight:700;margin-top:3px;">⚠ KSh 0 invoice cannot be accepted</div>` : ''}
                        ` : `<small style="color:#64748b;">Passed (${esc(i.reviewed_by || 'Inventory Manager')})</small>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('loadInventoryInvoicesPage error:', err);
    }
  };

  window.loadInventoryProcurement = async function () {
    await Promise.all([
      loadInventoryPurchaseOrdersPage(),
      loadInventoryQuotationsPage(),
      loadInventoryDeliveriesPage(),
      loadInventoryInvoicesPage()
    ]);
  };

  window.downloadErpDocProxy = downloadErpSupplierDoc;

  function suggestProductMaxPrice(prod) {
    const buy = Number(prod?.buying_price || 0);
    const sell = Number(prod?.selling_price || 0);
    const base = buy > 0 ? buy : (sell > 0 ? Math.round(sell * 0.72) : 200);
    return Math.max(10, Math.round(base * 1.15));
  }

  window.onPOItemProductChange = function (selectEl) {
    const row = selectEl?.closest('.po-create-item-row');
    if (!row) return;
    const opt = selectEl.options[selectEl.selectedIndex];
    const maxInput = row.querySelector('.po-item-max');
    if (opt && maxInput) {
      maxInput.value = Number(opt.dataset.max || 1500);
    }
  };

  window.addPOItemRow = function () {
    const container = document.getElementById('po-create-items-rows');
    if (!container) return;
    const prods = procurementCache.products || (typeof allInventory !== 'undefined' ? allInventory : []);
    const optsHtml = prods.map(p => {
      const maxP = suggestProductMaxPrice(p);
      return `<option value="${p.product_id}" data-name="${esc(p.product_name)}" data-max="${maxP}">${esc(p.product_name)} (Stock: ${p.quantity_in_stock})</option>`;
    }).join('');

    const firstMax = prods[0] ? suggestProductMaxPrice(prods[0]) : 1500;
    const row = document.createElement('div');
    row.className = 'po-create-item-row';
    row.style.cssText = 'display:grid; grid-template-columns:2.4fr 0.9fr 1.2fr 34px; gap:8px; align-items:end; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px;';
    row.innerHTML = `
      <div>
        <label style="font-size:0.72rem; font-weight:700; color:#475569; display:block; margin-bottom:2px;">Product *</label>
        <select class="po-item-product" required onchange="onPOItemProductChange(this)" style="width:100%; padding:7px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.83rem;">
          ${optsHtml}
        </select>
      </div>
      <div>
        <label style="font-size:0.72rem; font-weight:700; color:#475569; display:block; margin-bottom:2px;">Qty *</label>
        <input type="number" class="po-item-qty" min="1" value="25" required style="width:100%; padding:7px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.83rem;">
      </div>
      <div>
        <label style="font-size:0.72rem; font-weight:700; color:#475569; display:block; margin-bottom:2px;">Max Unit Price (KES) *</label>
        <input type="number" class="po-item-max" min="1" step="0.01" value="${firstMax}" required style="width:100%; padding:7px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.83rem;">
      </div>
      <button type="button" class="btn-sm" title="Remove item" style="background:#fee2e2; color:#b91c1c; padding:7px 8px;" onclick="if(document.querySelectorAll('.po-create-item-row').length > 1) this.closest('.po-create-item-row').remove();">&times;</button>
    `;
    container.appendChild(row);
  };

  window.openCreatePOModal = function () {
    const supSel = document.getElementById('po_create_supplier');
    if (supSel) {
      supSel.innerHTML = (procurementCache.suppliers || [])
        .filter(s => String(s.status || 'active').toLowerCase() === 'active')
        .map(s => `<option value="${s.supplier_id}">${esc(s.supplier_name)} (${esc(s.supplier_code || '')})</option>`)
        .join('');
    }
    const rowsHost = document.getElementById('po-create-items-rows');
    if (rowsHost) {
      rowsHost.innerHTML = '';
      addPOItemRow();
    }
    const notesEl = document.getElementById('po_create_notes');
    if (notesEl) notesEl.value = '';
    openModal('create-po-modal');
  };

  window.handleCreatePurchaseOrder = async function (e) {
    e.preventDefault();
    const supId = document.getElementById('po_create_supplier').value;
    const rows = Array.from(document.querySelectorAll('#po-create-items-rows .po-create-item-row'));
    const items = [];

    for (const row of rows) {
      const prodSel = row.querySelector('.po-item-product');
      const selectedOpt = prodSel?.options[prodSel.selectedIndex];
      const productName = selectedOpt?.dataset?.name || selectedOpt?.text || 'Electrical Item';
      const qty = parseInt(row.querySelector('.po-item-qty')?.value || 0, 10);
      const maxPrice = Number(row.querySelector('.po-item-max')?.value || 0);

      if (Number.isNaN(qty) || qty < 1) {
        return showToast(`Requested quantity for "${productName}" must be at least 1.`, 'error');
      }
      if (Number.isNaN(maxPrice) || maxPrice <= 0) {
        return showToast(`Maximum acceptable unit price for "${productName}" must be greater than KSh 0.`, 'error');
      }

      items.push({
        product_id: Number(prodSel.value) || null,
        product_name: productName,
        ordered_qty: qty,
        max_unit_price: Number(maxPrice.toFixed(2))
      });
    }

    if (items.length === 0) {
      return showToast('Please add at least one product to the Purchase Order.', 'error');
    }

    try {
      const res = await erpFetch('/api/erp/suppliers/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: Number(supId),
          expected_date: document.getElementById('po_create_expected_date').value || null,
          notes: (document.getElementById('po_create_notes')?.value || '').trim(),
          items
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed creating PO.');
      showToast(data.message, 'success');
      closeModal('create-po-modal');
      await loadInventoryProcurement();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.reviewSupplierQuotation = async function (quotationId, action, totalAmount, hasZeroItem = false) {
    if (action === 'approve' && (hasZeroItem || (totalAmount !== undefined && Number(totalAmount) <= 0))) {
      showToast('Cannot accept or approve a quotation with KSh 0 amount.', 'error');
      return;
    }
    const notes = prompt(`Enter optional review notes to ${action} this quotation:`, action === 'approve' ? 'Approved at quoted unit rates.' : 'Quote above target unit cost.');
    if (notes === null) return;
    try {
      const res = await erpFetch(`/api/erp/suppliers/quotations/${quotationId}/review`, {
        method: 'PUT',
        body: JSON.stringify({ action, review_notes: notes })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Review failed.');
      showToast(data.message, 'success');
      await loadInventoryProcurement();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.confirmSupplierDelivery = async function (deliveryId, defaultQty) {
    const qtyStr = prompt('Confirm exact received quantity to add into shop inventory stock:', String(defaultQty || 1));
    if (qtyStr === null) return;
    const confirmedQty = parseInt(qtyStr, 10);
    if (Number.isNaN(confirmedQty) || confirmedQty < 0) return showToast('Enter a valid received quantity.', 'error');
    try {
      const res = await erpFetch(`/api/erp/suppliers/deliveries/${deliveryId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          confirmed_received_qty: confirmedQty,
          confirmation_notes: `Verified and received ${confirmedQty} units into store inventory.`
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Delivery confirmation failed.');
      showToast(data.message, 'success');
      if (typeof loadInventoryAndMovements === 'function') await loadInventoryAndMovements();
      await loadInventoryProcurement();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // =========================================================================
  // 3. FINANCE MANAGER PAGES: SUPPLIER INVOICES & PAYMENTS
  // =========================================================================
  async function fetchFinanceSuppliersData() {
    const res = await erpFetch('/api/erp/suppliers/finance/overview');
    const data = await res.json();
    if (!res.ok || !data.success) return null;
    financeSupCache = data;
    const supMap = {};
    (data.suppliers || []).forEach(s => { supMap[Number(s.supplier_id)] = s; });
    return { data, supMap };
  }

  window.loadFinanceInvoicesPage = async function () {
    const host = ensureContainer('erp-finance-invoices-container', 'module-finance_invoices');
    if (!host) return;
    try {
      const bundle = await fetchFinanceSuppliersData();
      if (!bundle) return;
      const { data, supMap } = bundle;
      const quoteMap = {};
      (data.quotations || []).forEach(q => { quoteMap[Number(q.quotation_id)] = q; });
      const grnByPo = {};
      (data.grns || []).forEach(g => {
        if (g.po_id && !grnByPo[Number(g.po_id)]) grnByPo[Number(g.po_id)] = g;
      });
      const invByPo = {};
      (data.invoices || []).forEach(i => {
        if (i.po_id && String(i.status).toLowerCase() !== 'rejected' && !invByPo[Number(i.po_id)]) {
          invByPo[Number(i.po_id)] = i;
        }
      });
      const forwardedPOs = (data.purchase_orders || []).filter(p => p.forwarded_to_finance || grnByPo[Number(p.po_id)]);

      host.innerHTML = `
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px; margin-bottom:20px;">
          <h4 style="margin-top:0; margin-bottom:12px; color:var(--primary);">📦 Forwarded Deliveries (PO + Quotation + GRN) Ready for Payment</h4>
          <div class="table-responsive">
            <table>
              <thead><tr><th>PO #</th><th>Supplier</th><th>Quotation #</th><th>GRN #</th><th>Total (KES)</th><th>Delivery Status</th><th>Payment Status</th><th>Action</th></tr></thead>
              <tbody>
                ${forwardedPOs.length === 0 ? '<tr><td colspan="8" style="text-align:center;">No confirmed deliveries forwarded to Finance yet.</td></tr>' : forwardedPOs.map(p => {
                  const q = p.quotation_id ? quoteMap[Number(p.quotation_id)] : null;
                  const grn = grnByPo[Number(p.po_id)];
                  const linkedInv = invByPo[Number(p.po_id)];
                  const totalAmt = Number(p.total_amount || grn?.total_amount || 0);
                  const paidAmt = Number(linkedInv?.amount_paid || 0);
                  const bal = Math.max(0, totalAmt - paidAmt);
                  const payStatus = p.payment_status || linkedInv?.status || 'pending';
                  return `
                    <tr>
                      <td><strong>${esc(p.po_number || `PO-${p.po_id}`)}</strong></td>
                      <td>${esc(p.supplier_name || supMap[Number(p.supplier_id)]?.supplier_name)}</td>
                      <td>${q ? `<strong>${esc(q.quotation_number)}</strong>` : '—'}</td>
                      <td><code>${esc(p.grn_number || grn?.grn_number || grn?.purchase_number || '—')}</code></td>
                      <td><strong>${fmtMoney(totalAmt)}</strong></td>
                      <td>${badge(p.delivery_status || 'received')}</td>
                      <td>${badge(payStatus)}</td>
                      <td>
                        ${totalAmt <= 0
                          ? '<span style="color:#dc2626;font-weight:700;">⚠ KSh 0 Amount</span>'
                          : (bal > 0.01 && String(payStatus).toLowerCase() !== 'paid'
                              ? `<button class="btn-sm btn-primary" onclick="openPaySupplierModal(${linkedInv ? linkedInv.invoice_id : 0}, ${bal}, '${esc(linkedInv ? linkedInv.invoice_number : `${p.po_number} / ${p.grn_number || 'GRN'}`)}', ${p.po_id}, ${p.supplier_id || 0})">💳 Process Payment</button>`
                              : '<span style="color:#087443;font-weight:700;">✓ Settled</span>')}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px;">
          <h4 style="margin-top:0; margin-bottom:12px; color:var(--primary);">🧾 Invoices Passed by Inventory Manager for Payment</h4>
          <div class="table-responsive">
            <table>
              <thead><tr><th>Invoice #</th><th>Supplier</th><th>Total (KES)</th><th>Paid (KES)</th><th>Balance Due</th><th>Doc</th><th>Status</th><th>Finance Actions</th></tr></thead>
              <tbody>
                ${data.invoices.length === 0 ? '<tr><td colspan="8" style="text-align:center;">No supplier invoices passed by Inventory Manager yet.</td></tr>' : data.invoices.map(i => {
                  const invTotal = Number(i.total_amount || 0);
                  const isZeroInvoice = invTotal <= 0;
                  const bal = i.balance_due ?? Math.max(0, invTotal - Number(i.amount_paid || 0));
                  const st = String(i.status || '').toLowerCase();
                  return `
                    <tr>
                      <td><strong>${esc(i.invoice_number)}</strong></td>
                      <td>${esc(supMap[Number(i.supplier_id)]?.supplier_name || `Supplier #${i.supplier_id}`)}</td>
                      <td><strong>${fmtMoney(i.total_amount)}</strong></td>
                      <td style="color:#087443;font-weight:700;">${fmtMoney(i.amount_paid)}</td>
                      <td style="color:${bal > 0 ? '#dc2626' : '#087443'};font-weight:700;">${fmtMoney(bal)}</td>
                      <td>${i.document_path ? `<button class="btn-sm" onclick="downloadErpDocProxy('invoice', ${i.invoice_id}, '${esc(i.document_name)}')">📎 View</button>` : '—'}</td>
                      <td>${badge(st)}</td>
                      <td style="white-space:nowrap;">
                        ${st === 'pending_review' ? `
                          ${isZeroInvoice
                            ? `<button class="btn-sm" disabled style="background:#e2e8f0;color:#94a3b8;cursor:not-allowed;" title="Cannot accept an invoice with KSh 0 amount">✓ Accept</button>`
                            : `<button class="btn-sm" style="background:#dcfce7;color:#166534;" onclick="reviewSupplierInvoice(${i.invoice_id}, 'approve', ${invTotal})">✓ Accept</button>`}
                          <button class="btn-sm" style="background:#fee2e2;color:#991b1b;" onclick="reviewSupplierInvoice(${i.invoice_id}, 'reject', ${invTotal})">✕ Reject</button>
                          ${isZeroInvoice ? `<div style="color:#dc2626;font-size:0.74rem;font-weight:700;margin-top:3px;">⚠ KSh 0 invoice cannot be accepted</div>` : ''}
                        ` : ''}
                        ${st !== 'rejected' && !isZeroInvoice && bal > 0.01 ? `
                          <button class="btn-sm btn-primary" onclick="openPaySupplierModal(${i.invoice_id}, ${bal}, '${esc(i.invoice_number)}', ${i.po_id || 0}, ${i.supplier_id || 0})">💳 Record Payment</button>
                        ` : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('loadFinanceInvoicesPage error:', err);
    }
  };

  window.loadFinancePaymentsPage = async function () {
    const host = ensureContainer('erp-finance-payments-container', 'module-finance_payments');
    if (!host) return;
    try {
      const bundle = await fetchFinanceSuppliersData();
      if (!bundle) return;
      const { data, supMap } = bundle;

      host.innerHTML = `
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px;">
          <div class="table-responsive">
            <table>
              <thead><tr><th>Payment #</th><th>Supplier</th><th>Date</th><th>Method</th><th>Transaction Ref</th><th>Amount Paid (KES)</th><th>Recorded By</th></tr></thead>
              <tbody>
                ${data.payments.length === 0 ? '<tr><td colspan="7" style="text-align:center;">No supplier payments recorded yet.</td></tr>' : data.payments.map(p => `
                  <tr>
                    <td><strong>${esc(p.payment_number)}</strong></td>
                    <td>${esc(supMap[Number(p.supplier_id)]?.supplier_name || `Supplier #${p.supplier_id}`)}</td>
                    <td>${esc(p.payment_date || '—')}</td>
                    <td>${esc(p.payment_method)}</td>
                    <td><code>${esc(p.transaction_ref)}</code></td>
                    <td style="color:#087443;font-weight:800;">${fmtMoney(p.amount_paid)}</td>
                    <td>${esc(p.recorded_by)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('loadFinancePaymentsPage error:', err);
    }
  };

  window.loadFinanceSuppliers = async function () {
    await Promise.all([
      loadFinanceInvoicesPage(),
      loadFinancePaymentsPage()
    ]);
  };

  window.reviewSupplierInvoice = async function (invoiceId, action, totalAmount) {
    if ((action === 'approve' || action === 'accept') && totalAmount !== undefined && Number(totalAmount) <= 0) {
      showToast('Cannot accept or approve an invoice with KSh 0 amount.', 'error');
      return;
    }
    const notes = prompt(`Finance notes to ${action} invoice:`, action === 'approve' ? 'Verified against purchase receipt and approved for payment.' : 'Amount discrepancy found.');
    if (notes === null) return;
    try {
      const res = await erpFetch(`/api/erp/suppliers/invoices/${invoiceId}/review`, {
        method: 'PUT',
        body: JSON.stringify({ action, finance_notes: notes })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Review failed.');
      showToast(data.message, 'success');
      await Promise.all([loadFinanceSuppliers(), loadInventoryProcurement()]);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  function parseQuotationCredsClient(notes, sup) {
    const match = /Payment Credentials:\s*\[([^\]]+)\]/i.exec(String(notes || ''));
    if (match && match[1]) {
      const creds = {};
      match[1].split('|').map(s => s.trim()).forEach(part => {
        const idx = part.indexOf(':');
        if (idx > -1) {
          const k = part.slice(0, idx).trim().toLowerCase();
          const v = part.slice(idx + 1).trim();
          if (k === 'method') creds.method = v;
          else if (k === 'payee') creds.payee_name = v;
          else if (k === 'acc' || k === 'account') creds.account_number = v;
          else if (k === 'provider' || k === 'bank') creds.bank_provider = v;
        }
      });
      if (creds.method || creds.payee_name || creds.account_number || creds.bank_provider) {
        return {
          method: creds.method || 'M-Pesa Send Money',
          payee_name: creds.payee_name || sup?.supplier_name || '',
          account_number: creds.account_number || sup?.phone || '',
          bank_provider: creds.bank_provider || 'Safaricom M-Pesa',
          source: 'quotation'
        };
      }
    }
    if (sup) {
      return {
        method: 'M-Pesa Send Money',
        payee_name: sup.supplier_name || sup.contact_person || '',
        account_number: sup.phone || sup.email || '',
        bank_provider: 'Safaricom M-Pesa (Supplier Profile)',
        source: 'supplier_profile'
      };
    }
    return null;
  }

  function mapPaymentMethodOption(rawMethod) {
    const m = String(rawMethod || '').toLowerCase();
    if (m.includes('till') || m.includes('buy goods')) return 'M-Pesa Buy Goods Till';
    if (m.includes('paybill')) return 'M-Pesa Paybill';
    if (m.includes('m-pesa') || m.includes('mpesa') || m.includes('send money')) return 'M-Pesa Send Money';
    if (m.includes('cheque')) return 'Cheque';
    if (m.includes('cash')) return 'Cash';
    return 'Bank Transfer';
  }

  window.syncPaySupplierDestAccountInput = function () {
    const method = document.getElementById('pay_sup_method')?.value || '';
    const accEl = document.getElementById('pay_sup_dest_account');
    if (!accEl) return;
    if (/bank|eft|wire|rtgs/i.test(method)) {
      accEl.maxLength = 12;
      accEl.inputMode = 'numeric';
      accEl.value = accEl.value.replace(/[^0-9]/g, '').slice(0, 12);
    } else {
      accEl.maxLength = 30;
      accEl.inputMode = 'text';
    }
  };

  window.syncPaySupplierRefRules = function () {
    const method = document.getElementById('pay_sup_method')?.value || 'M-Pesa Paybill';
    if (typeof window.applyPaymentRefInputRules === 'function') {
      window.applyPaymentRefInputRules('pay_sup_ref', method, 'pay_sup_ref_label', {
        mpesa: 'M-Pesa Reference # * (Max 10 chars)',
        bank: 'Bank Transfer Ref # * (Max 12 digits)',
        cash: 'Transaction Ref # *'
      });
    }
    const accLbl = document.getElementById('pay_sup_dest_account_label');
    if (accLbl) {
      accLbl.textContent = /bank|eft|wire|rtgs/i.test(method)
        ? 'Bank Account # (Max 12 digits)'
        : 'Account / Till / Paybill / Phone #';
    }
    window.syncPaySupplierDestAccountInput();
  };

  window.openPaySupplierModal = function (invoiceId, balanceDue, invoiceNumber, poId = 0, supplierId = 0) {
    document.getElementById('pay_sup_invoice_id').value = invoiceId || 0;
    const poInput = document.getElementById('pay_sup_po_id');
    if (poInput) poInput.value = poId || 0;
    document.getElementById('pay_sup_invoice_label').textContent = `${invoiceNumber} (Remaining Balance: KES ${Number(balanceDue).toLocaleString()})`;
    document.getElementById('pay_sup_amount').value = Number(balanceDue).toFixed(2);
    document.getElementById('pay_sup_amount').max = Number(balanceDue).toFixed(2);
    document.getElementById('pay_sup_date').value = new Date().toISOString().split('T')[0];
    document.getElementById('pay_sup_ref').value = '';

    // Resolve supplier payment credentials from cached invoice -> PO -> quotation -> supplier profile
    const inv = invoiceId ? (financeSupCache.invoices || []).find(x => Number(x.invoice_id) === Number(invoiceId)) : null;
    const po = poId ? (financeSupCache.purchase_orders || []).find(x => Number(x.po_id) === Number(poId)) : null;
    const resolvedSupId = Number(supplierId || inv?.supplier_id || po?.supplier_id || 0);
    const sup = resolvedSupId ? (financeSupCache.suppliers || []).find(s => Number(s.supplier_id) === resolvedSupId) : null;

    const quoteId = Number(inv?.quotation_id || po?.quotation_id || 0);
    const matchingQuote = (quoteId && (financeSupCache.quotations || []).find(q => Number(q.quotation_id) === quoteId))
      || (poId && (financeSupCache.quotations || []).find(q => Number(q.po_id) === Number(poId)))
      || (resolvedSupId && (financeSupCache.quotations || []).find(q => Number(q.supplier_id) === resolvedSupId && /Payment Credentials:/i.test(q.notes || '')));

    const creds = inv?.payment_credentials
      || po?.payment_credentials
      || matchingQuote?.payment_credentials
      || parseQuotationCredsClient(matchingQuote?.notes, sup);

    const payeeEl = document.getElementById('pay_sup_dest_payee');
    const accEl = document.getElementById('pay_sup_dest_account');
    const provEl = document.getElementById('pay_sup_dest_provider');
    const srcEl = document.getElementById('pay_sup_where_source');
    const methodEl = document.getElementById('pay_sup_method');
    const notesEl = document.getElementById('pay_sup_notes');

    if (creds) {
      if (payeeEl) payeeEl.value = creds.payee_name || '';
      if (accEl) accEl.value = creds.account_number || '';
      if (provEl) provEl.value = creds.bank_provider || '';
      if (methodEl) methodEl.value = mapPaymentMethodOption(creds.method);
      if (srcEl) {
        srcEl.textContent = creds.source === 'quotation'
          ? `✅ From Quotation ${matchingQuote?.quotation_number || ''}`.trim()
          : 'ℹ️ From Supplier Profile';
      }
      if (notesEl) {
        const destSummary = [
          creds.payee_name ? `To: ${creds.payee_name}` : '',
          creds.account_number ? `Acc: ${creds.account_number}` : '',
          creds.bank_provider ? `(${creds.bank_provider})` : ''
        ].filter(Boolean).join(' • ');
        notesEl.value = destSummary || 'Full/part settlement per supplier credentials';
      }
    } else {
      if (payeeEl) payeeEl.value = sup?.supplier_name || '';
      if (accEl) accEl.value = sup?.phone || '';
      if (provEl) provEl.value = '';
      if (srcEl) srcEl.textContent = 'Enter payment destination';
      if (notesEl) notesEl.value = '';
    }

    window.syncPaySupplierRefRules();
    openModal('pay-supplier-modal');
  };

  window.handleRecordSupplierPayment = async function (e) {
    e.preventDefault();
    const invoiceId = Number(document.getElementById('pay_sup_invoice_id').value || 0);
    const poId = Number(document.getElementById('pay_sup_po_id')?.value || 0);
    const endpoint = invoiceId > 0
      ? `/api/erp/suppliers/invoices/${invoiceId}/pay`
      : `/api/erp/suppliers/purchase-orders/${poId}/pay`;
    const payMethod = document.getElementById('pay_sup_method').value;
    const rawSupRef = document.getElementById('pay_sup_ref').value.trim();
    if (typeof window.validatePaymentRefClient === 'function') {
      const refCheck = window.validatePaymentRefClient(payMethod, rawSupRef, { required: true, label: 'Transaction reference' });
      if (!refCheck.valid) {
        showToast(refCheck.message, 'error');
        document.getElementById('pay_sup_ref')?.focus();
        return;
      }
    }
    const destPayee = document.getElementById('pay_sup_dest_payee')?.value.trim() || '';
    const destAcc = document.getElementById('pay_sup_dest_account')?.value.trim() || '';
    if (/bank|eft|wire|rtgs/i.test(payMethod) && destAcc && !/^[0-9]{1,12}$/.test(destAcc)) {
      showToast('Bank account number must contain numbers only (0–9), up to 12 digits max.', 'error');
      document.getElementById('pay_sup_dest_account')?.focus();
      return;
    }
    const destProv = document.getElementById('pay_sup_dest_provider')?.value.trim() || '';
    const rawNotes = document.getElementById('pay_sup_notes').value.trim();
    const fullNotes = rawNotes || [destPayee ? `To: ${destPayee}` : '', destAcc ? `Acc: ${destAcc}` : '', destProv ? `(${destProv})` : ''].filter(Boolean).join(' • ');
    try {
      const res = await erpFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          amount_paid: Number(document.getElementById('pay_sup_amount').value),
          payment_method: payMethod,
          transaction_ref: rawSupRef,
          payment_date: document.getElementById('pay_sup_date').value,
          notes: fullNotes
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Payment failed.');
      showToast(data.message, 'success');
      closeModal('pay-supplier-modal');
      if (typeof loadFinanceRecords === 'function') await loadFinanceRecords();
      await loadFinanceSuppliers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
})();
