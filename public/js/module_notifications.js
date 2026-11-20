/**
 * Elight Electrical Shop - Unified Role-Scoped Module Notifications Center
 * Strict isolation: Only Admin sees all notifications across modules.
 * Every other user/customer/supplier sees ONLY notifications sent to their own modules
 * and can click/open directly into the referenced module/record/page.
 */
(function () {
  if (window.__elightModuleNotifsLoaded) return;
  window.__elightModuleNotifsLoaded = true;

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
      .elight-topbar-notif-wrap {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        margin-bottom: 14px;
        position: relative;
        z-index: 40;
      }
      .elight-topbar-bell-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 7px 14px;
        font-size: 0.83rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(15,23,42,0.06);
      }
      .elight-topbar-bell-btn.has-unread {
        background: #fff7ed;
        border-color: #f59e0b;
        color: #9a3412;
      }
      .elight-topbar-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        width: min(460px, 94vw);
        max-height: 460px;
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(15,23,42,0.18);
        padding: 12px;
        display: none;
        z-index: 999;
      }
      .elight-topbar-dropdown.open {
        display: block;
      }
      .module-notif-panel {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        margin-bottom: 16px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(15,23,42,0.04);
      }
      .module-notif-panel.has-unread {
        border-color: #f59e0b;
        background: #fffdf7;
      }
      .module-notif-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 14px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        cursor: pointer;
      }
      .module-notif-panel.has-unread .module-notif-head {
        background: #fffbeb;
        border-bottom-color: #fde68a;
      }
      .module-notif-list {
        display: flex;
        flex-direction: column;
      }
      .module-notif-item {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 14px;
        border-top: 1px solid #f1f5f9;
        font-size: 0.84rem;
        transition: background-color 0.15s ease;
      }
      .module-notif-item.clickable:hover {
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
        margin-top: 3px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .module-notif-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
        align-items: center;
      }
      .module-notif-btn {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1e293b;
        border-radius: 6px;
        padding: 4px 9px;
        font-size: 0.74rem;
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
      @media print {
        .elight-topbar-notif-wrap,
        .module-notif-panel {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isCollapsed(key) {
    return sessionStorage.getItem(`elight_notif_collapsed_${key}`) === '1';
  }

  function setCollapsed(key, val) {
    sessionStorage.setItem(`elight_notif_collapsed_${key}`, val ? '1' : '0');
  }

  function isShowAll(key) {
    return sessionStorage.getItem(`elight_notif_showall_${key}`) === '1';
  }

  function toggleShowAll(key) {
    sessionStorage.setItem(`elight_notif_showall_${key}`, isShowAll(key) ? '0' : '1');
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

  function checkQueryRefHighlight(rootSelector) {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (!ref) return;
      const root = document.querySelector(rootSelector);
      if (root) {
        setTimeout(() => highlightMatchingRef(root, ref), 450);
      }
    } catch (e) {}
  }

  function renderNotifItemsHtml(items, { onMarkReadFnName, onOpenFnName, resolveTargetFn, emptyText = 'No notifications sent to this module yet.' } = {}) {
    if (!items || items.length === 0) {
      return `<div style="padding:12px 14px; font-size:0.82rem; color:#64748b;">${escapeHtmlSafe(emptyText)}</div>`;
    }
    return items.map(n => {
      const id = escapeHtmlSafe(n.notification_id || n.id || '');
      const sev = escapeHtmlSafe(n.severity || (n.notification_type && /reject|warn|hold/i.test(n.notification_type) ? 'warning' : 'info'));
      const unreadCls = n.is_read ? '' : 'unread';
      const refNo = String(n.ref_no || (n.related_id ? String(n.related_id) : '')).trim();
      const targetVal = typeof resolveTargetFn === 'function' ? resolveTargetFn(n) : (n.action_module || n.target_module || '');
      const openCall = onOpenFnName && targetVal
        ? `${onOpenFnName}('${escapeHtmlSafe(id)}', '${escapeHtmlSafe(targetVal)}', '${escapeHtmlSafe(refNo)}')`
        : '';
      const refBadge = refNo
        ? `<code style="background:#e2e8f0; color:#0f172a; padding:1px 6px; border-radius:4px; font-size:0.72rem; font-weight:700;">${escapeHtmlSafe(refNo)}</code>`
        : '';
      const openBtn = openCall
        ? `<button type="button" class="module-notif-btn open-btn" onclick="event.stopPropagation(); ${openCall}">Open →</button>`
        : '';
      const readBtn = !n.is_read
        ? `<button type="button" class="module-notif-btn" onclick="event.stopPropagation(); ${onMarkReadFnName}('${escapeHtmlSafe(id)}')">✓ Read</button>`
        : `<span style="font-size:0.72rem; color:#94a3b8; font-weight:600;">Read</span>`;

      return `
        <div class="module-notif-item ${openCall ? 'clickable' : ''} ${unreadCls} sev-${sev}" ${openCall ? `style="cursor:pointer;" onclick="${openCall}"` : ''}>
          <div style="min-width:0; flex:1;">
            <div style="font-weight:800; color:#0f172a; line-height:1.3;">
              ${!n.is_read ? '<span style="color:#2563eb; margin-right:4px;">●</span>' : ''}
              ${escapeHtmlSafe(n.title || 'Update')}
            </div>
            <div style="color:#334155; margin-top:2px; line-height:1.4;">${escapeHtmlSafe(n.message || '')}</div>
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
    const runFocus = () => {
      const searchId = ERP_MODULE_SEARCH_MAP[targetMod];
      if (searchId && cleanRef) {
        const inp = document.getElementById(searchId);
        if (inp) {
          inp.value = cleanRef;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      const sec = document.getElementById(`module-${targetMod}`);
      if (sec) {
        highlightMatchingRef(sec, cleanRef);
      }
    };

    if (typeof switchModule === 'function' && window.currentActiveERPModule !== targetMod) {
      switchModule(targetMod);
      setTimeout(runFocus, 550);
    } else {
      runFocus();
    }
  };

  function ensureErpTopBell() {
    const mainView = document.querySelector('.erp-main-view');
    if (!mainView || document.getElementById('elightErpTopNotifWrap')) return;
    const isAdmin = isCurrentUserErpAdmin();
    const wrap = document.createElement('div');
    wrap.id = 'elightErpTopNotifWrap';
    wrap.className = 'elight-topbar-notif-wrap';
    wrap.innerHTML = `
      <button type="button" id="elightErpBellBtn" class="elight-topbar-bell-btn" onclick="toggleErpTopNotifDropdown(event)">
        <span>🔔</span>
        <span>Notifications</span>
        <span id="elightErpBellCount" style="background:#ef4444; color:#fff; border-radius:999px; padding:1px 7px; font-size:0.74rem; display:none;">0</span>
      </button>
      <div id="elightErpTopNotifDropdown" class="elight-topbar-dropdown">
        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; margin-bottom:8px; border-bottom:1px solid #e2e8f0;">
          <strong style="color:#0f172a; font-size:0.9rem;">${isAdmin ? '🔔 All ERP Notifications (Admin)' : '🔔 Sent to My Modules'}</strong>
          <button type="button" class="module-notif-btn" onclick="markAllErpNotifsRead('all')">Mark All Read</button>
        </div>
        <div id="elightErpTopNotifList">
          <div style="padding:12px; text-align:center; color:#64748b; font-size:0.82rem;">Loading notifications...</div>
        </div>
      </div>
    `;
    const mobileBar = mainView.querySelector('.erp-mobile-topbar');
    if (mobileBar && mobileBar.nextSibling) {
      mainView.insertBefore(wrap, mobileBar.nextSibling);
    } else {
      mainView.prepend(wrap);
    }

    document.addEventListener('click', (e) => {
      const dd = document.getElementById('elightErpTopNotifDropdown');
      const w = document.getElementById('elightErpTopNotifWrap');
      if (dd && w && !w.contains(e.target)) {
        dd.classList.remove('open');
      }
    });
  }

  window.toggleErpTopNotifDropdown = function (e) {
    if (e) e.stopPropagation();
    const dd = document.getElementById('elightErpTopNotifDropdown');
    if (dd) dd.classList.toggle('open');
  };

  window.markErpNotifRead = async function (notifId) {
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

  window.openErpNotifModule = async function (notifId, targetModule, refNo = '') {
    await window.markErpNotifRead(notifId);
    const dd = document.getElementById('elightErpTopNotifDropdown');
    if (dd) dd.classList.remove('open');

    const allowed = getErpAllowedModulesList();
    const safeTarget = (allowed.length === 0 || allowed.includes(targetModule) || isCurrentUserErpAdmin())
      ? targetModule
      : (window.currentActiveERPModule || allowed[0]);

    if (safeTarget) {
      window.focusModuleNotificationTarget(safeTarget, refNo);
    }
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

  window.toggleErpInlineNotifCollapse = function (mod) {
    const k = `erp_${mod}`;
    setCollapsed(k, !isCollapsed(k));
    renderActiveModuleNotifBanner(mod);
  };

  window.toggleErpInlineShowAll = function (mod) {
    toggleShowAll(`erp_${mod}`);
    renderActiveModuleNotifBanner(mod);
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

  function renderActiveModuleNotifBanner(mod) {
    const section = document.getElementById(`module-${mod}`);
    if (!section) return;

    let panel = section.querySelector(`.module-notif-panel[data-notif-module="${mod}"]`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'module-notif-panel';
      panel.setAttribute('data-notif-module', mod);
      const headerRow = section.querySelector('.module-header-row');
      if (headerRow && headerRow.nextSibling) {
        section.insertBefore(panel, headerRow.nextSibling);
      } else {
        section.prepend(panel);
      }
    }

    const list = erpNotifState.active_module_list || [];
    const unread = list.filter(n => !n.is_read);
    const collapseKey = `erp_${mod}`;
    const hasManual = sessionStorage.getItem(`elight_notif_collapsed_${collapseKey}`) !== null;
    const collapsed = hasManual ? isCollapsed(collapseKey) : unread.length === 0;
    const showAll = isShowAll(collapseKey);
    const visibleItems = showAll ? list.slice(0, 20) : list.slice(0, 5);
    const isAdminOverview = mod === 'overview' && isCurrentUserErpAdmin();

    panel.classList.toggle('has-unread', unread.length > 0);
    panel.innerHTML = `
      <div class="module-notif-head" onclick="toggleErpInlineNotifCollapse('${escapeHtmlSafe(mod)}')">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:0.95rem;">🔔</span>
          <strong style="font-size:0.86rem; color:#0f172a;">${isAdminOverview ? 'All System Notifications (Admin)' : 'Notifications Sent to This Module'}</strong>
          ${unread.length > 0
            ? `<span style="background:#ef4444; color:#fff; border-radius:999px; padding:2px 8px; font-size:0.72rem; font-weight:800;">${unread.length} Unread</span>`
            : `<span style="background:#e2e8f0; color:#475569; border-radius:999px; padding:2px 8px; font-size:0.72rem; font-weight:700;">${list.length} Total</span>`}
        </div>
        <div style="display:flex; gap:6px; align-items:center;" onclick="event.stopPropagation()">
          ${unread.length > 0 ? `<button type="button" class="module-notif-btn" onclick="markAllErpNotifsRead('${escapeHtmlSafe(mod)}')">✓ Mark Module Read</button>` : ''}
          ${list.length > 5 && !collapsed ? `<button type="button" class="module-notif-btn" onclick="toggleErpInlineShowAll('${escapeHtmlSafe(mod)}')">${showAll ? 'Show Less' : `View All (${list.length})`}</button>` : ''}
          <button type="button" class="module-notif-btn" onclick="toggleErpInlineNotifCollapse('${escapeHtmlSafe(mod)}')">${collapsed ? '▾ Show' : '▴ Hide'}</button>
        </div>
      </div>
      ${collapsed ? '' : `<div class="module-notif-list">${renderNotifItemsHtml(visibleItems, {
        onMarkReadFnName: 'markErpNotifRead',
        onOpenFnName: 'openErpNotifModule',
        resolveTargetFn: (n) => n.action_module || mod,
        emptyText: 'No incoming notifications for this module right now.'
      })}</div>`}
    `;
  }

  window.refreshErpModuleNotifications = async function (activeMod) {
    if (!document.querySelector('.erp-main-view')) return;
    const role = getCurrentErpRole();
    if (!role) return;

    injectStyles();
    ensureErpTopBell();

    const mod = activeMod || window.currentActiveERPModule || 'overview';
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

        const bellBtn = document.getElementById('elightErpBellBtn');
        const bellCnt = document.getElementById('elightErpBellCount');
        if (bellBtn && bellCnt) {
          bellBtn.classList.toggle('has-unread', erpNotifState.unread_count > 0);
          bellCnt.style.display = erpNotifState.unread_count > 0 ? 'inline-block' : 'none';
          bellCnt.textContent = String(erpNotifState.unread_count);
        }

        const ddList = document.getElementById('elightErpTopNotifList');
        if (ddList) {
          ddList.innerHTML = renderNotifItemsHtml(erpNotifState.notifications.slice(0, 15), {
            onMarkReadFnName: 'markErpNotifRead',
            onOpenFnName: 'openErpNotifModule',
            resolveTargetFn: (n) => n.action_module || n.target_module,
            emptyText: 'All caught up! No notifications in your modules.'
          });
        }

        renderActiveModuleNotifBanner(mod);
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

  window.markCustomerNotifRead = async function (notifId) {
    if (!lastCustomerQuery) return;
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

  window.openCustomerNotifTarget = async function (notifId, targetUrl, refNo = '') {
    await window.markCustomerNotifRead(notifId);
    const dest = targetUrl || '/customer-orders';
    const nextHref = refNo ? `${dest}?ref=${encodeURIComponent(refNo)}` : dest;
    if (window.location.pathname === dest && refNo) {
      highlightMatchingRef(document.querySelector('.customer-shell'), refNo);
      return;
    }
    window.location.href = nextHref;
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

  window.toggleCustomerNotifCollapse = function () {
    setCollapsed('customer', !isCollapsed('customer'));
    if (lastCustomerQuery) window.refreshCustomerNotifications(lastCustomerQuery);
  };

  window.refreshCustomerNotifications = async function (custInfo) {
    const shell = document.querySelector('.customer-shell');
    if (!shell || !custInfo) return;
    injectStyles();
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

      let panel = document.getElementById('customerNotificationsPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'customerNotificationsPanel';
        panel.className = 'module-notif-panel';
        const banner = shell.querySelector('.customer-welcome-banner');
        if (banner && banner.nextSibling) {
          shell.insertBefore(panel, banner.nextSibling);
        } else {
          shell.prepend(panel);
        }
      }

      const hasManual = sessionStorage.getItem('elight_notif_collapsed_customer') !== null;
      const collapsed = hasManual ? isCollapsed('customer') : unreadCount === 0;

      panel.classList.toggle('has-unread', unreadCount > 0);
      panel.innerHTML = `
        <div class="module-notif-head" onclick="toggleCustomerNotifCollapse()">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>🔔</span>
            <strong style="font-size:0.88rem; color:#0f172a;">My Notifications &amp; Status Updates</strong>
            ${unreadCount > 0
              ? `<span style="background:#ef4444; color:#fff; border-radius:999px; padding:2px 8px; font-size:0.72rem; font-weight:800;">${unreadCount} Unread</span>`
              : `<span style="background:#e2e8f0; color:#475569; border-radius:999px; padding:2px 8px; font-size:0.72rem; font-weight:700;">${list.length} Total</span>`}
          </div>
          <div style="display:flex; gap:6px; align-items:center;" onclick="event.stopPropagation()">
            ${unreadCount > 0 ? '<button type="button" class="module-notif-btn" onclick="markAllCustomerNotifsRead()">✓ Mark All Read</button>' : ''}
            <button type="button" class="module-notif-btn" onclick="toggleCustomerNotifCollapse()">${collapsed ? '▾ Show' : '▴ Hide'}</button>
          </div>
        </div>
        ${collapsed ? '' : `<div class="module-notif-list">${renderNotifItemsHtml(list.slice(0, 10), {
          onMarkReadFnName: 'markCustomerNotifRead',
          onOpenFnName: 'openCustomerNotifTarget',
          resolveTargetFn: resolveCustomerActionUrl,
          emptyText: 'No new order, delivery, service, or support updates yet.'
        })}</div>`}
      `;

      checkQueryRefHighlight('.customer-shell');
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

  window.markSupplierPortalNotifRead = async function (notifId) {
    if (typeof authFetch !== 'function') return;
    await authFetch(`/api/supplier/notifications/${encodeURIComponent(notifId)}/read`, { method: 'POST' }).catch(() => {});
    await window.refreshSupplierNotifications();
  };

  window.openSupplierNotifTarget = async function (notifId, targetUrl, refNo = '') {
    await window.markSupplierPortalNotifRead(notifId);
    const dest = targetUrl || '/supplier-tenders';
    const nextHref = refNo ? `${dest}?ref=${encodeURIComponent(refNo)}` : dest;
    if (window.location.pathname === dest && refNo) {
      highlightMatchingRef(document.querySelector('.portal-shell'), refNo);
      return;
    }
    window.location.href = nextHref;
  };

  window.markAllSupplierPortalNotifsRead = async function () {
    if (typeof authFetch !== 'function') return;
    await authFetch('/api/supplier/notifications/read-all', { method: 'POST' }).catch(() => {});
    await window.refreshSupplierNotifications();
  };

  window.toggleSupplierNotifCollapse = function () {
    setCollapsed('supplier', !isCollapsed('supplier'));
    window.refreshSupplierNotifications();
  };

  window.refreshSupplierNotifications = async function () {
    const shell = document.querySelector('.portal-shell');
    if (!shell || typeof authFetch !== 'function') return;
    injectStyles();

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

      let panel = document.getElementById('supplierNotificationsPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'supplierNotificationsPanel';
        panel.className = 'module-notif-panel';
        const banner = shell.querySelector('.page-header-banner');
        if (banner && banner.nextSibling) {
          shell.insertBefore(panel, banner.nextSibling);
        } else {
          shell.prepend(panel);
        }
      }

      const hasManual = sessionStorage.getItem('elight_notif_collapsed_supplier') !== null;
      const collapsed = hasManual ? isCollapsed('supplier') : unreadCount === 0;

      panel.classList.toggle('has-unread', unreadCount > 0);
      panel.innerHTML = `
        <div class="module-notif-head" onclick="toggleSupplierNotifCollapse()">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>🔔</span>
            <strong style="font-size:0.88rem; color:#0f172a;">Notifications from Elight Procurement &amp; Finance</strong>
            ${unreadCount > 0
              ? `<span style="background:#ef4444; color:#fff; border-radius:999px; padding:2px 8px; font-size:0.72rem; font-weight:800;">${unreadCount} Unread</span>`
              : `<span style="background:#e2e8f0; color:#475569; border-radius:999px; padding:2px 8px; font-size:0.72rem; font-weight:700;">${list.length} Total</span>`}
          </div>
          <div style="display:flex; gap:6px; align-items:center;" onclick="event.stopPropagation()">
            ${unreadCount > 0 ? '<button type="button" class="module-notif-btn" onclick="markAllSupplierPortalNotifsRead()">✓ Mark All Read</button>' : ''}
            <button type="button" class="module-notif-btn" onclick="toggleSupplierNotifCollapse()">${collapsed ? '▾ Show' : '▴ Hide'}</button>
          </div>
        </div>
        ${collapsed ? '' : `<div class="module-notif-list">${renderNotifItemsHtml(list.slice(0, 10), {
          onMarkReadFnName: 'markSupplierPortalNotifRead',
          onOpenFnName: 'openSupplierNotifTarget',
          resolveTargetFn: resolveSupplierActionUrl,
          emptyText: 'No supplier portal notifications right now.'
        })}</div>`}
      `;

      checkQueryRefHighlight('.portal-shell');
    } catch (e) {}
  };
})();
