/**
 * Elight Electrical Shop - Unified Role-Scoped Module Notifications Center
 * Side-docked right panel + left-sidebar badges (never placed above module content).
 * Strict isolation: Only Admin sees all notifications across modules.
 * Every other user/customer/supplier sees ONLY notifications sent to their own modules
 * and can click/open directly into any notification and its referenced module/record.
 */
(function () {
  if (window.__elightModuleNotifsLoaded) return;
  window.__elightModuleNotifsLoaded = true;

  const renderedNotifRegistry = {};
  let sideDrawerContext = {
    portal: 'erp', // 'erp' | 'customer' | 'supplier'
    activeModule: 'overview',
    erpScope: 'module' // 'module' | 'all'
  };

  function escapeHtmlSafe(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function formatNotifTime(iso) {
    if (!iso) return 'Just now';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Recent';
    return d.toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function injectStyles() {
    if (document.getElementById('elight-notif-styles')) return;
    const style = document.createElement('style');
    style.id = 'elight-notif-styles';
    style.textContent = `
      .elight-nav-notif-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: #ef4444;
        color: #ffffff;
        font-size: 0.68rem;
        font-weight: 800;
        line-height: 1;
        margin-left: auto;
        flex-shrink: 0;
      }

      /* Side-of-module edge trigger tab (right edge, out of the way of module headers & tables) */
      .elight-side-notif-tab {
        position: fixed;
        right: 0;
        top: 138px;
        z-index: 950;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #cbd5e1;
        border-right: none;
        border-radius: 12px 0 0 12px;
        padding: 10px 13px 10px 14px;
        font-size: 0.82rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: -4px 4px 18px rgba(15, 23, 42, 0.14);
        transition: transform 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
      }
      .elight-side-notif-tab:hover {
        background: #f8fafc;
        transform: translateX(-2px);
        box-shadow: -6px 6px 22px rgba(15, 23, 42, 0.2);
      }
      .elight-side-notif-tab.has-unread {
        background: #fffbeb;
        border-color: #f59e0b;
        color: #92400e;
      }
      .elight-side-tab-label {
        writing-mode: horizontal-tb;
      }
      .elight-side-tab-count {
        background: #64748b;
        color: #ffffff;
        border-radius: 999px;
        padding: 2px 7px;
        font-size: 0.72rem;
        font-weight: 800;
        min-width: 20px;
        text-align: center;
      }
      .elight-side-notif-tab.has-unread .elight-side-tab-count {
        background: #ef4444;
      }

      /* Right-side slide-over Notifications Drawer */
      .elight-side-drawer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.38);
        backdrop-filter: blur(1px);
        z-index: 2090;
        display: none;
      }
      .elight-side-drawer-backdrop.open {
        display: block;
      }
      .elight-side-drawer {
        position: fixed;
        top: 0;
        right: 0;
        width: min(430px, 95vw);
        height: 100vh;
        background: #ffffff;
        box-shadow: -12px 0 36px rgba(15, 23, 42, 0.24);
        border-left: 1px solid #cbd5e1;
        z-index: 2100;
        display: flex;
        flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.22s ease;
      }
      .elight-side-drawer.open {
        transform: translateX(0);
      }
      .elight-side-drawer-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }
      .elight-side-drawer-tabs {
        display: flex;
        gap: 6px;
        padding: 10px 14px;
        background: #ffffff;
        border-bottom: 1px solid #e2e8f0;
      }
      .elight-side-scope-btn {
        flex: 1;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        color: #334155;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
        text-align: center;
      }
      .elight-side-scope-btn.active {
        background: #102b46;
        border-color: #102b46;
        color: #ffffff;
      }
      .elight-side-drawer-body {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .module-notif-item {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 0.84rem;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .module-notif-item:hover {
        background: #f8fafc;
      }
      .module-notif-item.unread {
        background: #eff6ff;
        border-left: 4px solid #2563eb;
      }
      .module-notif-item.unread.sev-warning {
        background: #fffbeb;
        border-left-color: #d97706;
      }
      .module-notif-item.unread.sev-danger {
        background: #fef2f2;
        border-left-color: #dc2626;
      }
      .module-notif-item.unread.sev-success {
        background: #f0fdf4;
        border-left-color: #16a34a;
      }
      .module-notif-meta {
        font-size: 0.75rem;
        color: #64748b;
        margin-top: 4px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .module-notif-actions {
        display: flex;
        flex-direction: column;
        gap: 5px;
        flex-shrink: 0;
        align-items: flex-end;
      }
      .module-notif-btn {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1e293b;
        border-radius: 6px;
        padding: 4px 9px;
        font-size: 0.73rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .module-notif-btn.open-btn {
        background: #1e3a8a;
        border-color: #1e3a8a;
        color: #ffffff;
      }
      .module-notif-btn.open-btn:hover {
        background: #1d4ed8;
      }
      .module-notif-btn:hover {
        background: #f1f5f9;
      }
      .elight-notif-highlight-row {
        outline: 2px solid #f59e0b !important;
        background-color: #fef3c7 !important;
        transition: background-color 0.4s ease;
      }
      .elight-notif-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
        z-index: 2500;
      }
      .elight-notif-modal-backdrop.open {
        display: flex;
      }
      .elight-notif-modal-card {
        background: #ffffff;
        border-radius: 14px;
        width: min(560px, 100%);
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 24px 50px rgba(15, 23, 42, 0.3);
        border: 1px solid #cbd5e1;
        padding: 20px 22px;
      }
      @media (max-width: 720px) {
        .elight-side-notif-tab {
          top: auto;
          bottom: 18px;
          padding: 9px 12px;
          border-radius: 999px;
          right: 14px;
          border-right: 1px solid #cbd5e1;
        }
      }
      @media print {
        .elight-side-notif-tab,
        .elight-side-drawer,
        .elight-side-drawer-backdrop,
        .elight-notif-modal-backdrop {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureSideNotifUI() {
    injectStyles();

    // Remove any legacy above-module inline or topbar notification panels
    document.querySelectorAll('.module-notif-panel, #elightErpTopNotifWrap').forEach(el => el.remove());

    let tab = document.getElementById('elightSideNotifTab');
    if (!tab) {
      tab = document.createElement('button');
      tab.id = 'elightSideNotifTab';
      tab.type = 'button';
      tab.className = 'elight-side-notif-tab';
      tab.setAttribute('aria-label', 'Open Notifications');
      tab.innerHTML = `
        <span>🔔</span>
        <span class="elight-side-tab-label">Notifications</span>
        <span class="elight-side-tab-count" id="elightSideTabCount">0</span>
      `;
      tab.addEventListener('click', () => window.toggleSideNotifDrawer());
      document.body.appendChild(tab);
    }

    let backdrop = document.getElementById('elightSideDrawerBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'elightSideDrawerBackdrop';
      backdrop.className = 'elight-side-drawer-backdrop';
      backdrop.addEventListener('click', () => window.closeSideNotifDrawer());
      document.body.appendChild(backdrop);
    }

    let drawer = document.getElementById('elightSideNotifDrawer');
    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.id = 'elightSideNotifDrawer';
      drawer.className = 'elight-side-drawer';
      drawer.setAttribute('aria-label', 'Notifications panel');
      drawer.innerHTML = `
        <div class="elight-side-drawer-head">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:1.05rem;">🔔</span>
            <strong style="font-size:0.95rem; color:#0f172a;">Notifications</strong>
            <span id="elightSideDrawerUnreadPill" style="background:#ef4444; color:#fff; border-radius:999px; padding:2px 8px; font-size:0.72rem; font-weight:800; display:none;">0 Unread</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" id="elightSideMarkAllBtn" class="module-notif-btn" style="display:none;">✓ Mark Read</button>
            <button type="button" class="module-notif-btn" onclick="closeSideNotifDrawer()" aria-label="Close notifications">✕</button>
          </div>
        </div>
        <div id="elightSideScopeTabs" class="elight-side-drawer-tabs" style="display:none;"></div>
        <div id="elightSideDrawerBody" class="elight-side-drawer-body">
          <div style="padding:18px; text-align:center; color:#64748b; font-size:0.84rem;">Loading notifications...</div>
        </div>
      `;
      document.body.appendChild(drawer);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) {
          window.closeSideNotifDrawer();
        }
      });
    }

    return { tab, backdrop, drawer };
  }

  window.openSideNotifDrawer = function () {
    const { backdrop, drawer } = ensureSideNotifUI();
    backdrop.classList.add('open');
    drawer.classList.add('open');
  };

  window.closeSideNotifDrawer = function () {
    const backdrop = document.getElementById('elightSideDrawerBackdrop');
    const drawer = document.getElementById('elightSideNotifDrawer');
    if (backdrop) backdrop.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
  };

  window.toggleSideNotifDrawer = function () {
    const drawer = document.getElementById('elightSideNotifDrawer');
    if (drawer && drawer.classList.contains('open')) {
      window.closeSideNotifDrawer();
    } else {
      window.openSideNotifDrawer();
    }
  };

  window.setErpSideNotifScope = function (scope) {
    sideDrawerContext.erpScope = scope === 'all' ? 'all' : 'module';
    renderErpSideDrawer();
  };

  function ensureNotifDetailModal() {
    injectStyles();
    let backdrop = document.getElementById('elightNotifDetailBackdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'elightNotifDetailBackdrop';
    backdrop.className = 'elight-notif-modal-backdrop';
    backdrop.innerHTML = `
      <div class="elight-notif-modal-card" onclick="event.stopPropagation()">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px;">
          <div>
            <div style="font-size:0.74rem; text-transform:uppercase; letter-spacing:0.04em; color:#64748b; font-weight:700;">🔔 Notification Details</div>
            <h3 id="elightNotifModalTitle" style="margin:4px 0 0 0; font-size:1.06rem; color:#0f172a;">Notification</h3>
          </div>
          <button type="button" onclick="closeNotifDetailModal()" style="border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; border-radius:6px; padding:4px 10px; font-weight:700; cursor:pointer;">✕</button>
        </div>
        <div id="elightNotifModalMessage" style="font-size:0.92rem; line-height:1.55; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:14px;"></div>
        <div id="elightNotifModalMeta" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:8px; font-size:0.8rem; color:#475569; margin-bottom:16px;"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; border-top:1px solid #e2e8f0; padding-top:12px;">
          <button type="button" id="elightNotifModalJumpBtn" class="module-notif-btn open-btn" style="padding:7px 14px; font-size:0.82rem; display:none;">Open Record →</button>
          <button type="button" onclick="closeNotifDetailModal()" class="module-notif-btn" style="padding:7px 14px; font-size:0.82rem;">Close</button>
        </div>
      </div>
    `;
    backdrop.addEventListener('click', () => window.closeNotifDetailModal());
    document.body.appendChild(backdrop);
    return backdrop;
  }

  window.closeNotifDetailModal = function () {
    const backdrop = document.getElementById('elightNotifDetailBackdrop');
    if (backdrop) backdrop.classList.remove('open');
  };

  function showNotifDetailModal(notif, { jumpLabel = '', onJump = null } = {}) {
    if (!notif) return;
    const backdrop = ensureNotifDetailModal();
    const titleEl = document.getElementById('elightNotifModalTitle');
    const msgEl = document.getElementById('elightNotifModalMessage');
    const metaEl = document.getElementById('elightNotifModalMeta');
    const jumpBtn = document.getElementById('elightNotifModalJumpBtn');

    if (titleEl) titleEl.textContent = notif.title || 'Notification';
    if (msgEl) msgEl.textContent = notif.message || 'No additional details.';
    if (metaEl) {
      metaEl.innerHTML = `
        <div><strong>From:</strong> ${escapeHtmlSafe(notif.sender_name || 'Elight System')}</div>
        <div><strong>Source Module:</strong> ${escapeHtmlSafe(String(notif.source_module || 'system').replace(/_/g, ' '))}</div>
        <div><strong>Reference #:</strong> ${notif.ref_no ? `<code>${escapeHtmlSafe(notif.ref_no)}</code>` : '—'}</div>
        <div><strong>Received:</strong> ${escapeHtmlSafe(formatNotifTime(notif.created_at))}</div>
      `;
    }
    if (jumpBtn) {
      if (typeof onJump === 'function') {
        jumpBtn.style.display = 'inline-block';
        jumpBtn.textContent = jumpLabel || 'Go to Record →';
        jumpBtn.onclick = () => {
          window.closeNotifDetailModal();
          onJump();
        };
      } else {
        jumpBtn.style.display = 'none';
        jumpBtn.onclick = null;
      }
    }
    backdrop.classList.add('open');
  }

  function highlightMatchingRef(containerRoot, refNo) {
    const cleanRef = String(refNo || '').trim().replace(/^#/, '');
    if (!cleanRef || !containerRoot) return false;
    const upper = cleanRef.toUpperCase();
    const candidates = Array.from(containerRoot.querySelectorAll('tbody tr, .kpi-card, .portal-card'));
    for (const row of candidates) {
      if ((row.textContent || '').toUpperCase().includes(upper)) {
        row.classList.add('elight-notif-highlight-row');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => row.classList.remove('elight-notif-highlight-row'), 4500);
        return true;
      }
    }
    return false;
  }

  function retryHighlightRef(rootSelector, refNo, maxAttempts = 10) {
    if (!refNo) return;
    let attempt = 0;
    const tick = () => {
      attempt += 1;
      const root = document.querySelector(rootSelector);
      if (root && highlightMatchingRef(root, refNo)) return;
      if (attempt < maxAttempts) {
        setTimeout(tick, 250);
      }
    };
    setTimeout(tick, 200);
  }

  let handledQueryNotif = false;
  function checkQueryRefHighlight(rootSelector, itemsList = []) {
    try {
      const qs = new URLSearchParams(window.location.search);
      const ref = qs.get('ref');
      const openNotifId = qs.get('open_notif');
      if (ref) {
        retryHighlightRef(rootSelector, ref, 10);
      }
      if (openNotifId && !handledQueryNotif) {
        const match = (itemsList || []).find(it => String(it.notification_id || it.id) === String(openNotifId));
        if (match) {
          handledQueryNotif = true;
          showNotifDetailModal(match, {
            jumpLabel: ref ? `Locate ${ref} on Page` : 'Stay on Page',
            onJump: ref ? () => highlightMatchingRef(document.querySelector(rootSelector), ref) : null
          });
        }
      }
    } catch (e) {}
  }

  function renderNotifItemsHtml(items, { onMarkReadFnName, onOpenFnName, resolveTargetFn, emptyText = 'No incoming notifications right now.' } = {}) {
    if (!items || items.length === 0) {
      return `<div style="padding:20px 16px; font-size:0.84rem; color:#64748b; text-align:center;">${escapeHtmlSafe(emptyText)}</div>`;
    }
    return items.map((n, idx) => {
      const rawId = String(n.notification_id || n.id || `tmp-${Date.now()}-${idx}`);
      const refNo = String(n.ref_no || (n.related_id ? String(n.related_id) : '')).trim();
      const targetVal = typeof resolveTargetFn === 'function' ? resolveTargetFn(n) : (n.action_module || n.target_module || '');
      renderedNotifRegistry[rawId] = { notif: n, target: targetVal, ref: refNo };

      const encodedId = encodeURIComponent(rawId);
      const sev = escapeHtmlSafe(n.severity || (n.notification_type && /reject|warn|hold/i.test(n.notification_type) ? 'warning' : 'info'));
      const unreadCls = n.is_read ? '' : 'unread';
      const openCall = `${onOpenFnName}('${encodedId}')`;
      const markCall = `${onMarkReadFnName}('${encodedId}')`;
      const refBadge = refNo
        ? `<code style="background:#e2e8f0; color:#0f172a; padding:1px 6px; border-radius:4px; font-size:0.72rem; font-weight:700;">${escapeHtmlSafe(refNo)}</code>`
        : '';
      const openBtn = `<button type="button" class="module-notif-btn open-btn" onclick="event.stopPropagation(); ${openCall}">Open →</button>`;
      const readBtn = !n.is_read
        ? `<button type="button" class="module-notif-btn" onclick="event.stopPropagation(); ${markCall}">✓ Read</button>`
        : `<span style="font-size:0.72rem; color:#94a3b8; font-weight:600;">Read</span>`;

      return `
        <div class="module-notif-item ${unreadCls} sev-${sev}" onclick="${openCall}">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:800; color:#0f172a; line-height:1.3;">
              ${!n.is_read ? '<span style="color:#2563eb; margin-right:4px;">●</span>' : ''}
              ${escapeHtmlSafe(n.title || 'Update')}
            </div>
            <div style="color:#334155; margin-top:3px; line-height:1.45;">${escapeHtmlSafe(n.message || '')}</div>
            <div class="module-notif-meta">
              ${n.sender_name ? `<span>From: <strong>${escapeHtmlSafe(n.sender_name)}</strong></span>` : ''}
              ${refBadge}
              <span>${formatNotifTime(n.created_at)}</span>
            </div>
          </div>
          <div class="module-notif-actions">
            ${openBtn}
            ${readBtn}
          </div>
        </div>
      `;
    }).join('');
  }

  function updateSideTriggerSummary(unreadCount, totalCount) {
    const { tab } = ensureSideNotifUI();
    const countEl = document.getElementById('elightSideTabCount');
    const pillEl = document.getElementById('elightSideDrawerUnreadPill');
    if (tab) {
      tab.classList.toggle('has-unread', unreadCount > 0);
      tab.title = unreadCount > 0
        ? `${unreadCount} unread notification(s) — click to open side panel`
        : `${totalCount || 0} notification(s) — click to open side panel`;
    }
    if (countEl) {
      countEl.textContent = unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : String(totalCount || 0);
    }
    if (pillEl) {
      if (unreadCount > 0) {
        pillEl.style.display = 'inline-block';
        pillEl.textContent = `${unreadCount} Unread`;
      } else {
        pillEl.style.display = 'none';
      }
    }
  }

  // ========================================================
  // 1. ERP PORTAL (admin.html) NOTIFICATIONS
  // ========================================================
  let erpNotifState = {
    notifications: [],
    unread_count: 0,
    counts_by_module: {},
    active_module_list: []
  };

  function getCurrentErpRole() {
    if (window.currentUser?.role) return String(window.currentUser.role).trim();
    try {
      const parsed = JSON.parse(localStorage.getItem('elight_user') || '{}');
      return String(parsed.role || '').trim();
    } catch (e) {
      return '';
    }
  }

  function isCurrentUserErpAdmin() {
    const r = getCurrentErpRole().toLowerCase();
    return ['admin', 'administrator', 'owner', 'superadmin'].includes(r);
  }

  function getErpAllowedModulesList() {
    try {
      if (typeof getAllowedModulesForRole === 'function' && window.currentUser?.role) {
        return getAllowedModulesForRole(normalizeRole(currentUser.role));
      }
    } catch (e) {}
    return [];
  }

  const ERP_MODULE_SEARCH_MAP = {
    admin: 'users-search-input',
    customer_care: 'cc-search-input',
    cashier: 'cashier-search-input',
    finance_releases: 'fin-releases-search',
    inventory: 'erp-inv-search',
    feedback: 'admin-feedback-search',
    activity: 'activity-search-input'
  };

  window.focusModuleNotificationTarget = function (targetMod, refNo) {
    const cleanRef = String(refNo || '').trim().replace(/^#/, '');
    const applySearchAndHighlight = () => {
      const searchId = ERP_MODULE_SEARCH_MAP[targetMod];
      if (searchId && cleanRef) {
        const inp = document.getElementById(searchId);
        if (inp) {
          inp.value = cleanRef;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      if (cleanRef) {
        retryHighlightRef(`#module-${targetMod}`, cleanRef, 10);
      }
    };

    if (typeof switchModule === 'function' && window.currentActiveERPModule !== targetMod) {
      switchModule(targetMod);
    }
    applySearchAndHighlight();
  };

  window.markErpNotifRead = async function (encodedId) {
    const notifId = decodeURIComponent(String(encodedId || ''));
    const role = getCurrentErpRole();
    const mod = window.currentActiveERPModule || 'all';
    await fetch(`/api/notifications/${encodeURIComponent(notifId)}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': role
      },
      body: JSON.stringify({ module: mod, user_role: role })
    }).catch(() => {});
    await window.refreshErpModuleNotifications(mod);
  };

  window.openErpNotifModule = async function (encodedId) {
    const notifId = decodeURIComponent(String(encodedId || ''));
    const entry = renderedNotifRegistry[notifId];
    const notifObj = entry?.notif ||
      erpNotifState.notifications.find(n => String(n.notification_id) === notifId) ||
      erpNotifState.active_module_list.find(n => String(n.notification_id) === notifId);
    const targetModule = entry?.target || notifObj?.action_module || '';
    const refNo = entry?.ref || notifObj?.ref_no || '';

    window.closeSideNotifDrawer();

    const allowed = getErpAllowedModulesList();
    const currentMod = window.currentActiveERPModule || 'overview';
    const rawTarget = targetModule || currentMod;
    const safeTarget = (allowed.length === 0 || allowed.includes(rawTarget) || isCurrentUserErpAdmin())
      ? rawTarget
      : (allowed.includes(currentMod) ? currentMod : allowed[0]);

    if (safeTarget) {
      window.focusModuleNotificationTarget(safeTarget, refNo);
    }

    if (notifObj) {
      showNotifDetailModal(notifObj, {
        jumpLabel: safeTarget && safeTarget !== currentMod
          ? `Open ${safeTarget.replace(/_/g, ' ')} →`
          : (refNo ? `Locate ${refNo} →` : ''),
        onJump: safeTarget ? () => window.focusModuleNotificationTarget(safeTarget, refNo) : null
      });
    }

    await window.markErpNotifRead(encodedId);
  };

  window.markAllErpNotifsRead = async function (scopeMod) {
    const role = getCurrentErpRole();
    const mod = scopeMod || window.currentActiveERPModule || 'all';
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': role
      },
      body: JSON.stringify({
        module: mod,
        user_role: role,
        allowed_modules: getErpAllowedModulesList().join(',')
      })
    }).catch(() => {});
    await window.refreshErpModuleNotifications(window.currentActiveERPModule || mod);
  };

  function updateSidebarBadges(countsByModule) {
    document.querySelectorAll('.erp-nav-btn').forEach(btn => {
      const onclickAttr = btn.getAttribute('onclick') || '';
      const match = onclickAttr.match(/switchModule\('([^']+)'\)/);
      if (!match) return;
      const modName = match[1];
      const count = Number((countsByModule && countsByModule[modName]) || 0);
      let badge = btn.querySelector('.elight-nav-notif-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'elight-nav-notif-badge';
          btn.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.title = `${count} unread notification(s)`;
      } else if (badge) {
        badge.remove();
      }
    });

    document.querySelectorAll('.erp-nav-group').forEach(grp => {
      const toggle = grp.querySelector('.erp-group-toggle');
      if (!toggle) return;
      let groupTotal = 0;
      grp.querySelectorAll('.erp-submenu .erp-nav-btn').forEach(btn => {
        if (btn.closest('li')?.style.display === 'none') return;
        const m = (btn.getAttribute('onclick') || '').match(/switchModule\('([^']+)'\)/);
        if (m) groupTotal += Number((countsByModule && countsByModule[m[1]]) || 0);
      });
      let gBadge = toggle.querySelector('.elight-nav-notif-badge');
      if (groupTotal > 0) {
        if (!gBadge) {
          gBadge = document.createElement('span');
          gBadge.className = 'elight-nav-notif-badge';
          const chev = toggle.querySelector('.group-chevron');
          if (chev) toggle.insertBefore(gBadge, chev);
          else toggle.appendChild(gBadge);
        }
        gBadge.textContent = groupTotal > 99 ? '99+' : String(groupTotal);
      } else if (gBadge) {
        gBadge.remove();
      }
    });
  }

  function renderErpSideDrawer() {
    ensureSideNotifUI();
    const mod = sideDrawerContext.activeModule || window.currentActiveERPModule || 'overview';
    const modList = erpNotifState.active_module_list || [];
    const allList = erpNotifState.notifications || [];
    const modUnread = modList.filter(n => !n.is_read).length;
    const allUnread = erpNotifState.unread_count;

    // Show active module unread count on side tab if any, else total unread
    updateSideTriggerSummary(modUnread > 0 ? modUnread : allUnread, modList.length || allList.length);

    const tabsEl = document.getElementById('elightSideScopeTabs');
    const bodyEl = document.getElementById('elightSideDrawerBody');
    const markAllBtn = document.getElementById('elightSideMarkAllBtn');
    const pillEl = document.getElementById('elightSideDrawerUnreadPill');

    if (tabsEl) {
      tabsEl.style.display = 'flex';
      const activeScope = sideDrawerContext.erpScope === 'all' ? 'all' : 'module';
      tabsEl.innerHTML = `
        <button type="button" class="elight-side-scope-btn ${activeScope === 'module' ? 'active' : ''}" onclick="setErpSideNotifScope('module')">
          This Module (${modUnread > 0 ? `${modUnread} unread` : modList.length})
        </button>
        <button type="button" class="elight-side-scope-btn ${activeScope === 'all' ? 'active' : ''}" onclick="setErpSideNotifScope('all')">
          All My Modules (${allUnread > 0 ? `${allUnread} unread` : allList.length})
        </button>
      `;
    }

    const showingModule = sideDrawerContext.erpScope !== 'all';
    const itemsToRender = showingModule ? modList.slice(0, 20) : allList.slice(0, 25);
    const scopeUnread = showingModule ? modUnread : allUnread;

    if (pillEl) {
      if (scopeUnread > 0) {
        pillEl.style.display = 'inline-block';
        pillEl.textContent = `${scopeUnread} Unread`;
      } else {
        pillEl.style.display = 'none';
      }
    }

    if (markAllBtn) {
      if (scopeUnread > 0) {
        markAllBtn.style.display = 'inline-block';
        markAllBtn.textContent = showingModule ? '✓ Mark Module Read' : '✓ Mark All Read';
        markAllBtn.onclick = () => window.markAllErpNotifsRead(showingModule ? mod : 'all');
      } else {
        markAllBtn.style.display = 'none';
      }
    }

    if (bodyEl) {
      bodyEl.innerHTML = renderNotifItemsHtml(itemsToRender, {
        onMarkReadFnName: 'markErpNotifRead',
        onOpenFnName: 'openErpNotifModule',
        resolveTargetFn: (n) => n.action_module || (showingModule ? mod : n.target_module),
        emptyText: showingModule
          ? 'No notifications for this module right now.'
          : 'All caught up! No notifications in your modules.'
      });
    }
  }

  window.refreshErpModuleNotifications = async function (activeMod) {
    if (!document.querySelector('.erp-main-view')) return;
    const role = getCurrentErpRole();
    if (!role) return;

    ensureSideNotifUI();

    const mod = activeMod || window.currentActiveERPModule || 'overview';
    sideDrawerContext.portal = 'erp';
    sideDrawerContext.activeModule = mod;

    const allowedCsv = encodeURIComponent(getErpAllowedModulesList().join(','));
    const roleHeaders = { 'X-User-Role': role };

    try {
      const [allRes, modRes] = await Promise.all([
        fetch(`/api/notifications?module=all&user_role=${encodeURIComponent(role)}&allowed_modules=${allowedCsv}`, {
          cache: 'no-store',
          headers: roleHeaders
        }).then(r => r.json()).catch(() => null),
        mod === 'overview'
          ? Promise.resolve(null)
          : fetch(`/api/notifications?module=${encodeURIComponent(mod)}&user_role=${encodeURIComponent(role)}&allowed_modules=${allowedCsv}`, {
              cache: 'no-store',
              headers: roleHeaders
            }).then(r => r.json()).catch(() => null)
      ]);

      if (allRes && allRes.success) {
        erpNotifState.notifications = allRes.notifications || [];
        erpNotifState.unread_count = Number(allRes.unread_count || 0);
        erpNotifState.counts_by_module = allRes.counts_by_module || {};
        erpNotifState.active_module_list = mod === 'overview'
          ? (isCurrentUserErpAdmin() ? erpNotifState.notifications : [])
          : (modRes && modRes.success ? (modRes.notifications || []) : []);

        updateSidebarBadges(erpNotifState.counts_by_module);
        renderErpSideDrawer();
      }
    } catch (e) {}
  };

  // ========================================================
  // 2. CUSTOMER PORTAL NOTIFICATIONS
  // ========================================================
  let lastCustomerQuery = null;

  function resolveCustomerActionUrl(n) {
    if (n.action_url) return n.action_url;
    const text = `${n.source_module || ''} ${n.title || ''} ${n.ref_no || ''}`.toLowerCase();
    if (/warranty|serial|wrn-/.test(text)) return '/customer-warranties';
    if (/receipt|rcp-sr-/.test(text)) return '/customer-services';
    if (/payment|paid|balance|mpesa|finance/.test(text) && !/order/.test(text)) return '/customer-payments';
    if (/deliver|dispatch|driver|packed|ship|reschedul/.test(text)) return '/customer-deliveries';
    if (/service|technician|installation|#sr-/.test(text)) return '/customer-services';
    if (/booking|bk-/.test(text)) return '/customer-bookings';
    if (/feedback|review|complaint|inquiry/.test(text)) return '/customer-feedback';
    return '/customer-orders';
  }

  window.markCustomerNotifRead = async function (encodedId) {
    if (!lastCustomerQuery) return;
    const notifId = decodeURIComponent(String(encodedId || ''));
    await fetch(`/api/notifications/${encodeURIComponent(notifId)}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: 'customer',
        customer_phone: lastCustomerQuery.phone || '',
        customer_email: lastCustomerQuery.email || '',
        customer_name: lastCustomerQuery.name || ''
      })
    }).catch(() => {});
    await window.refreshCustomerNotifications(lastCustomerQuery);
  };

  window.openCustomerNotifTarget = async function (encodedId) {
    const notifId = decodeURIComponent(String(encodedId || ''));
    const entry = renderedNotifRegistry[notifId];
    const notifObj = entry?.notif || null;
    const refNo = entry?.ref || notifObj?.ref_no || '';
    const dest = entry?.target || (notifObj ? resolveCustomerActionUrl(notifObj) : '/customer-orders');

    window.closeSideNotifDrawer();
    await window.markCustomerNotifRead(encodedId);

    if (window.location.pathname === dest) {
      if (refNo) retryHighlightRef('.customer-shell', refNo, 6);
      if (notifObj) {
        showNotifDetailModal(notifObj, {
          jumpLabel: refNo ? `Highlight ${refNo}` : '',
          onJump: refNo ? () => highlightMatchingRef(document.querySelector('.customer-shell'), refNo) : null
        });
      }
      return;
    }

    const params = new URLSearchParams();
    if (refNo) params.set('ref', refNo);
    if (notifId) params.set('open_notif', notifId);
    const qStr = params.toString();
    window.location.href = qStr ? `${dest}?${qStr}` : dest;
  };

  window.markAllCustomerNotifsRead = async function () {
    if (!lastCustomerQuery) return;
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: 'customer',
        customer_phone: lastCustomerQuery.phone || '',
        customer_email: lastCustomerQuery.email || '',
        customer_name: lastCustomerQuery.name || ''
      })
    }).catch(() => {});
    await window.refreshCustomerNotifications(lastCustomerQuery);
  };

  window.refreshCustomerNotifications = async function (custInfo) {
    const shell = document.querySelector('.customer-shell');
    if (!shell || !custInfo) return;
    ensureSideNotifUI();
    sideDrawerContext.portal = 'customer';
    lastCustomerQuery = custInfo;

    const params = new URLSearchParams({
      module: 'customer',
      customer_phone: custInfo.phone || '',
      customer_email: custInfo.email || '',
      customer_name: custInfo.name || ''
    });

    try {
      const res = await fetch(`/api/notifications?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) return;

      const list = data.notifications || [];
      const unreadCount = Number(data.unread_count || 0);

      const toggleBtn = document.querySelector('#customerAccountDropdown .nav-dropdown-toggle');
      if (toggleBtn) {
        let b = toggleBtn.querySelector('.elight-nav-notif-badge');
        if (unreadCount > 0) {
          if (!b) {
            b = document.createElement('span');
            b.className = 'elight-nav-notif-badge';
            toggleBtn.appendChild(b);
          }
          b.textContent = String(unreadCount);
        } else if (b) {
          b.remove();
        }
      }

      updateSideTriggerSummary(unreadCount, list.length);

      const tabsEl = document.getElementById('elightSideScopeTabs');
      if (tabsEl) tabsEl.style.display = 'none';

      const markAllBtn = document.getElementById('elightSideMarkAllBtn');
      if (markAllBtn) {
        markAllBtn.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        markAllBtn.textContent = '✓ Mark All Read';
        markAllBtn.onclick = () => window.markAllCustomerNotifsRead();
      }

      const bodyEl = document.getElementById('elightSideDrawerBody');
      if (bodyEl) {
        bodyEl.innerHTML = renderNotifItemsHtml(list.slice(0, 15), {
          onMarkReadFnName: 'markCustomerNotifRead',
          onOpenFnName: 'openCustomerNotifTarget',
          resolveTargetFn: resolveCustomerActionUrl,
          emptyText: 'No new order, delivery, service, or support updates yet.'
        });
      }

      checkQueryRefHighlight('.customer-shell', list);
    } catch (e) {}
  };

  // ========================================================
  // 3. SUPPLIER PORTAL NOTIFICATIONS
  // ========================================================
  function resolveSupplierActionUrl(n) {
    if (n.action_url) return n.action_url;
    const key = `${n.related_type || ''} ${n.notification_type || ''} ${n.title || ''}`.toLowerCase();
    if (/payment/.test(key)) return '/supplier-payments';
    if (/delivery|invoice|grn/.test(key)) return '/supplier-orders';
    return '/supplier-tenders';
  }

  window.markSupplierPortalNotifRead = async function (encodedId) {
    if (typeof authFetch !== 'function') return;
    const notifId = decodeURIComponent(String(encodedId || ''));
    await authFetch(`/api/supplier/notifications/${encodeURIComponent(notifId)}/read`, { method: 'POST' }).catch(() => {});
    await window.refreshSupplierNotifications();
  };

  window.openSupplierNotifTarget = async function (encodedId) {
    const notifId = decodeURIComponent(String(encodedId || ''));
    const entry = renderedNotifRegistry[notifId];
    const notifObj = entry?.notif || null;
    const refNo = entry?.ref || String(notifObj?.ref_no || notifObj?.related_id || '').trim();
    const dest = entry?.target || (notifObj ? resolveSupplierActionUrl(notifObj) : '/supplier-tenders');

    window.closeSideNotifDrawer();
    await window.markSupplierPortalNotifRead(encodedId);

    if (window.location.pathname === dest) {
      if (refNo) retryHighlightRef('.portal-shell', refNo, 6);
      if (notifObj) {
        showNotifDetailModal(notifObj, {
          jumpLabel: refNo ? `Highlight ${refNo}` : '',
          onJump: refNo ? () => highlightMatchingRef(document.querySelector('.portal-shell'), refNo) : null
        });
      }
      return;
    }

    const params = new URLSearchParams();
    if (refNo) params.set('ref', refNo);
    if (notifId) params.set('open_notif', notifId);
    const qStr = params.toString();
    window.location.href = qStr ? `${dest}?${qStr}` : dest;
  };

  window.markAllSupplierPortalNotifsRead = async function () {
    if (typeof authFetch !== 'function') return;
    await authFetch('/api/supplier/notifications/read-all', { method: 'POST' }).catch(() => {});
    await window.refreshSupplierNotifications();
  };

  window.refreshSupplierNotifications = async function () {
    const shell = document.querySelector('.portal-shell');
    if (!shell || typeof authFetch !== 'function') return;
    ensureSideNotifUI();
    sideDrawerContext.portal = 'supplier';

    try {
      const res = await authFetch('/api/supplier/notifications');
      if (!res || !res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const list = (data.notifications || []).map(n => ({
        ...n,
        notification_id: n.notification_id || n.id,
        sender_name: n.sender_name || 'Elight ERP'
      }));
      const unreadCount = list.filter(n => !n.is_read).length;

      updateSideTriggerSummary(unreadCount, list.length);

      const tabsEl = document.getElementById('elightSideScopeTabs');
      if (tabsEl) tabsEl.style.display = 'none';

      const markAllBtn = document.getElementById('elightSideMarkAllBtn');
      if (markAllBtn) {
        markAllBtn.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        markAllBtn.textContent = '✓ Mark All Read';
        markAllBtn.onclick = () => window.markAllSupplierPortalNotifsRead();
      }

      const bodyEl = document.getElementById('elightSideDrawerBody');
      if (bodyEl) {
        bodyEl.innerHTML = renderNotifItemsHtml(list.slice(0, 15), {
          onMarkReadFnName: 'markSupplierPortalNotifRead',
          onOpenFnName: 'openSupplierNotifTarget',
          resolveTargetFn: resolveSupplierActionUrl,
          emptyText: 'No supplier portal notifications right now.'
        });
      }

      checkQueryRefHighlight('.portal-shell', list);
    } catch (e) {}
  };
})();
