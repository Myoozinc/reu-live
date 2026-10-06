/**
 * ReuLive - Admin Dashboard Controller
 * Handles authentication (credentials from Vercel environment variables), 100% REAL telemetry & meeting data,
 * interactive Chart.js analytics graphics, transcript review, and full database backups.
 */

document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'reulive_admin_token';
  let adminToken = sessionStorage.getItem(TOKEN_KEY);
  let telemetryData = [];
  let meetingsData = [];
  let currentViewingMeeting = null;
  let chartInstances = {};

  // Initialize client DBEngine for IndexedDB local sync
  const clientDB = window.DBEngine ? new window.DBEngine() : null;

  // DOM Elements - Login
  const loginSection = document.getElementById('adminLoginSection');
  const dashboardSection = document.getElementById('adminDashboardSection');
  const loginForm = document.getElementById('adminLoginForm');
  const adminUsernameInput = document.getElementById('adminUsername');
  const adminPasswordInput = document.getElementById('adminPassword');
  const loginErrorMsg = document.getElementById('loginErrorMsg');
  const loginErrorText = document.getElementById('loginErrorText');
  const btnLoginSubmit = document.getElementById('btnLoginSubmit');
  const btnLogout = document.getElementById('btnLogout');

  // DOM Elements - Theme & Actions
  const btnAdminThemeToggle = document.getElementById('btnAdminThemeToggle');
  const btnExportDb = document.getElementById('btnExportDb');
  const btnDownloadBackupJson = document.getElementById('btnDownloadBackupJson');
  const btnSyncLocalMeetings = document.getElementById('btnSyncLocalMeetings');
  const btnSyncMeetingsTab = document.getElementById('btnSyncMeetingsTab');
  const btnClearTelemetry = document.getElementById('btnClearTelemetry');
  const btnClearTelemetryTab = document.getElementById('btnClearTelemetryTab');
  const dbStatusBadge = document.getElementById('dbStatusBadge');

  // DOM Elements - KPIs
  const kpiTotalVisits = document.getElementById('kpiTotalVisits');
  const kpiActiveNow = document.getElementById('kpiActiveNow');
  const kpiTotalMeetings = document.getElementById('kpiTotalMeetings');
  const kpiTotalMinutes = document.getElementById('kpiTotalMinutes');
  const kpiAvgMeetingDuration = document.getElementById('kpiAvgMeetingDuration');
  const kpiTotalCallTime = document.getElementById('kpiTotalCallTime');
  const kpiTotalInterventions = document.getElementById('kpiTotalInterventions');
  const kpiAvgInterventions = document.getElementById('kpiAvgInterventions');
  const kpiTotalCountries = document.getElementById('kpiTotalCountries');
  const kpiDominantSentiment = document.getElementById('kpiDominantSentiment');
  const badgeCountMeetings = document.getElementById('badgeCountMeetings');
  const badgeCountVisits = document.getElementById('badgeCountVisits');
  const chartActivitySummary = document.getElementById('chartActivitySummary');

  // DOM Elements - Tabs & Tables
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const telemetryTableBody = document.getElementById('telemetryTableBody');
  const meetingsTableBody = document.getElementById('meetingsTableBody');
  const telemetrySearch = document.getElementById('telemetrySearch');
  const meetingsSearch = document.getElementById('meetingsSearch');
  const btnRefreshTelemetry = document.getElementById('btnRefreshTelemetry');
  const btnRefreshMeetings = document.getElementById('btnRefreshMeetings');

  // DOM Elements - Metrics
  const countriesDistributionList = document.getElementById('countriesDistributionList');
  const topicsDistributionList = document.getElementById('topicsDistributionList');
  const dbEngineType = document.getElementById('dbEngineType');

  // DOM Elements - Modal
  const transcriptModal = document.getElementById('transcriptModal');
  const btnCloseTranscriptModal = document.getElementById('btnCloseTranscriptModal');
  const modalMeetingTopic = document.getElementById('modalMeetingTopic');
  const modalMeetingMeta = document.getElementById('modalMeetingMeta');
  const modalAgreementsList = document.getElementById('modalAgreementsList');
  const modalActionItemsList = document.getElementById('modalActionItemsList');
  const modalTranscriptStream = document.getElementById('modalTranscriptStream');
  const btnCopyTranscript = document.getElementById('btnCopyTranscript');
  const btnDownloadMarkdown = document.getElementById('btnDownloadMarkdown');
  const btnDownloadPdf = document.getElementById('btnDownloadPdf');

  // ==========================================
  // 1. THEME MANAGEMENT
  // ==========================================
  const initTheme = () => {
    const saved = localStorage.getItem('reulive-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
  };

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('reulive-theme', theme);
    if (btnAdminThemeToggle) {
      const icon = btnAdminThemeToggle.querySelector('i');
      if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
    // Re-render charts with updated theme colors
    if (meetingsData.length > 0 || telemetryData.length > 0) {
      const computed = computeRealStats(meetingsData, telemetryData);
      renderAllCharts(computed, meetingsData, telemetryData);
    }
  };

  if (btnAdminThemeToggle) {
    btnAdminThemeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }
  initTheme();

  // ==========================================
  // 2. AUTHENTICATION & LOGIN
  // ==========================================
  const checkStoredAuth = async () => {
    if (!adminToken) {
      showLoginView();
      return;
    }

    try {
      const res = await fetch('/api/admin?action=verify_token', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        showDashboardView();
        loadAllData();
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
        adminToken = null;
        showLoginView();
      }
    } catch (e) {
      showLoginView();
    }
  };

  const showLoginView = () => {
    loginSection.classList.remove('is-hidden');
    dashboardSection.classList.add('is-hidden');
  };

  const showDashboardView = () => {
    loginSection.classList.add('is-hidden');
    dashboardSection.classList.remove('is-hidden');
  };

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginErrorMsg.classList.add('is-hidden');
      btnLoginSubmit.disabled = true;
      btnLoginSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando...';

      const username = adminUsernameInput.value.trim();
      const password = adminPasswordInput.value;

      try {
        const res = await fetch('/api/admin?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok && data.token) {
          adminToken = data.token;
          sessionStorage.setItem(TOKEN_KEY, adminToken);
          showDashboardView();
          loadAllData();
        } else {
          loginErrorText.textContent = data.error || 'Credenciales inválidas';
          loginErrorMsg.classList.remove('is-hidden');
        }
      } catch (err) {
        loginErrorText.textContent = 'Error de conexión con el servidor';
        loginErrorMsg.classList.remove('is-hidden');
      } finally {
        btnLoginSubmit.disabled = false;
        btnLoginSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem(TOKEN_KEY);
      adminToken = null;
      showLoginView();
    });
  }

  // ==========================================
  // 3. 100% REAL DATA FETCHING & SYNCHRONIZATION
  // ==========================================
  async function loadAllData() {
    if (!adminToken) return;

    try {
      // 1. Fetch server dashboard data
      const res = await fetch('/api/admin?action=get_dashboard', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
          showLoginView();
        }
        return;
      }

      const data = await res.json();
      let serverMeetings = data.meetings || [];
      telemetryData = (data.telemetry || []).filter(s => !s.isBot);

      // 2. Fetch local IndexedDB meetings from this browser to avoid any data loss
      let localMeetings = [];
      if (clientDB) {
        try {
          localMeetings = await clientDB.getMeetings();
        } catch (e) {
          console.warn('Could not read local IndexedDB:', e);
        }
      }

      // 3. Merge server and local meetings by unique ID
      const meetingMap = new Map();
      serverMeetings.forEach(m => { if (m && m.id) meetingMap.set(m.id, m); });

      const missingOnServer = [];
      localMeetings.forEach(m => {
        if (m && m.id) {
          if (!meetingMap.has(m.id)) {
            missingOnServer.push(m);
          }
          meetingMap.set(m.id, { ...meetingMap.get(m.id), ...m });
        }
      });

      // If we have local meetings not on the server, auto-sync them to the backend
      if (missingOnServer.length > 0) {
        fetch('/api/admin?action=sync_meetings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`
          },
          body: JSON.stringify({ meetings: missingOnServer })
        }).catch(err => console.warn('Background sync error:', err));
      }

      // Convert map to sorted array (newest first)
      meetingsData = Array.from(meetingMap.values()).sort((a, b) =>
        new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
      );

      // 4. Calculate 100% REAL aggregated statistics directly from the verified records
      const realStats = computeRealStats(meetingsData, telemetryData);

      // Update KPIs & Badges
      updateKPIs(realStats);

      // Render Tables
      renderTelemetryTable(telemetryData);
      renderMeetingsTable(meetingsData);
      renderMetrics(realStats);

      // Render All 8 Interactive Visual Charts
      renderAllCharts(realStats, meetingsData, telemetryData);

      if (dbEngineType) {
        dbEngineType.textContent = (data.stats && data.stats.storageType)
          ? data.stats.storageType
          : 'Almacenamiento Local Resiliente (Sync)';
      }
    } catch (err) {
      console.warn('Error loading admin dashboard data:', err);
    }
  }

  /**
   * Strictly computes statistics from actual verified records (No simulations, no fakes)
   */
  function computeRealStats(meetings, telemetry) {
    const realSessions = (telemetry || []).filter(s => !s.isBot);
    const totalVisits = realSessions.length;
    const now = Date.now();
    const activeNow = realSessions.filter(s => s.isOnline && (now - new Date(s.lastSeen).getTime() < 120000)).length;

    const totalMeetings = (meetings || []).length;
    const totalMeetingSeconds = (meetings || []).reduce((acc, m) => acc + (m.durationSeconds || 0), 0);
    const totalMeetingMinutes = Math.round(totalMeetingSeconds / 60);

    const avgDurationSeconds = totalVisits > 0
      ? Math.round(realSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / totalVisits)
      : 0;

    const avgMeetingDurationSeconds = totalMeetings > 0
      ? Math.round(totalMeetingSeconds / totalMeetings)
      : 0;

    let totalInterventions = 0;
    let speakerTurns = { user: 0, interlocutor: 0 };
    const topicCounts = {};
    const sentimentCounts = {};
    const durationBuckets = {
      '< 1 min': 0,
      '1 - 5 min': 0,
      '5 - 15 min': 0,
      '15 - 30 min': 0,
      '> 30 min': 0
    };

    (meetings || []).forEach(m => {
      const count = m.interventionsCount || (m.transcript ? m.transcript.length : 0);
      totalInterventions += count;

      (m.transcript || []).forEach(t => {
        if (t.speakerType === 'user' || t.speaker === 'Tú') {
          speakerTurns.user++;
        } else {
          speakerTurns.interlocutor++;
        }
      });

      const t = m.topic || 'Coordinación General';
      topicCounts[t] = (topicCounts[t] || 0) + 1;

      const s = m.sentiment || 'Neutral';
      sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;

      const secs = m.durationSeconds || 0;
      if (secs < 60) durationBuckets['< 1 min']++;
      else if (secs < 300) durationBuckets['1 - 5 min']++;
      else if (secs < 900) durationBuckets['5 - 15 min']++;
      else if (secs < 1800) durationBuckets['15 - 30 min']++;
      else durationBuckets['> 30 min']++;
    });

    const avgInterventions = totalMeetings > 0 ? Math.round(totalInterventions / totalMeetings) : 0;

    // Countries breakdown
    const countryCounts = {};
    realSessions.forEach(s => {
      const c = s.country || 'Desconocido';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    // Devices breakdown
    const deviceCounts = {};
    realSessions.forEach(s => {
      const d = s.device || 'Escritorio';
      deviceCounts[d] = (deviceCounts[d] || 0) + 1;
    });

    // Browsers breakdown
    const browserCounts = {};
    realSessions.forEach(s => {
      const b = s.browser || 'Navegador Web';
      browserCounts[b] = (browserCounts[b] || 0) + 1;
    });

    // Timeline breakdown (by date YYYY-MM-DD)
    const timelineMap = {};
    realSessions.forEach(s => {
      const date = new Date(s.firstSeen || Date.now()).toISOString().slice(0, 10);
      if (!timelineMap[date]) timelineMap[date] = { date, visits: 0, meetings: 0 };
      timelineMap[date].visits++;
    });
    (meetings || []).forEach(m => {
      const date = new Date(m.timestamp || Date.now()).toISOString().slice(0, 10);
      if (!timelineMap[date]) timelineMap[date] = { date, visits: 0, meetings: 0 };
      timelineMap[date].meetings++;
    });

    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

    // Dominant sentiment
    let dominantSentiment = 'Neutral';
    let maxSentimentCount = 0;
    Object.entries(sentimentCounts).forEach(([sent, cnt]) => {
      if (cnt > maxSentimentCount) {
        maxSentimentCount = cnt;
        dominantSentiment = sent;
      }
    });

    return {
      totalVisits,
      activeNow,
      totalMeetings,
      totalMeetingSeconds,
      totalMeetingMinutes,
      avgDurationSeconds,
      avgDurationFormatted: formatSeconds(avgDurationSeconds),
      avgMeetingDurationSeconds,
      avgMeetingDurationFormatted: formatSeconds(avgMeetingDurationSeconds),
      totalMeetingDurationFormatted: formatSeconds(totalMeetingSeconds),
      totalInterventions,
      avgInterventions,
      dominantSentiment,
      countryCounts,
      topicCounts,
      sentimentCounts,
      deviceCounts,
      browserCounts,
      durationBuckets,
      speakerTurns,
      timeline
    };
  }

  function updateKPIs(stats) {
    if (!stats) return;
    if (kpiTotalVisits) kpiTotalVisits.textContent = stats.totalVisits;
    if (kpiActiveNow) kpiActiveNow.textContent = `${stats.activeNow} en línea ahora`;

    if (kpiTotalMeetings) kpiTotalMeetings.textContent = stats.totalMeetings;
    if (kpiTotalMinutes) kpiTotalMinutes.textContent = `${stats.totalMeetingMinutes} min de audio`;

    if (kpiAvgMeetingDuration) kpiAvgMeetingDuration.textContent = stats.avgMeetingDurationFormatted;
    if (kpiTotalCallTime) kpiTotalCallTime.textContent = `Total: ${stats.totalMeetingDurationFormatted}`;

    if (kpiTotalInterventions) kpiTotalInterventions.textContent = stats.totalInterventions;
    if (kpiAvgInterventions) kpiAvgInterventions.textContent = `${stats.avgInterventions} turnos por llamada`;

    if (kpiTotalCountries) {
      const count = Object.keys(stats.countryCounts || {}).length;
      kpiTotalCountries.textContent = count;
    }

    if (kpiDominantSentiment) {
      kpiDominantSentiment.textContent = stats.dominantSentiment;
    }

    if (badgeCountMeetings) badgeCountMeetings.textContent = stats.totalMeetings;
    if (badgeCountVisits) badgeCountVisits.textContent = stats.totalVisits;
    if (chartActivitySummary) {
      chartActivitySummary.textContent = `${stats.totalVisits} visitas • ${stats.totalMeetings} llamadas`;
    }
  }

  // ==========================================
  // 4. CHART.JS VISUAL ANALYTICS ENGINE
  // ==========================================
  function renderAllCharts(stats, meetings, telemetry) {
    if (!window.Chart) {
      console.warn('Chart.js not loaded');
      return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const textDim = isDark ? '#64748b' : '#94a3b8';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)';

    // Palette tokens
    const brandBlue = isDark ? '#3b82f6' : '#1d68f0';
    const brandBlueSoft = isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(29, 104, 240, 0.15)';
    const accentEmerald = '#10b981';
    const accentEmeraldSoft = 'rgba(16, 185, 129, 0.2)';
    const accentLavender = '#6366f1';
    const accentSky = '#0284c7';
    const accentAmber = '#f59e0b';
    const accentDanger = '#ef4444';

    // Helper to safely destroy existing chart before re-creating
    const setupCanvas = (id) => {
      if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
      }
      const canvas = document.getElementById(id);
      if (!canvas) return null;
      return canvas.getContext('2d');
    };

    // ----------------------------------------------------
    // Chart 1: Activity Timeline (Visits & Meetings)
    // ----------------------------------------------------
    const ctxTimeline = setupCanvas('chartActivityTimeline');
    if (ctxTimeline) {
      const labels = stats.timeline.length > 0
        ? stats.timeline.map(t => t.date)
        : [new Date().toISOString().slice(0, 10)];
      const visitData = stats.timeline.length > 0
        ? stats.timeline.map(t => t.visits)
        : [0];
      const meetingData = stats.timeline.length > 0
        ? stats.timeline.map(t => t.meetings)
        : [0];

      chartInstances.timeline = new Chart(ctxTimeline, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Visitas Reales',
              data: visitData,
              borderColor: brandBlue,
              backgroundColor: brandBlueSoft,
              tension: 0.35,
              fill: true,
              pointBackgroundColor: brandBlue,
              pointRadius: 4,
              pointHoverRadius: 6
            },
            {
              label: 'Reuniones Grabadas',
              data: meetingData,
              borderColor: accentEmerald,
              backgroundColor: accentEmeraldSoft,
              tension: 0.35,
              fill: true,
              pointBackgroundColor: accentEmerald,
              pointRadius: 4,
              pointHoverRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 12, weight: 600 } }
            },
            tooltip: {
              backgroundColor: isDark ? '#1e293b' : '#0f172a',
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0',
              padding: 10,
              cornerRadius: 8
            }
          },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: textDim, font: { family: 'Plus Jakarta Sans', size: 11 } }
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { color: textDim, precision: 0, font: { family: 'Plus Jakarta Sans', size: 11 } }
            }
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 2: Countries Distribution (Doughnut)
    // ----------------------------------------------------
    const ctxCountries = setupCanvas('chartCountries');
    if (ctxCountries) {
      const countryEntries = Object.entries(stats.countryCounts || {}).sort((a, b) => b[1] - a[1]);
      const labels = countryEntries.length > 0 ? countryEntries.map(e => e[0]) : ['Sin datos aún'];
      const data = countryEntries.length > 0 ? countryEntries.map(e => e[1]) : [1];
      const colors = countryEntries.length > 0
        ? [brandBlue, accentSky, accentLavender, accentEmerald, accentAmber, '#ec4899', '#8b5cf6', '#14b8a6']
        : [isDark ? '#334155' : '#cbd5e1'];

      chartInstances.countries = new Chart(ctxCountries, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? '#0e1627' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'right',
              labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 }, boxWidth: 12 }
            }
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 3: Top Topics (Horizontal Bar)
    // ----------------------------------------------------
    const ctxTopics = setupCanvas('chartTopics');
    if (ctxTopics) {
      const topicEntries = Object.entries(stats.topicCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const labels = topicEntries.length > 0 ? topicEntries.map(e => e[0]) : ['Esperando reuniones'];
      const data = topicEntries.length > 0 ? topicEntries.map(e => e[1]) : [0];

      chartInstances.topics = new Chart(ctxTopics, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Reuniones',
            data,
            backgroundColor: accentLavender,
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { color: textDim, precision: 0 }
            },
            y: {
              grid: { display: false },
              ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11, weight: 600 } }
            }
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 4: Sentiment Breakdown (Doughnut)
    // ----------------------------------------------------
    const ctxSentiment = setupCanvas('chartSentiment');
    if (ctxSentiment) {
      const sMap = stats.sentimentCounts || {};
      const labels = ['Positivo / Colaborativo', 'Neutral / Analítico', 'Atención Requerida'];
      const data = [
        sMap['Positivo / Colaborativo'] || 0,
        sMap['Neutral'] || sMap['Neutral / Analítico'] || sMap['Analítico / Técnico'] || 0,
        sMap['Atención Requerida'] || sMap['Crítico / Alerta'] || 0
      ];

      chartInstances.sentiment = new Chart(ctxSentiment, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: data.some(v => v > 0) ? data : [1, 0, 0],
            backgroundColor: data.some(v => v > 0)
              ? [accentEmerald, brandBlue, accentDanger]
              : [isDark ? '#334155' : '#cbd5e1', '#334155', '#334155'],
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? '#0e1627' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 }, boxWidth: 12 }
            }
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 5: Meeting Durations (Bar)
    // ----------------------------------------------------
    const ctxDurations = setupCanvas('chartDurations');
    if (ctxDurations) {
      const buckets = stats.durationBuckets || {};
      chartInstances.durations = new Chart(ctxDurations, {
        type: 'bar',
        data: {
          labels: Object.keys(buckets),
          datasets: [{
            label: 'Número de Reuniones',
            data: Object.values(buckets),
            backgroundColor: accentAmber,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: textDim, font: { size: 11 } } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textDim, precision: 0 } }
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 6: Devices & Platforms (Doughnut)
    // ----------------------------------------------------
    const ctxDevices = setupCanvas('chartDevices');
    if (ctxDevices) {
      const devEntries = Object.entries(stats.deviceCounts || {});
      const labels = devEntries.length > 0 ? devEntries.map(e => e[0]) : ['Escritorio', 'Móvil'];
      const data = devEntries.length > 0 ? devEntries.map(e => e[1]) : [1, 0];

      chartInstances.devices = new Chart(ctxDevices, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: [brandBlue, accentSky, accentLavender],
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? '#0e1627' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 }, boxWidth: 12 }
            }
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 7: Speaker Turns (Bar)
    // ----------------------------------------------------
    const ctxSpeakerTurns = setupCanvas('chartSpeakerTurns');
    if (ctxSpeakerTurns) {
      const turns = stats.speakerTurns || { user: 0, interlocutor: 0 };
      chartInstances.speakerTurns = new Chart(ctxSpeakerTurns, {
        type: 'bar',
        data: {
          labels: ['Tú (Usuario)', 'Interlocutores'],
          datasets: [{
            label: 'Turnos de Palabra',
            data: [turns.user, turns.interlocutor],
            backgroundColor: [brandBlue, accentLavender],
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, font: { weight: 600 } } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textDim, precision: 0 } }
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 8: Web Browsers (Pie)
    // ----------------------------------------------------
    const ctxBrowsers = setupCanvas('chartBrowsers');
    if (ctxBrowsers) {
      const bEntries = Object.entries(stats.browserCounts || {}).sort((a, b) => b[1] - a[1]);
      const labels = bEntries.length > 0 ? bEntries.map(e => e[0]) : ['Chrome'];
      const data = bEntries.length > 0 ? bEntries.map(e => e[1]) : [1];

      chartInstances.browsers = new Chart(ctxBrowsers, {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: [accentSky, brandBlue, accentEmerald, accentAmber, '#ec4899'],
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? '#0e1627' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 }, boxWidth: 12 }
            }
          }
        }
      });
    }
  }

  // ==========================================
  // 5. RENDER TELEMETRY TABLE
  // ==========================================
  function renderTelemetryTable(sessions) {
    if (!telemetryTableBody) return;

    if (!sessions || sessions.length === 0) {
      telemetryTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            <i class="fa-solid fa-inbox"></i> No hay registros de visitas reales aún.
          </td>
        </tr>
      `;
      return;
    }

    telemetryTableBody.innerHTML = sessions.map(s => {
      const isOnline = Boolean(s.isOnline);
      const statusBadge = isOnline
        ? `<span class="badge-status-online"><span class="pulse-dot-sm"></span> En Vivo</span>`
        : `<span class="badge-status-offline">Desconectado</span>`;

      const countryFlag = getFlagEmoji(s.countryCode);
      const timeAgo = formatTimeAgo(s.lastSeen || s.firstSeen);
      const duration = formatSeconds(s.durationSeconds || 0);

      return `
        <tr>
          <td>${statusBadge}</td>
          <td>
            <div class="table-time-cell">
              <strong>${new Date(s.firstSeen).toLocaleDateString()}</strong>
              <span class="text-dim text-xs">${new Date(s.firstSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${timeAgo})</span>
            </div>
          </td>
          <td>
            <div class="table-country-cell">
              <span class="flag-emoji">${countryFlag}</span>
              <div>
                <strong>${s.country || 'Desconocido'}</strong>
                <span class="text-dim text-xs">${s.city && s.city !== 'Desconocida' ? s.city : ''}</span>
              </div>
            </div>
          </td>
          <td><code class="url-badge" title="${s.url}">${s.url || '/'}</code></td>
          <td>
            <div class="table-device-cell">
              <i class="${s.device === 'Móvil' ? 'fa-solid fa-mobile-screen' : 'fa-solid fa-laptop'}"></i>
              <span>${s.device} • ${s.browser}</span>
            </div>
          </td>
          <td><strong>${duration}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // ==========================================
  // 6. RENDER MEETINGS TABLE
  // ==========================================
  function renderMeetingsTable(meetings) {
    if (!meetingsTableBody) return;

    if (!meetings || meetings.length === 0) {
      meetingsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            <i class="fa-solid fa-microphone-slash"></i> Aún no se han guardado reuniones grabadas reales.
          </td>
        </tr>
      `;
      return;
    }

    meetingsTableBody.innerHTML = meetings.map(m => {
      const dateStr = m.dateFormatted || new Date(m.timestamp).toLocaleString();
      const topic = m.topic || 'General';
      const duration = m.durationFormatted || formatSeconds(m.durationSeconds || 0);
      const count = m.interventionsCount || (m.transcript ? m.transcript.length : 0);
      const sentiment = m.sentiment || 'Neutral';

      return `
        <tr data-id="${m.id}">
          <td>
            <strong>${dateStr}</strong>
          </td>
          <td>
            <span class="duration-badge"><i class="fa-regular fa-clock"></i> ${duration}</span>
          </td>
          <td>
            <div class="topic-pill-table">
              <i class="fa-solid fa-compass-drafting text-sky"></i>
              <strong>${topic}</strong>
            </div>
          </td>
          <td><span class="interventions-badge">${count} turnos</span></td>
          <td><span class="sentiment-pill">${sentiment}</span></td>
          <td>
            <div class="table-actions-cell" style="display: flex; gap: 6px;">
              <button class="btn btn-primary btn-xs btn-view-transcript" data-id="${m.id}">
                <i class="fa-regular fa-eye"></i> Ver Detalle
              </button>
              <button class="btn btn-outline btn-xs btn-delete-meeting text-danger" data-id="${m.id}" title="Eliminar registro">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to view buttons
    document.querySelectorAll('.btn-view-transcript').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openMeetingModal(id);
      });
    });

    // Attach click listeners to delete buttons
    document.querySelectorAll('.btn-delete-meeting').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Seguro que deseas eliminar este registro de reunión? Esta acción no se puede deshacer.')) {
          return;
        }

        try {
          // Delete from server
          await fetch(`/api/admin?action=delete_meeting&id=${id}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
          });

          // Delete from client IndexedDB
          if (clientDB) {
            await clientDB.deleteMeeting(id);
          }

          // Reload data
          loadAllData();
        } catch (e) {
          alert('Error eliminando reunión');
        }
      });
    });
  }

  // ==========================================
  // 7. RENDER METRICS & COUNTRIES TEXT LISTS
  // ==========================================
  function renderMetrics(stats) {
    if (!stats) return;

    // Countries List
    if (countriesDistributionList) {
      const countries = Object.entries(stats.countryCounts || {})
        .sort((a, b) => b[1] - a[1]);

      if (countries.length === 0) {
        countriesDistributionList.innerHTML = '<p class="text-muted">Sin datos geográficos suficientes</p>';
      } else {
        const total = stats.totalVisits || 1;
        countriesDistributionList.innerHTML = countries.map(([country, count]) => {
          const pct = Math.round((count / total) * 100);
          return `
            <div class="country-meter-row">
              <div class="country-meter-info">
                <span>${country}</span>
                <strong>${count} visitas (${pct}%)</strong>
              </div>
              <div class="meter-bar-track">
                <div class="meter-bar-fill" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Topics List
    if (topicsDistributionList) {
      const topics = Object.entries(stats.topicCounts || {})
        .sort((a, b) => b[1] - a[1]);

      if (topics.length === 0) {
        topicsDistributionList.innerHTML = '<p class="text-muted">Sin reuniones registradas aún</p>';
      } else {
        topicsDistributionList.innerHTML = topics.map(([topic, count]) => `
          <div class="topic-tag-chip">
            <span class="tag-title">${topic}</span>
            <span class="tag-count">${count}</span>
          </div>
        `).join('');
      }
    }
  }

  // ==========================================
  // 8. TRANSCRIPT MODAL VIEWER & EXECUTIVE PDF
  // ==========================================
  function openMeetingModal(meetingId) {
    const meeting = meetingsData.find(m => m.id === meetingId);
    if (!meeting) return;

    currentViewingMeeting = meeting;

    modalMeetingTopic.textContent = meeting.topic || 'Reunión sin título';
    const toneText = meeting.tone ? ` • Tono: ${meeting.tone}` : '';
    const intensityText = meeting.intensity ? ` • Intensidad: ${meeting.intensity}` : '';
    modalMeetingMeta.textContent = `${meeting.dateFormatted || new Date(meeting.timestamp).toLocaleString()} • Duración: ${meeting.durationFormatted || '00:00'} • Sentimiento: ${meeting.sentiment || 'Neutral'}${toneText}${intensityText}`;

    // Agreements
    if (modalAgreementsList) {
      const detailed = meeting.detailedAgreements && meeting.detailedAgreements.length > 0
        ? meeting.detailedAgreements
        : null;

      if (detailed) {
        modalAgreementsList.innerHTML = detailed.map(a => `
          <li style="margin-bottom: 6px;">
            <i class="fa-solid fa-check text-emerald"></i>
            <strong>${a.title}</strong>
            <span class="text-xs text-dim">(${a.speaker || 'Participante'} • ${a.priority || 'Estratégica'})</span>
          </li>
        `).join('');
      } else if (meeting.agreements && meeting.agreements.length > 0) {
        modalAgreementsList.innerHTML = meeting.agreements.map(a => `<li><i class="fa-solid fa-check text-emerald"></i> ${a}</li>`).join('');
      } else {
        modalAgreementsList.innerHTML = '<li class="text-muted">Sin acuerdos detectados</li>';
      }
    }

    // Action Items
    if (modalActionItemsList) {
      const detailed = meeting.detailedActionItems && meeting.detailedActionItems.length > 0
        ? meeting.detailedActionItems
        : null;

      if (detailed) {
        modalActionItemsList.innerHTML = detailed.map(t => `
          <li style="margin-bottom: 6px;">
            <i class="fa-regular fa-square text-amber"></i>
            <strong>${t.title}</strong>
            <span class="text-xs text-dim">(${t.speaker || 'Asignado'} • ${t.priority || 'Media'})</span>
          </li>
        `).join('');
      } else if (meeting.actionItems && meeting.actionItems.length > 0) {
        modalActionItemsList.innerHTML = meeting.actionItems.map(t => `<li><i class="fa-regular fa-square text-amber"></i> ${t}</li>`).join('');
      } else {
        modalActionItemsList.innerHTML = '<li class="text-muted">Sin tareas pendientes</li>';
      }
    }

    // Full Transcript Stream
    if (modalTranscriptStream) {
      const transcript = meeting.transcript || [];
      if (transcript.length === 0) {
        modalTranscriptStream.innerHTML = '<p class="text-muted text-center py-4">No se registraron líneas de conversación.</p>';
      } else {
        modalTranscriptStream.innerHTML = transcript.map(item => {
          const isUser = item.speakerType === 'user' || item.speaker === 'Tú';
          return `
            <div class="transcript-line ${isUser ? 'line-user' : 'line-interlocutor'}">
              <div class="line-header">
                <span class="speaker-name"><i class="${isUser ? 'fa-solid fa-user' : 'fa-solid fa-desktop'}"></i> ${item.speaker}</span>
                <span class="line-time">${item.timestamp || ''}</span>
              </div>
              <div class="line-text">${item.text}</div>
            </div>
          `;
        }).join('');
      }
    }

    transcriptModal.classList.remove('is-hidden');
  }

  if (btnCloseTranscriptModal) {
    btnCloseTranscriptModal.addEventListener('click', () => {
      transcriptModal.classList.add('is-hidden');
    });
  }

  // Copy transcript button
  if (btnCopyTranscript) {
    btnCopyTranscript.addEventListener('click', () => {
      if (!currentViewingMeeting || !currentViewingMeeting.transcript) return;
      const text = currentViewingMeeting.transcript
        .map(t => `[${t.timestamp || '00:00'}] ${t.speaker}: ${t.text}`)
        .join('\n');
      navigator.clipboard.writeText(text).then(() => {
        const orig = btnCopyTranscript.innerHTML;
        btnCopyTranscript.innerHTML = '<i class="fa-solid fa-check text-emerald"></i> ¡Copiado!';
        setTimeout(() => btnCopyTranscript.innerHTML = orig, 2000);
      });
    });
  }

  // =======================================================
  // EXECUTIVE PDF GENERATOR
  // =======================================================
  const generateExecutivePDF = (meeting) => {
    if (!meeting) return;

    const existing = document.getElementById('adminPdfExportDoc');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const container = document.createElement('div');
    container.className = 'executive-pdf-container';
    container.id = 'adminPdfExportDoc';

    const speakersList = meeting.metrics && meeting.metrics.speakers
      ? Object.keys(meeting.metrics.speakers).join(', ')
      : (meeting.transcript && meeting.transcript.length > 0
          ? [...new Set(meeting.transcript.map(t => t.speaker))].join(', ')
          : 'Participantes');

    const agreements = meeting.detailedAgreements && meeting.detailedAgreements.length > 0
      ? meeting.detailedAgreements
      : (meeting.agreements || []).map((a, i) => ({
          id: `agr_${i}`,
          title: typeof a === 'string' ? a : (a.title || a.text || 'Acuerdo'),
          speaker: 'Participante',
          timestamp: 'En sesión',
          priority: 'Estratégica',
          status: 'Compromiso en firme'
        }));

    const actionItems = meeting.detailedActionItems && meeting.detailedActionItems.length > 0
      ? meeting.detailedActionItems
      : (meeting.actionItems || []).map((t, i) => ({
          id: `act_${i}`,
          title: typeof t === 'string' ? t : (t.title || t.text || 'Tarea'),
          speaker: 'Asignado',
          timestamp: 'Pendiente',
          priority: 'Media',
          status: 'Por ejecutar'
        }));

    const m = meeting.metrics || {
      userRatio: 50,
      interlocutorRatio: 50,
      wpm: 120,
      technicalDepth: 'General / Estratégica',
      conversationalBalance: 'Equilibrado'
    };

    container.innerHTML = `
      <div class="pdf-header">
        <div class="pdf-brand" style="display: flex; align-items: center; gap: 12px;">
          <img src="assets/logo.jpg" style="width: 44px; height: 44px; border-radius: 10px; object-fit: cover; box-shadow: 0 2px 8px rgba(29, 104, 240, 0.25);" alt="Reu.live">
          <div>
            <h2 style="margin: 0; font-size: 20pt; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">Reu<span style="color: #1d68f0;">.live</span></h2>
            <p style="margin: 2px 0 0 0; font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Acta & Informe Ejecutivo de Reunión (Copia Administrativa)</p>
          </div>
        </div>
        <div class="pdf-meta-box">
          <div><strong>ID Sesión:</strong> ${meeting.id || 'N/A'}</div>
          <div><strong>Fecha:</strong> ${meeting.dateFormatted || new Date(meeting.timestamp || Date.now()).toLocaleDateString()}</div>
          <div><strong>Duración:</strong> ${meeting.durationFormatted || '00:00'}</div>
        </div>
      </div>

      <div class="pdf-title-banner" style="border-left: 5px solid #1d68f0;">
        <h3>${meeting.topic || 'Coordinación General'}</h3>
        <p><strong>Participantes:</strong> ${speakersList} &nbsp;|&nbsp; <strong>Tono:</strong> ${meeting.tone || 'Coordinación'} &nbsp;|&nbsp; <strong>Intensidad:</strong> ${meeting.intensity || 'Productiva'}</p>
      </div>

      <div class="pdf-kpi-grid">
        <div class="pdf-kpi-card">
          <span>Balance de Voz</span>
          <strong>Tú ${m.userRatio}% / Otros ${m.interlocutorRatio}%</strong>
        </div>
        <div class="pdf-kpi-card">
          <span>Ritmo de Habla</span>
          <strong>${m.wpm || 0} WPM</strong>
        </div>
        <div class="pdf-kpi-card">
          <span>Nivel Técnico</span>
          <strong>${m.technicalDepth || 'General'}</strong>
        </div>
        <div class="pdf-kpi-card">
          <span>Intervenciones</span>
          <strong>${meeting.interventionsCount || (meeting.transcript ? meeting.transcript.length : 0)} turnos</strong>
        </div>
      </div>

      <div class="pdf-section-title">
        <i class="fa-solid fa-handshake"></i> Acuerdos Formales & Compromisos (${agreements.length})
      </div>
      <div class="pdf-agreements-wrap">
        ${agreements.length > 0 ? agreements.map((a, idx) => `
          <div class="pdf-agreement-item">
            <div class="pdf-item-title">#${idx + 1} ${a.title}</div>
            <div class="pdf-item-meta">
              <span><strong>Responsable:</strong> ${a.speaker || 'No especificado'}</span>
              <span><strong>Momento:</strong> ${a.timestamp || 'En sesión'}</span>
              <span><strong>Prioridad:</strong> ${a.priority || 'Estratégica'}</span>
              <span><strong>Estado:</strong> ${a.status || 'Compromiso en firme'}</span>
            </div>
          </div>
        `).join('') : '<p style="font-size: 8.5pt; color: #64748b; font-style: italic; margin: 4px 0;">Sin acuerdos formales registrados.</p>'}
      </div>

      <div class="pdf-section-title" style="margin-top: 18px;">
        <i class="fa-solid fa-list-check"></i> Plan de Acción & Tareas (${actionItems.length})
      </div>
      <div class="pdf-actions-wrap">
        ${actionItems.length > 0 ? actionItems.map((t, idx) => `
          <div class="pdf-agreement-item task">
            <div class="pdf-item-title">#${idx + 1} ${t.title}</div>
            <div class="pdf-item-meta">
              <span><strong>Asignado a:</strong> ${t.speaker || 'Pendiente'}</span>
              <span><strong>Prioridad:</strong> ${t.priority || 'Media'}</span>
              <span><strong>Estado:</strong> ${t.status || 'Pendiente'}</span>
            </div>
          </div>
        `).join('') : '<p style="font-size: 8.5pt; color: #64748b; font-style: italic; margin: 4px 0;">Sin tareas pendientes registradas.</p>'}
      </div>

      <div class="pdf-section-title" style="margin-top: 18px;">
        <i class="fa-solid fa-comments"></i> Transcripción Oficial de la Sesión
      </div>
      <div class="pdf-transcript-wrap">
        ${(meeting.transcript || []).length > 0 ? (meeting.transcript || []).map(t => `
          <div class="pdf-transcript-line">
            <span class="time">[${t.timestamp || '00:00'}]</span>
            <span class="speaker">${t.speaker}:</span>
            <span class="text">${t.text}</span>
          </div>
        `).join('') : '<p style="font-size: 8.5pt; color: #64748b; font-style: italic; margin: 4px 0;">Sin intervenciones de audio registradas.</p>'}
      </div>

      <div class="pdf-footer">
        <span>Reu.live — Asistente de Reuniones • Powered by MYOOZlabs</span>
        <span>Documento oficial y confidencial • Generado el ${new Date().toLocaleString()}</span>
      </div>
    `;

    document.body.appendChild(container);

    if (window.html2pdf) {
      const filename = `Reu.live-Acta-Admin-${meeting.id || Date.now()}.pdf`;
      const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      window.html2pdf().set(opt).from(container).save().then(() => {
        if (container.parentNode) document.body.removeChild(container);
      }).catch(err => {
        console.warn('html2pdf generation error, using window.print:', err);
        window.print();
        setTimeout(() => {
          if (container.parentNode) document.body.removeChild(container);
        }, 1000);
      });
    } else {
      window.print();
      setTimeout(() => {
        if (container.parentNode) document.body.removeChild(container);
      }, 1000);
    }
  };

  // Download PDF report button
  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener('click', () => {
      if (currentViewingMeeting) {
        generateExecutivePDF(currentViewingMeeting);
      }
    });
  }

  // Download markdown report
  if (btnDownloadMarkdown) {
    btnDownloadMarkdown.addEventListener('click', () => {
      if (!currentViewingMeeting) return;
      const m = currentViewingMeeting;

      let md = `# Informe de Reunión Reu.live\n\n`;
      md += `**Fecha:** ${m.dateFormatted || m.timestamp}\n`;
      md += `**Tema:** ${m.topic}\n`;
      md += `**Duración:** ${m.durationFormatted}\n`;
      md += `**Sentimiento:** ${m.sentiment}\n`;
      if (m.tone) md += `**Tono:** ${m.tone}\n`;
      if (m.intensity) md += `**Intensidad:** ${m.intensity}\n`;
      md += `\n---\n\n## 🤝 Acuerdos\n`;
      (m.agreements || []).forEach(a => md += `- ${a}\n`);
      md += `\n## 📋 Tareas Pendientes\n`;
      (m.actionItems || []).forEach(t => md += `- ${t}\n`);
      md += `\n---\n\n## 💬 Transcripción Completa\n\n`;
      (m.transcript || []).forEach(t => {
        md += `* **[${t.timestamp}] ${t.speaker}:** ${t.text}\n`;
      });

      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ReuLive-Reunion-${m.id}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ==========================================
  // 9. TABS & SEARCH FILTERS
  // ==========================================
  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navTabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add('active');

      // If switching to charts tab, trigger resize on all charts
      if (targetTab === 'tabCharts') {
        Object.values(chartInstances).forEach(chart => {
          if (chart && typeof chart.resize === 'function') chart.resize();
        });
      }
    });
  });

  if (telemetrySearch) {
    telemetrySearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = telemetryData.filter(s =>
        (s.country && s.country.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.url && s.url.toLowerCase().includes(q)) ||
        (s.device && s.device.toLowerCase().includes(q)) ||
        (s.browser && s.browser.toLowerCase().includes(q))
      );
      renderTelemetryTable(filtered);
    });
  }

  if (meetingsSearch) {
    meetingsSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = meetingsData.filter(m =>
        (m.topic && m.topic.toLowerCase().includes(q)) ||
        (m.sentiment && m.sentiment.toLowerCase().includes(q)) ||
        (m.dateFormatted && m.dateFormatted.toLowerCase().includes(q)) ||
        (m.transcript && m.transcript.some(t => t.text.toLowerCase().includes(q)))
      );
      renderMeetingsTable(filtered);
    });
  }

  if (btnRefreshTelemetry) btnRefreshTelemetry.addEventListener('click', loadAllData);
  if (btnRefreshMeetings) btnRefreshMeetings.addEventListener('click', loadAllData);

  // Manual Local Sync Button
  const triggerManualSync = async () => {
    const btn = btnSyncLocalMeetings || btnSyncMeetingsTab;
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
      btn.disabled = true;

      try {
        if (clientDB) {
          const local = await clientDB.getMeetings();
          if (local.length > 0) {
            await fetch('/api/admin?action=sync_meetings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`
              },
              body: JSON.stringify({ meetings: local })
            });
          }
        }
        await loadAllData();
        btn.innerHTML = '<i class="fa-solid fa-check text-emerald"></i> ¡Sincronizado!';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.disabled = false;
        }, 1500);
      } catch (e) {
        alert('Error sincronizando reuniones locales');
        btn.innerHTML = orig;
        btn.disabled = false;
      }
    }
  };

  if (btnSyncLocalMeetings) btnSyncLocalMeetings.addEventListener('click', triggerManualSync);
  if (btnSyncMeetingsTab) btnSyncMeetingsTab.addEventListener('click', triggerManualSync);

  // Purge test / bot visits
  const triggerClearTelemetry = async () => {
    if (!confirm('¿Deseas filtrar las visitas de prueba y bots automatizados para ver únicamente usuarios y estadísticas reales?')) {
      return;
    }

    try {
      const res = await fetch('/api/admin?action=clear_telemetry&onlyBots=true', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        await loadAllData();
      }
    } catch (e) {
      alert('Error purgando visitas de prueba');
    }
  };

  if (btnClearTelemetry) btnClearTelemetry.addEventListener('click', triggerClearTelemetry);
  if (btnClearTelemetryTab) btnClearTelemetryTab.addEventListener('click', triggerClearTelemetry);

  // ==========================================
  // 10. DATABASE BACKUP EXPORT
  // ==========================================
  const triggerDatabaseBackup = async () => {
    if (!adminToken) return;

    try {
      const res = await fetch('/api/admin?action=export_backup', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (!res.ok) {
        alert('Error al descargar el respaldo');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reulive_database_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error descargando respaldo de base de datos');
    }
  };

  if (btnExportDb) btnExportDb.addEventListener('click', triggerDatabaseBackup);
  if (btnDownloadBackupJson) btnDownloadBackupJson.addEventListener('click', triggerDatabaseBackup);

  // ==========================================
  // 11. HELPERS
  // ==========================================
  function formatSeconds(secs) {
    if (!secs || secs <= 0) return '0s';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return 'Reciente';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Hace un momento';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    return `Hace ${Math.floor(diff / 86400)} d`;
  }

  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode === 'XX' || countryCode.length !== 2) return '🌐';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromPoint ? String.fromPoint(...codePoints) : (String.fromCodePoint ? String.fromCodePoint(...codePoints) : '🌐');
  }

  // Initial check
  checkStoredAuth();
});
