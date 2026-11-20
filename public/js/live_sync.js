/**
 * Elight Electrical Shop - Real-Time Automatic Sync Engine
 * Automatically detects mutations in the current tab, across browser tabs (BroadcastChannel + storage),
 * and across server sessions (/api/live-sync/version) so modules update live without manual Refresh buttons.
 */
(function () {
  if (window.__elightLiveSyncInitialized) return;
  window.__elightLiveSyncInitialized = true;

  const CHANNEL_NAME = 'elight_live_sync';
  const STORAGE_KEY = 'elight_sync_pulse';
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

  let activeSyncCallback = null;
  let activeCanSyncFn = null;
  let lastKnownVersion = null;
  let versionTimer = null;
  let fallbackTimer = null;
  let debounceTimer = null;
  let isSyncing = false;
  let lastSyncRunAt = 0;

  function hasActiveModalOpen() {
    if (document.querySelector('.modal-overlay.active')) return true;
    const overlays = document.querySelectorAll('.modal-overlay');
    for (const el of overlays) {
      if (el.style && (el.style.display === 'flex' || el.style.display === 'block')) {
        return true;
      }
    }
    return false;
  }

  function shouldIgnoreApiPath(urlStr) {
    const u = String(urlStr || '');
    if (!u.includes('/api/')) return true;
    if (u.includes('/api/live-sync/')) return true;
    if (/\/api\/(auth|supplier\/auth)\/(login|refresh|quick-login|register)/i.test(u)) return true;
    return false;
  }

  function broadcastElightChange(url, method) {
    const payload = { ts: Date.now(), url: String(url || ''), method: String(method || 'POST') };
    try {
      if (channel) channel.postMessage(payload);
    } catch (e) {}
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  async function triggerSync(reason) {
    if (typeof activeSyncCallback !== 'function') return;
    if (document.hidden) return;
    if (hasActiveModalOpen()) return;
    if (typeof activeCanSyncFn === 'function' && !activeCanSyncFn()) return;
    if (isSyncing) return;

    const now = Date.now();
    if (reason === 'focus' && now - lastSyncRunAt < 2000) return;

    isSyncing = true;
    lastSyncRunAt = now;
    try {
      await activeSyncCallback(reason);
    } catch (err) {
      // Silent background sync error; next cycle will retry
    } finally {
      isSyncing = false;
    }
  }

  function scheduleSync(reason, delayMs = 200) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      triggerSync(reason);
    }, delayMs);
  }

  // Wrap native fetch once so every successful API mutation broadcasts live updates
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const res = await nativeFetch(input, init);

    if (
      res &&
      res.ok &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
      !shouldIgnoreApiPath(url)
    ) {
      lastKnownVersion = null;
      broadcastElightChange(url, method);
      if (typeof activeSyncCallback === 'function') {
        scheduleSync('mutation', 250);
      }
    }
    return res;
  };

  async function checkServerVersion() {
    if (document.hidden || typeof activeSyncCallback !== 'function') return;
    if (hasActiveModalOpen()) return;
    if (typeof activeCanSyncFn === 'function' && !activeCanSyncFn()) return;

    try {
      const res = await nativeFetch('/api/live-sync/version', { cache: 'no-store' });
      if (!res || !res.ok) return;
      const data = await res.json();
      const ver = Number(data?.version);
      if (Number.isNaN(ver)) return;

      if (lastKnownVersion === null) {
        lastKnownVersion = ver;
      } else if (ver !== lastKnownVersion) {
        lastKnownVersion = ver;
        await triggerSync('version');
      }
    } catch (e) {}
  }

  if (channel) {
    channel.addEventListener('message', () => {
      scheduleSync('broadcast', 150);
    });
  }

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      scheduleSync('storage', 150);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkServerVersion();
      scheduleSync('visibility', 200);
    }
  });

  window.addEventListener('focus', () => {
    scheduleSync('focus', 250);
  });

  window.broadcastElightChange = broadcastElightChange;
  window.startElightLiveSync = function (callback, options = {}) {
    activeSyncCallback = callback;
    activeCanSyncFn = typeof options.canSync === 'function' ? options.canSync : null;

    if (versionTimer) clearInterval(versionTimer);
    if (fallbackTimer) clearInterval(fallbackTimer);

    const pollMs = Math.max(2000, Number(options.pollMs || 3000));
    const fallbackMs = Math.max(8000, Number(options.fallbackMs || 15000));

    checkServerVersion();
    versionTimer = setInterval(checkServerVersion, pollMs);
    fallbackTimer = setInterval(() => triggerSync('interval'), fallbackMs);
  };
})();
