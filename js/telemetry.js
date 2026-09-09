/**
 * ReuLive - Client Telemetry & User Tracker
 * Tracks visits, URLs, country, device, and active duration in app.
 */

(function () {
  const STORAGE_KEY = 'reulive_session_id';
  let sessionId = sessionStorage.getItem(STORAGE_KEY);

  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  }

  let startTime = Date.now();
  let activeSeconds = 0;
  let heartbeatInterval = null;

  // Detect Device
  function getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'Tablet';
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
      return 'Móvil';
    }
    return 'Escritorio';
  }

  // Detect Browser
  function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('SamsungBrowser')) return 'Samsung';
    if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
    if (ua.includes('Trident')) return 'IE';
    if (ua.includes('Edge') || ua.includes('Edg')) return 'Edge';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return 'Navegador Web';
  }

  // Send Initial Visit
  async function recordInitialVisit() {
    const payload = {
      action: 'visit',
      sessionId: sessionId,
      url: window.location.pathname + window.location.search,
      referrer: document.referrer || 'Directo',
      device: getDeviceType(),
      browser: getBrowserName(),
      language: navigator.language || 'es'
    };

    try {
      await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Non-blocking telemetry
    }
  }

  // Send Heartbeat
  function sendHeartbeat() {
    activeSeconds = Math.round((Date.now() - startTime) / 1000);
    const payload = JSON.stringify({
      action: 'heartbeat',
      sessionId: sessionId,
      activeSeconds: activeSeconds
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/telemetry', blob);
    } else {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  }

  // Start active timer
  recordInitialVisit();

  // Heartbeat every 20 seconds
  heartbeatInterval = setInterval(sendHeartbeat, 20000);

  // Sync on tab change or close
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendHeartbeat();
    }
  });

  window.addEventListener('beforeunload', () => {
    sendHeartbeat();
  });

  // Expose global telemetry object
  window.ReuLiveTelemetry = {
    getSessionId: () => sessionId,
    getActiveSeconds: () => activeSeconds
  };
})();
