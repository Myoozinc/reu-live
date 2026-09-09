/**
 * ReuLive - Admin Dashboard Controller
 * Handles authentication (admin.one / Rona12345), telemetry metrics,
 * transcript review, and full database backups.
 */

document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'reulive_admin_token';
  let adminToken = sessionStorage.getItem(TOKEN_KEY);
  let telemetryData = [];
  let meetingsData = [];
  let currentViewingMeeting = null;

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
  const dbStatusBadge = document.getElementById('dbStatusBadge');

  // DOM Elements - KPIs
  const kpiTotalVisits = document.getElementById('kpiTotalVisits');
  const kpiActiveNow = document.getElementById('kpiActiveNow');
  const kpiTotalMeetings = document.getElementById('kpiTotalMeetings');
  const kpiAvgDuration = document.getElementById('kpiAvgDuration');
  const kpiTotalCountries = document.getElementById('kpiTotalCountries');

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
      btnLoginSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';

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
  // 3. DATA FETCHING
  // ==========================================
  async function loadAllData() {
    if (!adminToken) return;

    try {
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
      telemetryData = data.telemetry || [];
      meetingsData = data.meetings || [];

      // Update KPIs
      updateKPIs(data.stats);

      // Render Tables
      renderTelemetryTable(telemetryData);
      renderMeetingsTable(meetingsData);
      renderMetrics(data.stats);

      if (dbEngineType && data.stats) {
        dbEngineType.textContent = data.stats.storageType || 'Local JSON + Cliente';
      }
    } catch (err) {
      console.warn('Error loading admin dashboard data:', err);
    }
  }

  function updateKPIs(stats) {
    if (!stats) return;
    if (kpiTotalVisits) kpiTotalVisits.textContent = stats.totalVisits || telemetryData.length;
    if (kpiActiveNow) kpiActiveNow.textContent = `${stats.activeNow || 0} en línea ahora`;
    if (kpiTotalMeetings) kpiTotalMeetings.textContent = stats.totalMeetings || meetingsData.length;
    if (kpiAvgDuration) kpiAvgDuration.textContent = stats.avgDurationFormatted || '0s';
    if (kpiTotalCountries) {
      const count = Object.keys(stats.countryCounts || {}).length;
      kpiTotalCountries.textContent = count;
    }
  }

  // ==========================================
  // 4. RENDER TELEMETRY TABLE
  // ==========================================
  function renderTelemetryTable(sessions) {
    if (!telemetryTableBody) return;

    if (!sessions || sessions.length === 0) {
      telemetryTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            <i class="fa-solid fa-inbox"></i> No hay registros de visitas aún.
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
                <span class="text-dim text-xs">${s.city !== 'Desconocida' ? s.city : ''}</span>
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
  // 5. RENDER MEETINGS TABLE
  // ==========================================
  function renderMeetingsTable(meetings) {
    if (!meetingsTableBody) return;

    if (!meetings || meetings.length === 0) {
      meetingsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            <i class="fa-solid fa-microphone-slash"></i> Aún no se han guardado reuniones grabadas.
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
        <tr>
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
            <button class="btn btn-primary btn-xs btn-view-transcript" data-id="${m.id}">
              <i class="fa-regular fa-eye"></i> Ver Detalle
            </button>
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
  }

  // ==========================================
  // 6. RENDER METRICS & COUNTRIES
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
  // 7. TRANSCRIPT MODAL VIEWER
  // ==========================================
  // ==========================================
  // 7. TRANSCRIPT MODAL VIEWER & EXECUTIVE PDF
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
        .map(t => `[${t.timestamp || ''}] ${t.speaker}: ${t.text}`)
        .join('\n');

      navigator.clipboard.writeText(text).then(() => {
        btnCopyTranscript.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
        setTimeout(() => {
          btnCopyTranscript.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar Texto';
        }, 2000);
      });
    });
  }

  // Executive PDF Generator
  const generateExecutivePDF = (meeting) => {
    if (!meeting) return;

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
        <div class="pdf-brand">
          <h2>ReuLive <span style="color: #0284c7;">AI</span></h2>
          <p>Acta & Informe Ejecutivo de Reunión (Copia Administrativa)</p>
        </div>
        <div class="pdf-meta-box">
          <div><strong>ID Sesión:</strong> ${meeting.id || 'N/A'}</div>
          <div><strong>Fecha:</strong> ${meeting.dateFormatted || new Date(meeting.timestamp || Date.now()).toLocaleDateString()}</div>
          <div><strong>Duración:</strong> ${meeting.durationFormatted || '00:00'}</div>
        </div>
      </div>

      <div class="pdf-title-banner">
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
        <span>ReuLive AI Copilot — Documento oficial y confidencial de reunión</span>
        <span>Generado el ${new Date().toLocaleString()}</span>
      </div>
    `;

    document.body.appendChild(container);

    if (window.html2pdf) {
      const filename = `ReuLive-Acta-Admin-${meeting.id || Date.now()}.pdf`;
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

      let md = `# Informe de Reunión ReuLive AI\n\n`;
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
  // 8. TABS & SEARCH FILTERS
  // ==========================================
  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navTabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  if (telemetrySearch) {
    telemetrySearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = telemetryData.filter(s =>
        (s.country && s.country.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.url && s.url.toLowerCase().includes(q)) ||
        (s.device && s.device.toLowerCase().includes(q))
      );
      renderTelemetryTable(filtered);
    });
  }

  if (meetingsSearch) {
    meetingsSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = meetingsData.filter(m =>
        (m.topic && m.topic.toLowerCase().includes(q)) ||
        (m.transcript && m.transcript.some(t => t.text.toLowerCase().includes(q)))
      );
      renderMeetingsTable(filtered);
    });
  }

  if (btnRefreshTelemetry) btnRefreshTelemetry.addEventListener('click', loadAllData);
  if (btnRefreshMeetings) btnRefreshMeetings.addEventListener('click', loadAllData);

  // ==========================================
  // 9. DATABASE BACKUP EXPORT
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
  // 10. HELPERS
  // ==========================================
  function formatSeconds(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return `${m}m ${s}s`;
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
    return String.fromCodePoint(...codePoints);
  }

  // Initial check
  checkStoredAuth();
});
