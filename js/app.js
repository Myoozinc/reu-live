/**
 * ReuLive - Main Application Controller
 * Live Copilot HUD, Speaker Switcher, Real-Time Proposals/Responses, and Audio Capture.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Core Engines
  const mediaEngine = new MediaEngine();
  const sttEngine = new STTEngine();
  const aiEngine = new AIEngine();
  const dbEngine = new DBEngine();

  // State
  let isActive = false;
  let timerInterval = null;
  let timerSeconds = 0;
  let isVoiceChatting = false;
  let voiceChatRecognition = null;
  let copilotUpdateDebounce = null;

  // ===== DOM Elements =====
  // Header
  const liveStatusBadge = document.getElementById('liveStatusBadge');
  const statusText = document.getElementById('statusText');
  const currentTopicText = document.getElementById('currentTopicText');
  const timerText = document.getElementById('timerText');
  const btnCapture = document.getElementById('btnCapture');
  const btnCaptureText = document.getElementById('btnCaptureText');
  const btnExportReport = document.getElementById('btnExportReport');
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const btnOpenHistory = document.getElementById('btnOpenHistory');

  // Zen Lobby & Workspace Containers
  const zenLobby = document.getElementById('zenLobby');
  const workspaceSection = document.getElementById('workspaceSection');
  const btnLobbyStart = document.getElementById('btnLobbyStart');
  const btnLobbyOpenHistory = document.getElementById('btnLobbyOpenHistory');

  // User History Modal
  const userHistoryModal = document.getElementById('userHistoryModal');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
  const userHistoryList = document.getElementById('userHistoryList');

  // Capture Section
  const captureVideo = document.getElementById('captureVideo');
  const capturePlaceholder = document.getElementById('capturePlaceholder');
  const btnPlaceholderStart = document.getElementById('btnPlaceholderStart');
  const sourceLabel = document.getElementById('sourceLabel');
  const audioCanvas = document.getElementById('audioVisualizerCanvas');
  const micVolumeLevel = document.getElementById('micVolumeLevel');
  const sentimentText = document.getElementById('sentimentText');
  const systemAudioMeter = document.getElementById('systemAudioMeter');
  const userMicMeter = document.getElementById('userMicMeter');
  const subtitlesText = document.getElementById('subtitlesText');
  const subtitlesOverlay = document.getElementById('subtitlesOverlay');

  // Media Controls (Mute & Camera Flip buttons)
  const btnMuteMic = document.getElementById('btnMuteMic');
  const btnMuteVideo = document.getElementById('btnMuteVideo');
  const btnFlipCamera = document.getElementById('btnFlipCamera');

  // Intensity Pill
  const intensityPill = document.getElementById('intensityPill');
  const intensityText = document.getElementById('intensityText');
  const intensityIcon = document.getElementById('intensityIcon');

  // Speaker Switcher
  const btnSpeakerUser = document.getElementById('btnSpeakerUser');
  const btnSpeakerInterlocutor = document.getElementById('btnSpeakerInterlocutor');

  // Live Copilot HUD
  const copilotSubtitle = document.getElementById('copilotSubtitle');
  const copilotLiveSummary = document.getElementById('copilotLiveSummary');
  const liveDirectText = document.getElementById('liveDirectText');
  const liveProposalText = document.getElementById('liveProposalText');
  const liveQuestionText = document.getElementById('liveQuestionText');
  const btnRefreshCopilot = document.getElementById('btnRefreshCopilot');
  const customReplyCard = document.getElementById('customReplyCard');
  const customReplyText = document.getElementById('customReplyText');

  // Quick Query / Voice Input
  const aiChatInput = document.getElementById('aiChatInput');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnVoiceChat = document.getElementById('btnVoiceChat');

  // Transcript
  const transcriptStream = document.getElementById('transcriptStream');
  const transcriptCount = document.getElementById('transcriptCount');
  const btnClearTranscript = document.getElementById('btnClearTranscript');
  const speakerNameInput = document.getElementById('speakerNameInput');

  // Analytics & Deep Accordions
  const analyticsCurrentTopic = document.getElementById('analyticsCurrentTopic');
  const labelUserRatio = document.getElementById('labelUserRatio');
  const labelInterlocutorRatio = document.getElementById('labelInterlocutorRatio');
  const ratioFillUser = document.getElementById('ratioFillUser');
  const ratioFillInterlocutor = document.getElementById('ratioFillInterlocutor');
  const kpiWpm = document.getElementById('kpiWpm');
  const kpiTechnicalDepth = document.getElementById('kpiTechnicalDepth');
  const kpiBalance = document.getElementById('kpiBalance');
  const agreementsContainer = document.getElementById('agreementsContainer');
  const actionItemsContainer = document.getElementById('actionItemsContainer');

  // ===== Theme Management (Light / Dark Mode) =====
  const initTheme = () => {
    const savedTheme = localStorage.getItem('reulive-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(initialTheme);
  };

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('reulive-theme', theme);
    if (btnThemeToggle) {
      const icon = btnThemeToggle.querySelector('i');
      if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      }
    }
  };

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    });
  }

  initTheme();

  // ===== Initialize =====
  mediaEngine.initCanvas(audioCanvas);

  // Real-time audio chunk handler (Whisper STT via /api/transcribe)
  mediaEngine.onAudioChunk = (chunkData) => {
    sttEngine.handleAudioChunk(chunkData);
  };

  // Volume meter callback
  mediaEngine.onVolumeChange = (vol) => {
    if (micVolumeLevel) micVolumeLevel.textContent = `${vol}%`;
    if (userMicMeter) userMicMeter.style.width = `${Math.min(vol * 1.5, 100)}%`;
    if (systemAudioMeter) {
      systemAudioMeter.style.width = vol > 5 ? `${Math.min(vol * 1.2 + 10, 100)}%` : '0%';
    }
  };

  // Speaker name input
  if (speakerNameInput) {
    speakerNameInput.addEventListener('input', (e) => {
      sttEngine.setSpeakerName(e.target.value.trim());
    });
  }

  // ===== Speaker Switcher Logic =====
  const setSpeakerUI = (type) => {
    sttEngine.setActiveSpeaker(type);
    if (btnSpeakerUser) btnSpeakerUser.classList.toggle('active', type === 'user');
    if (btnSpeakerInterlocutor) btnSpeakerInterlocutor.classList.toggle('active', type === 'interlocutor');
  };

  if (btnSpeakerUser) {
    btnSpeakerUser.addEventListener('click', () => setSpeakerUI('user'));
  }
  if (btnSpeakerInterlocutor) {
    btnSpeakerInterlocutor.addEventListener('click', () => setSpeakerUI('interlocutor'));
  }

  // ===== Live Copilot HUD Updater =====
  const updateLiveCopilotHUD = async () => {
    if (!copilotLiveSummary) return;

    if (copilotSubtitle) {
      copilotSubtitle.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-cyan"></i> Actualizando sugerencias con IA...';
    }

    try {
      const copilotData = await aiEngine.fetchLiveCopilot(sttEngine.transcriptHistory);
      if (copilotData) {
        if (copilotLiveSummary) copilotLiveSummary.textContent = copilotData.summary;
        if (liveDirectText) liveDirectText.textContent = `"${copilotData.direct_response.replace(/^"|"$/g, '')}"`;
        if (liveProposalText) liveProposalText.textContent = `"${copilotData.proposal.replace(/^"|"$/g, '')}"`;
        if (liveQuestionText) liveQuestionText.textContent = `"${copilotData.question.replace(/^"|"$/g, '')}"`;
        if (currentTopicText && copilotData.topic) currentTopicText.textContent = copilotData.topic;
        if (analyticsCurrentTopic && copilotData.topic) analyticsCurrentTopic.textContent = copilotData.topic;
      }
    } catch (e) {
      console.warn('Error updating live copilot HUD:', e);
    } finally {
      if (copilotSubtitle) {
        copilotSubtitle.textContent = 'Conectado a toda la transcripción en vivo';
      }
    }
  };

  if (btnRefreshCopilot) {
    btnRefreshCopilot.addEventListener('click', () => {
      updateLiveCopilotHUD();
    });
  }

  // ===== STT Callbacks =====
  sttEngine.onInterimResult = (text) => {
    if (subtitlesText) {
      subtitlesText.textContent = text;
      subtitlesOverlay.classList.toggle('visible', text.length > 0);
    }
  };

  sttEngine.onFinalResult = (chunk) => {
    // Add to transcript
    appendTranscriptItem(chunk);

    // Brief subtitle display
    if (subtitlesText) {
      subtitlesText.textContent = chunk.text;
      subtitlesOverlay.classList.add('visible');
      setTimeout(() => {
        if (subtitlesText.textContent === chunk.text) {
          subtitlesOverlay.classList.remove('visible');
        }
      }, 3000);
    }

    // Process metadata
    const aiMeta = aiEngine.processTranscript(sttEngine.transcriptHistory);
    if (aiMeta) {
      updateMetaUI(aiMeta);
    }

    // Debounce Live Copilot HUD update so it doesn't flood API on every single phrase
    if (copilotUpdateDebounce) clearTimeout(copilotUpdateDebounce);
    copilotUpdateDebounce = setTimeout(() => {
      updateLiveCopilotHUD();
    }, 4000);
  };

  sttEngine.onStatusChange = (status) => {
    if (status === 'listening') {
      updateStatus(true, 'TRANSCRIBIENDO EN VIVO');
    }
  };

  // Smart Name & Nickname Diarization Callback
  sttEngine.onSpeakerNameUpdated = (role, newName, nickname, history) => {
    if (role === 'interlocutor') {
      if (speakerNameInput) speakerNameInput.value = newName;
      if (btnSpeakerInterlocutor) {
        btnSpeakerInterlocutor.innerHTML = `<i class="fa-solid fa-users text-purple"></i> ${newName.split(' ')[0]}`;
      }
    } else if (role === 'user') {
      if (btnSpeakerUser) {
        btnSpeakerUser.innerHTML = `<i class="fa-solid fa-user text-cyan"></i> ${newName.split(' ')[0]}`;
      }
    }

    // Refresh rendered transcript stream speaker tags retroactively
    const streamItems = transcriptStream.querySelectorAll('.stream-item:not(.system-msg)');
    if (streamItems.length > 0 && history && history.length > 0) {
      streamItems.forEach((item, idx) => {
        const chunk = history[idx];
        if (chunk) {
          const speakerSpan = item.querySelector('.speaker span');
          if (speakerSpan) {
            const icon = chunk.speakerType === 'user' ? 'fa-solid fa-user' : 'fa-solid fa-desktop';
            speakerSpan.innerHTML = `<i class="${icon}"></i> ${chunk.speaker}`;
          }
        }
      });
    }

    updateLiveCopilotHUD();
  };

  // Camera Flip Button Handler
  if (btnFlipCamera) {
    btnFlipCamera.addEventListener('click', async () => {
      if (!isActive) return;
      btnFlipCamera.disabled = true;
      btnFlipCamera.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span class="control-label">...</span>';

      try {
        const res = await mediaEngine.flipCamera();
        if (res && res.stream) {
          captureVideo.srcObject = res.stream;
        }
      } catch (err) {
        console.warn('Camera flip error:', err);
      } finally {
        btnFlipCamera.disabled = false;
        btnFlipCamera.innerHTML = '<i class="fa-solid fa-camera-rotate"></i><span class="control-label">Voltear</span>';
      }
    });
  }

  // ===== Copy Button Handlers =====
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.card-copy-btn');
    if (copyBtn) {
      const targetId = copyBtn.getAttribute('data-target');
      const targetElem = document.getElementById(targetId);
      if (targetElem) {
        const textToCopy = targetElem.textContent.replace(/^"|"$/g, '').trim();
        navigator.clipboard.writeText(textToCopy).catch(() => {});
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
        }, 2000);
      }
    }
  });

  // ===== MIC MUTE / VIDEO MUTE =====
  let isMicMuted = false;
  let isVideoMuted = false;

  btnMuteMic.addEventListener('click', () => {
    if (!isActive) return;

    isMicMuted = !isMicMuted;

    if (isMicMuted) {
      mediaEngine.muteMic();
      btnMuteMic.classList.add('muted');
      btnMuteMic.querySelector('i').className = 'fa-solid fa-microphone-slash';
      btnMuteMic.querySelector('.control-label').textContent = 'Mic Off';

      if (mediaEngine.isMobile()) {
        sttEngine.stopListening();
      }
    } else {
      mediaEngine.unmuteMic();
      btnMuteMic.classList.remove('muted');
      btnMuteMic.querySelector('i').className = 'fa-solid fa-microphone';
      btnMuteMic.querySelector('.control-label').textContent = 'Mic';

      if (mediaEngine.isMobile()) {
        sttEngine.startListening();
      }
    }
  });

  btnMuteVideo.addEventListener('click', () => {
    if (!isActive) return;

    isVideoMuted = !isVideoMuted;

    if (isVideoMuted) {
      mediaEngine.muteVideo();
      btnMuteVideo.classList.add('muted');
      btnMuteVideo.querySelector('i').className = 'fa-solid fa-video-slash';
      btnMuteVideo.querySelector('.control-label').textContent = 'Video Off';
    } else {
      mediaEngine.unmuteVideo();
      btnMuteVideo.classList.remove('muted');
      btnMuteVideo.querySelector('i').className = 'fa-solid fa-video';
      btnMuteVideo.querySelector('.control-label').textContent = 'Video';
    }
  });

  // ===== SINGLE CAPTURE BUTTON =====
  const startCapture = async () => {
    if (isActive) {
      await stopCapture();
      return;
    }

    try {
      btnCapture.disabled = true;
      btnCaptureText.textContent = 'Conectando...';
      updateStatus(true, 'CONECTANDO...');

      // 1. Full session isolation: wipe previous transcripts and AI memory completely!
      sttEngine.reset();
      aiEngine.reset();

      if (transcriptStream) {
        transcriptStream.innerHTML = `
          <div class="stream-item system-msg">
            <span class="time">00:00</span>
            <span class="text"><i class="fa-solid fa-circle-dot text-cyan"></i> Nueva reunión iniciada. Transcribiendo en tiempo real...</span>
          </div>
        `;
      }
      if (transcriptCount) transcriptCount.textContent = '0';
      if (subtitlesText) subtitlesText.textContent = '';
      if (subtitlesOverlay) subtitlesOverlay.classList.remove('visible');
      if (customReplyCard) customReplyCard.style.display = 'none';
      if (customReplyText) customReplyText.textContent = '';
      if (speakerNameInput) speakerNameInput.value = 'Interlocutor';
      if (btnSpeakerInterlocutor) {
        btnSpeakerInterlocutor.innerHTML = '<i class="fa-solid fa-users text-purple"></i> Interlocutor';
      }
      if (agreementsContainer) {
        agreementsContainer.innerHTML = '<p class="text-dim text-xs">Esperando acuerdos en la reunión...</p>';
      }
      if (actionItemsContainer) {
        actionItemsContainer.innerHTML = '<p class="text-dim text-xs">Esperando tareas o compromisos...</p>';
      }
      if (labelUserRatio) labelUserRatio.innerHTML = '<i class="fa-solid fa-user text-cyan"></i> Tú: 50%';
      if (labelInterlocutorRatio) labelInterlocutorRatio.innerHTML = '<i class="fa-solid fa-users text-purple"></i> Interlocutor: 50%';
      if (ratioFillUser) ratioFillUser.style.width = '50%';
      if (ratioFillInterlocutor) ratioFillInterlocutor.style.width = '50%';
      if (kpiWpm) kpiWpm.textContent = '0 WPM';
      if (kpiTechnicalDepth) kpiTechnicalDepth.textContent = 'General';
      if (kpiBalance) kpiBalance.textContent = 'Inicio';
      if (intensityText) intensityText.textContent = 'Distendida';
      if (intensityPill) intensityPill.className = 'intensity-pill intensity-low';

      const result = await mediaEngine.startUnifiedCapture();

      // Switch view: hide Zen Lobby, show Active Workspace
      if (zenLobby) zenLobby.classList.add('is-hidden');
      if (workspaceSection) workspaceSection.classList.remove('is-hidden');

      // Show video or serene audio state
      if (result.hasVideo) {
        const videoStream = mediaEngine.getVideoStream();
        if (videoStream) {
          captureVideo.srcObject = videoStream;
          captureVideo.classList.add('active');
        }
        if (capturePlaceholder) capturePlaceholder.style.display = 'none';
      } else {
        if (capturePlaceholder) {
          capturePlaceholder.style.display = 'flex';
          capturePlaceholder.innerHTML = `
            <div class="placeholder-icon" style="animation: zenBreathe 3s infinite ease-in-out;">
              <i class="fa-solid fa-microphone-lines text-sage"></i>
            </div>
            <h3>Audio en Vivo Activo</h3>
            <p>Transcribiendo y analizando la reunión en segundo plano.</p>
          `;
        }
      }

      sourceLabel.textContent = `Fuente: ${result.sourceLabel || 'Micrófono'}`;

      // Start recording
      mediaEngine.startRecording();

      // Start STT
      sttEngine.startListening();

      // Start timer
      startTimer();

      // Enable media buttons
      btnMuteMic.disabled = false;
      btnMuteVideo.disabled = false;
      if (btnFlipCamera) btnFlipCamera.disabled = false;

      // Update UI
      isActive = true;
      isMicMuted = false;
      isVideoMuted = false;
      btnCapture.disabled = false;
      btnCapture.classList.remove('btn-primary');
      btnCapture.classList.add('btn-danger');
      btnCaptureText.textContent = 'Detener y Guardar';
      btnCapture.querySelector('i').className = 'fa-solid fa-square';
      btnExportReport.disabled = false;

      updateStatus(true, 'GRABANDO EN VIVO');

      // Initial Live Copilot fetch
      updateLiveCopilotHUD();

      // Listen for screen share ending
      if (mediaEngine.displayStream) {
        mediaEngine.displayStream.getVideoTracks().forEach(track => {
          track.onended = () => stopCapture();
        });
      }

    } catch (err) {
      console.error('Capture error:', err);
      if (workspaceSection) workspaceSection.classList.add('is-hidden');
      if (zenLobby) zenLobby.classList.remove('is-hidden');
      btnCapture.disabled = false;
      btnCaptureText.textContent = 'Iniciar Captura';
      updateStatus(false, 'Error');
      alert('Error al iniciar captura: ' + err.message);
    }
  };

  const stopCapture = async () => {
    btnCapture.disabled = true;
    btnCaptureText.textContent = 'Guardando...';
    updateStatus(true, 'GUARDANDO ARCHIVOS...');

    sttEngine.stopListening();
    await mediaEngine.stopAndExport();
    mediaEngine.stopAll();
    stopTimer();

    captureVideo.srcObject = null;
    captureVideo.classList.remove('active');

    // Switch view: hide Active Workspace, return smoothly to Zen Lobby
    if (workspaceSection) workspaceSection.classList.add('is-hidden');
    if (zenLobby) zenLobby.classList.remove('is-hidden');

    if (capturePlaceholder) {
      capturePlaceholder.style.display = '';
      capturePlaceholder.innerHTML = `
        <div class="placeholder-icon">
          <i class="fa-solid fa-headset"></i>
        </div>
        <h3>Captura tu Reunión</h3>
        <p>Presiona <strong>"Iniciar Captura"</strong> para grabar pantalla, audio, y transcribir automáticamente.</p>
        <button class="btn btn-primary glow-btn" id="btnPlaceholderStart">
          <i class="fa-solid fa-circle-dot"></i> Iniciar Captura Ahora
        </button>
      `;
      const pStart = document.getElementById('btnPlaceholderStart');
      if (pStart) pStart.addEventListener('click', startCapture);
    }

    // Reset mute & camera states
    btnMuteMic.disabled = true;
    btnMuteVideo.disabled = true;
    if (btnFlipCamera) btnFlipCamera.disabled = true;
    btnMuteMic.classList.remove('muted');
    btnMuteVideo.classList.remove('muted');
    btnMuteMic.querySelector('i').className = 'fa-solid fa-microphone';
    btnMuteVideo.querySelector('i').className = 'fa-solid fa-video';
    btnMuteMic.querySelector('.control-label').textContent = 'Mic';
    btnMuteVideo.querySelector('.control-label').textContent = 'Video';

    isActive = false;
    isMicMuted = false;
    isVideoMuted = false;
    btnCapture.disabled = false;
    btnCapture.classList.remove('btn-danger');
    btnCapture.classList.add('btn-primary');
    btnCaptureText.textContent = 'Iniciar Captura';
    btnCapture.querySelector('i').className = 'fa-solid fa-circle-dot';
    sourceLabel.textContent = 'Fuente: Sin Conectar';

    // Save meeting to Database (IndexedDB + Server API) with clean state
    if (sttEngine.transcriptHistory.length > 0 || timerSeconds >= 5) {
      const calculatedMetrics = aiEngine.detailedMetrics || aiEngine.calculateDetailedMetrics(sttEngine.transcriptHistory);
      const meetingData = {
        id: `meet_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date().toISOString(),
        dateFormatted: new Date().toLocaleString(),
        durationSeconds: timerSeconds,
        durationFormatted: timerText ? timerText.textContent : '00:00',
        topic: aiEngine.currentTopic || 'Coordinación General',
        sentiment: aiEngine.sentiment || 'Neutral',
        intensity: aiEngine.meetingIntensity || 'Media / Productiva',
        tone: aiEngine.meetingTone || 'Coordinación General',
        interventionsCount: sttEngine.transcriptHistory.length,
        metrics: calculatedMetrics,
        transcript: [...sttEngine.transcriptHistory],
        agreements: [...aiEngine.agreements],
        detailedAgreements: [...aiEngine.detailedAgreements],
        actionItems: [...aiEngine.actionItems],
        detailedActionItems: [...aiEngine.detailedActionItems],
        hasVideo: !isVideoMuted
      };
      dbEngine.saveMeeting(meetingData).catch(e => console.warn('Could not save meeting:', e));
    }

    // Clean memory after saving so subsequent meetings start completely clean
    sttEngine.reset();
    aiEngine.reset();

    subtitlesOverlay.classList.remove('visible');
    subtitlesText.textContent = '';

    updateStatus(false, 'Listo');
  };

  btnCapture.addEventListener('click', startCapture);
  if (btnPlaceholderStart) btnPlaceholderStart.addEventListener('click', startCapture);
  if (btnLobbyStart) btnLobbyStart.addEventListener('click', startCapture);

  // ===== USER CALL HISTORY MODAL =====
  const openHistoryModal = async () => {
    if (!userHistoryModal) return;
    userHistoryModal.classList.remove('is-hidden');
    renderUserHistory();
  };

  const closeHistoryModal = () => {
    if (userHistoryModal) userHistoryModal.classList.add('is-hidden');
  };

  if (btnOpenHistory) btnOpenHistory.addEventListener('click', openHistoryModal);
  if (btnLobbyOpenHistory) btnLobbyOpenHistory.addEventListener('click', openHistoryModal);
  if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', closeHistoryModal);

  if (userHistoryModal) {
    userHistoryModal.addEventListener('click', (e) => {
      if (e.target === userHistoryModal) closeHistoryModal();
    });
  }

  // ===== EXECUTIVE PDF REPORT GENERATOR =====
  const generateExecutivePDF = (meeting) => {
    if (!meeting) return;

    // Build formal printable executive document container
    const container = document.createElement('div');
    container.className = 'executive-pdf-container';
    container.id = 'executivePdfExportDoc';

    const speakersList = meeting.metrics && meeting.metrics.speakers
      ? Object.keys(meeting.metrics.speakers).join(', ')
      : (meeting.transcript && meeting.transcript.length > 0
          ? [...new Set(meeting.transcript.map(t => t.speaker))].join(', ')
          : 'Tú, Interlocutor');

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
          <p>Acta & Informe Ejecutivo de Reunión</p>
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
      const filename = `ReuLive-Acta-${meeting.id || Date.now()}.pdf`;
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

  const renderUserHistory = async () => {
    if (!userHistoryList) return;
    userHistoryList.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="fa-solid fa-spinner fa-spin"></i> Cargando historial...
      </div>
    `;

    const meetings = await dbEngine.getMeetings();
    if (!meetings || meetings.length === 0) {
      userHistoryList.innerHTML = `
        <div class="empty-history-box">
          <div class="empty-icon"><i class="fa-solid fa-microphone-slash"></i></div>
          <h4>No hay reuniones registradas aún</h4>
          <p>Cuando finalices una reunión ("Detener y Guardar"), tu grabación y transcripción se archivarán aquí automáticamente.</p>
        </div>
      `;
      return;
    }

    userHistoryList.innerHTML = meetings.map(m => `
      <div class="user-history-card glass-panel" data-id="${m.id}">
        <div class="card-top-row">
          <div class="topic-group">
            <span class="history-topic-tag"><i class="fa-solid fa-compass-drafting text-sky"></i> ${m.topic || 'General'}</span>
            <span class="history-date">${m.dateFormatted || new Date(m.timestamp).toLocaleDateString()}</span>
          </div>
          <span class="history-duration-pill"><i class="fa-regular fa-clock"></i> ${m.durationFormatted || '00:00'}</span>
        </div>

        <div class="card-meta-row">
          <span><i class="fa-solid fa-comments text-dim"></i> ${m.interventionsCount || (m.transcript ? m.transcript.length : 0)} turnos</span>
          <span><i class="fa-solid fa-scale-balanced text-cyan"></i> ${m.metrics ? `Tú ${m.metrics.userRatio}% / Otros ${m.metrics.interlocutorRatio}%` : 'Intervenciones'}</span>
          <span><i class="fa-solid fa-gauge-high text-sky"></i> ${m.intensity || 'Productiva'}</span>
          <span><i class="fa-solid fa-handshake text-emerald"></i> ${(m.agreements && m.agreements.length) || 0} acuerdos</span>
        </div>

        <div class="card-actions-row">
          <button class="btn btn-outline btn-xs btn-history-details" data-id="${m.id}">
            <i class="fa-solid fa-align-left"></i> Transcripción
          </button>
          <button class="btn btn-primary btn-xs btn-history-download" data-id="${m.id}">
            <i class="fa-solid fa-file-pdf"></i> Descargar PDF Ejecutivo
          </button>
          <button class="btn btn-outline btn-xs text-danger btn-history-delete" data-id="${m.id}" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <div class="history-transcript-drawer is-hidden" id="drawer-${m.id}">
          <div class="drawer-inner">
            <h5>Transcripción de la Conversación</h5>
            <div class="drawer-transcript-stream">
              ${(m.transcript || []).length > 0 ? (m.transcript || []).map(t => `
                <div class="drawer-line">
                  <span class="drawer-speaker ${t.speakerType === 'user' ? 'text-sage' : 'text-lavender'}">
                    <strong>${t.speaker}:</strong>
                  </span>
                  <span class="drawer-text">${t.text}</span>
                </div>
              `).join('') : '<p class="text-dim text-xs">Sin intervenciones de audio registradas.</p>'}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    userHistoryList.querySelectorAll('.btn-history-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const drawer = document.getElementById(`drawer-${id}`);
        if (drawer) drawer.classList.toggle('is-hidden');
      });
    });

    userHistoryList.querySelectorAll('.btn-history-download').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const m = meetings.find(x => x.id === id);
        if (!m) return;
        generateExecutivePDF(m);
      });
    });

    userHistoryList.querySelectorAll('.btn-history-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('¿Deseas eliminar esta reunión de tu historial local?')) {
          await dbEngine.deleteMeeting(id);
          renderUserHistory();
        }
      });
    });
  };

  // ===== QUICK ASK / CUSTOM QUERY =====
  const sendCustomQuery = async (text) => {
    if (!text || !text.trim()) return;
    const message = text.trim();

    if (customReplyCard) {
      customReplyCard.style.display = 'flex';
      customReplyText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-cyan"></i> Consultando a la IA con toda la transcripción...';
    }

    try {
      const { text: response, source } = await aiEngine.respondToChatAsync(message, sttEngine.transcriptHistory);
      if (customReplyText) {
        const formatted = response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        const sourceBadge = source === 'fallback'
          ? ' <span class="chat-fallback-tag"><i class="fa-solid fa-plug-circle-exclamation"></i> Local</span>'
          : '';
        customReplyText.innerHTML = `<p><strong>Tú:</strong> "${message}"</p><p style="margin-top: 6px;">${formatted}${sourceBadge}</p>`;
      }
    } catch (err) {
      if (customReplyText) {
        customReplyText.textContent = 'Error al consultar la IA. Inténtalo de nuevo.';
      }
    }
  };

  if (btnSendChat && aiChatInput) {
    btnSendChat.addEventListener('click', () => {
      sendCustomQuery(aiChatInput.value);
      aiChatInput.value = '';
    });

    aiChatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendCustomQuery(aiChatInput.value);
        aiChatInput.value = '';
      }
    });
  }

  // ===== VOICE-TO-QUERY =====
  const initVoiceChat = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !btnVoiceChat) return;

    voiceChatRecognition = new SpeechRecognition();
    voiceChatRecognition.continuous = false;
    voiceChatRecognition.interimResults = true;
    voiceChatRecognition.lang = 'es-ES';

    voiceChatRecognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          interimText += event.results[i][0].transcript;
        }
      }

      if (interimText && aiChatInput) {
        aiChatInput.value = interimText;
      }

      if (finalText.trim()) {
        if (aiChatInput) aiChatInput.value = '';
        sendCustomQuery(finalText.trim());
      }
    };

    voiceChatRecognition.onend = () => {
      isVoiceChatting = false;
      btnVoiceChat.classList.remove('recording');
      if (aiChatInput) aiChatInput.placeholder = 'Pregunta algo específico a la IA...';
    };

    voiceChatRecognition.onerror = (e) => {
      console.warn('Voice query error:', e.error);
      isVoiceChatting = false;
      btnVoiceChat.classList.remove('recording');
      if (aiChatInput) aiChatInput.placeholder = 'Pregunta algo específico a la IA...';
    };
  };

  initVoiceChat();

  if (btnVoiceChat) {
    btnVoiceChat.addEventListener('click', () => {
      if (!voiceChatRecognition) return;

      if (isVoiceChatting) {
        voiceChatRecognition.stop();
        isVoiceChatting = false;
        btnVoiceChat.classList.remove('recording');
        if (aiChatInput) aiChatInput.placeholder = 'Pregunta algo específico a la IA...';
      } else {
        try {
          voiceChatRecognition.start();
          isVoiceChatting = true;
          btnVoiceChat.classList.add('recording');
          if (aiChatInput) {
            aiChatInput.placeholder = '🎤 Escuchando tu consulta privada...';
            aiChatInput.value = '';
          }
        } catch (e) {
          console.warn('Could not start voice query:', e);
        }
      }
    });
  }

  // ===== EXPORT EXECUTIVE PDF REPORT =====
  btnExportReport.addEventListener('click', () => {
    const history = sttEngine.transcriptHistory;
    const duration = timerText.textContent || '00:00';
    const currentMeeting = {
      id: `live_${Date.now()}`,
      timestamp: Date.now(),
      dateFormatted: new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
      durationFormatted: duration,
      topic: aiEngine.currentTopic || 'Sesión en Vivo',
      sentiment: aiEngine.sentiment || 'Neutral',
      intensity: aiEngine.meetingIntensity || 'Media / Productiva',
      tone: aiEngine.meetingTone || 'Coordinación General',
      interventionsCount: history.length,
      transcript: history,
      agreements: aiEngine.agreements || [],
      detailedAgreements: aiEngine.detailedAgreements || [],
      actionItems: aiEngine.actionItems || [],
      detailedActionItems: aiEngine.detailedActionItems || [],
      metrics: aiEngine.calculateDetailedMetrics ? aiEngine.calculateDetailedMetrics(history) : {
        userRatio: 50,
        interlocutorRatio: 50,
        wpm: 120,
        technicalDepth: 'General / Estratégica',
        conversationalBalance: 'Equilibrado'
      }
    };
    generateExecutivePDF(currentMeeting);
  });

  // Clear transcript
  if (btnClearTranscript) {
    btnClearTranscript.addEventListener('click', () => {
      sttEngine.transcriptHistory = [];
      transcriptStream.innerHTML = `
        <div class="stream-item system-msg">
          <span class="time">00:00</span>
          <span class="text"><i class="fa-solid fa-info-circle"></i> Transcripción reiniciada...</span>
        </div>
      `;
      if (transcriptCount) transcriptCount.textContent = '0';
    });
  }

  // ===== UI HELPER FUNCTIONS =====
  function updateStatus(isLive, label) {
    if (isLive) {
      liveStatusBadge.className = 'status-badge status-live';
      statusText.textContent = label || 'CONECTADO';
    } else {
      liveStatusBadge.className = 'status-badge status-offline';
      statusText.textContent = label || 'Listo';
    }
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerSeconds = 0;
    timerInterval = setInterval(() => {
      timerSeconds++;
      const hrs = String(Math.floor(timerSeconds / 3600)).padStart(2, '0');
      const mins = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, '0');
      const secs = String(timerSeconds % 60).padStart(2, '0');
      timerText.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function appendTranscriptItem(chunk) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'stream-item';

    const isUser = chunk.speakerType === 'user';
    const speakerClass = isUser ? 'speaker-user' : 'speaker-zoom';

    itemDiv.innerHTML = `
      <div class="speaker ${speakerClass}">
        <span><i class="${isUser ? 'fa-solid fa-user' : 'fa-solid fa-desktop'}"></i> ${chunk.speaker}</span>
        <span class="time">${chunk.timestamp}</span>
      </div>
      <div class="text">${chunk.text}</div>
    `;

    transcriptStream.appendChild(itemDiv);
    transcriptStream.scrollTop = transcriptStream.scrollHeight;

    if (transcriptCount) {
      transcriptCount.textContent = sttEngine.transcriptHistory.length;
    }
  }

  function updateMetaUI(aiMeta) {
    if (!aiMeta) return;

    if (currentTopicText) currentTopicText.textContent = aiMeta.topic || 'En espera...';
    if (analyticsCurrentTopic) analyticsCurrentTopic.textContent = aiMeta.topic || 'Coordinación General';
    if (sentimentText) sentimentText.textContent = aiMeta.sentiment || 'Neutral';

    // 1. Intensity & Tone Pill
    if (intensityPill && intensityText) {
      const rawIntensity = aiMeta.intensity || 'Media / Productiva';
      let pillClass = 'intensity-pill intensity-medium';
      let shortLabel = 'Productiva';
      let iconClass = 'fa-solid fa-gauge-high text-sky';

      if (rawIntensity.includes('Crítica') || rawIntensity.includes('Urgente')) {
        pillClass = 'intensity-pill intensity-critical';
        shortLabel = 'Urgente';
        iconClass = 'fa-solid fa-triangle-exclamation text-danger';
      } else if (rawIntensity.includes('Alta') || rawIntensity.includes('Negociación')) {
        pillClass = 'intensity-pill intensity-high';
        shortLabel = 'Negociación';
        iconClass = 'fa-solid fa-fire text-amber';
      } else if (rawIntensity.includes('Baja') || rawIntensity.includes('Distendida')) {
        pillClass = 'intensity-pill intensity-low';
        shortLabel = 'Distendida';
        iconClass = 'fa-solid fa-leaf text-emerald';
      }

      intensityPill.className = pillClass;
      intensityText.textContent = `${shortLabel} (${aiMeta.tone || 'Coordinación'})`;
      if (intensityIcon) intensityIcon.className = iconClass;
      intensityPill.title = `Intensidad: ${rawIntensity} | Tono: ${aiMeta.tone || 'General'}`;
    }

    // 2. Speaker Ratios & Technical Metrics
    if (aiMeta.metrics) {
      const m = aiMeta.metrics;
      if (labelUserRatio) {
        labelUserRatio.innerHTML = `<i class="fa-solid fa-user text-cyan"></i> Tú: ${m.userRatio}% (${m.userWords || 0} pal)`;
      }
      if (labelInterlocutorRatio) {
        const otherName = (sttEngine.speakers && sttEngine.speakers.interlocutor !== 'Interlocutor')
          ? sttEngine.speakers.interlocutor
          : 'Otros';
        labelInterlocutorRatio.innerHTML = `<i class="fa-solid fa-users text-purple"></i> ${otherName}: ${m.interlocutorRatio}% (${m.interlocutorWords || 0} pal)`;
      }
      if (ratioFillUser) ratioFillUser.style.width = `${m.userRatio}%`;
      if (ratioFillInterlocutor) ratioFillInterlocutor.style.width = `${m.interlocutorRatio}%`;
      if (kpiWpm) kpiWpm.textContent = `${m.wpm || 0} WPM`;
      if (kpiTechnicalDepth) kpiTechnicalDepth.textContent = m.technicalDepth || 'General';
      if (kpiBalance) kpiBalance.textContent = m.conversationalBalance || 'Fluido';
    }

    // 3. Deep Expandable Accordions for Agreements
    if (agreementsContainer) {
      const dAgreements = aiMeta.detailedAgreements || [];
      if (dAgreements.length > 0) {
        agreementsContainer.innerHTML = dAgreements.map((a, idx) => {
          let badgeClass = 'priority-strategic';
          if (a.priority && a.priority.includes('Alta')) badgeClass = 'priority-high';
          else if (a.priority && a.priority.includes('Media')) badgeClass = 'priority-medium';

          return `
            <details class="deep-item-card" ${idx === dAgreements.length - 1 ? 'open' : ''}>
              <summary class="deep-item-summary">
                <span class="deep-summary-title">
                  <i class="fa-solid fa-handshake text-emerald"></i>
                  <span>${a.title}</span>
                </span>
                <span class="deep-badge-priority ${badgeClass}">${a.priority || 'Estratégica'}</span>
              </summary>
              <div class="deep-item-body">
                <div class="deep-meta-row">
                  <span><i class="fa-solid fa-user-check"></i> <strong>Pactado por:</strong> ${a.speaker || 'Participante'}</span>
                  <span><i class="fa-regular fa-clock"></i> ${a.timestamp || 'En sesión'}</span>
                </div>
                <div class="deep-meta-row">
                  <span><i class="fa-solid fa-shield-halved"></i> <strong>Estado:</strong> ${a.status || 'Compromiso en firme'}</span>
                </div>
                <div class="deep-context-box">"${a.context || a.title}"</div>
              </div>
            </details>
          `;
        }).join('');
      } else {
        agreementsContainer.innerHTML = `<p class="text-dim text-xs" style="padding: 6px 0;"><i class="fa-solid fa-info-circle"></i> Esperando acuerdos en la reunión...</p>`;
      }
    }

    // 4. Deep Expandable Accordions for Action Items
    if (actionItemsContainer) {
      const dActions = aiMeta.detailedActionItems || [];
      if (dActions.length > 0) {
        actionItemsContainer.innerHTML = dActions.map((t, idx) => {
          let badgeClass = 'priority-medium';
          if (t.priority && (t.priority.includes('Alta') || t.priority.includes('Crítica'))) badgeClass = 'priority-high';

          return `
            <details class="deep-item-card" ${idx === dActions.length - 1 ? 'open' : ''}>
              <summary class="deep-item-summary">
                <span class="deep-summary-title">
                  <i class="fa-solid fa-list-check text-amber"></i>
                  <span>${t.title}</span>
                </span>
                <span class="deep-badge-priority ${badgeClass}">${t.priority || 'Media'}</span>
              </summary>
              <div class="deep-item-body">
                <div class="deep-meta-row">
                  <span><i class="fa-solid fa-user-gear"></i> <strong>Asignado:</strong> ${t.speaker || 'Pendiente'}</span>
                  <span><i class="fa-regular fa-clock"></i> ${t.timestamp || '00:00'}</span>
                </div>
                <div class="deep-meta-row">
                  <span><i class="fa-solid fa-spinner"></i> <strong>Estado:</strong> ${t.status || 'Pendiente'}</span>
                </div>
                <div class="deep-context-box">"${t.context || t.title}"</div>
              </div>
            </details>
          `;
        }).join('');
      } else {
        actionItemsContainer.innerHTML = `<p class="text-dim text-xs" style="padding: 6px 0;"><i class="fa-solid fa-info-circle"></i> Esperando tareas o compromisos...</p>`;
      }
    }
  }
});
