/**
 * ReuLive - Main Application Controller
 * Live Copilot HUD, Speaker Switcher, Real-Time Proposals/Responses, and Audio Capture.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Core Engines
  const mediaEngine = new MediaEngine();
  const sttEngine = new STTEngine();
  const aiEngine = new AIEngine();

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

  // Zen Lobby & Workspace Containers
  const zenLobby = document.getElementById('zenLobby');
  const workspaceSection = document.getElementById('workspaceSection');
  const btnLobbyStart = document.getElementById('btnLobbyStart');

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

  // Media Controls (Mute buttons)
  const btnMuteMic = document.getElementById('btnMuteMic');
  const btnMuteVideo = document.getElementById('btnMuteVideo');

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

  // Analytics
  const analyticsCurrentTopic = document.getElementById('analyticsCurrentTopic');
  const agreementsList = document.getElementById('agreementsList');
  const actionItemsList = document.getElementById('actionItemsList');

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

      // Enable mute buttons
      btnMuteMic.disabled = false;
      btnMuteVideo.disabled = false;

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

    // Reset mute states
    btnMuteMic.disabled = true;
    btnMuteVideo.disabled = true;
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

    subtitlesOverlay.classList.remove('visible');
    subtitlesText.textContent = '';

    updateStatus(false, 'Listo');
  };

  btnCapture.addEventListener('click', startCapture);
  if (btnPlaceholderStart) btnPlaceholderStart.addEventListener('click', startCapture);
  if (btnLobbyStart) btnLobbyStart.addEventListener('click', startCapture);

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

  // ===== EXPORT REPORT =====
  btnExportReport.addEventListener('click', () => {
    const history = sttEngine.transcriptHistory;

    let md = `# Informe de Reunión ReuLive AI\n\n`;
    md += `**Fecha:** ${new Date().toLocaleString()}\n`;
    md += `**Tema Principal:** ${aiEngine.currentTopic}\n`;
    md += `**Duración:** ${timerText.textContent}\n`;
    md += `**Intervenciones:** ${history.length}\n\n`;
    md += `---\n\n## 📝 Transcripción Completa\n\n`;

    history.forEach(item => {
      const provTag = item.provider ? ` _(${item.provider})_` : '';
      md += `* **[${item.timestamp}] ${item.speaker}:** ${item.text}${provTag}\n`;
    });

    md += `\n---\n\n## 🤝 Acuerdos\n`;
    aiEngine.agreements.forEach(a => md += `- ${a}\n`);
    if (aiEngine.agreements.length === 0) md += `- Sin acuerdos registrados\n`;

    md += `\n## 📋 Tareas Pendientes\n`;
    aiEngine.actionItems.forEach(t => md += `- ${t}\n`);
    if (aiEngine.actionItems.length === 0) md += `- Sin tareas registradas\n`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Informe-Reunion-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
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
    if (currentTopicText) currentTopicText.textContent = aiMeta.topic;
    if (analyticsCurrentTopic) analyticsCurrentTopic.textContent = aiMeta.topic;
    if (sentimentText) sentimentText.textContent = aiMeta.sentiment;

    if (aiMeta.agreements && aiMeta.agreements.length > 0 && agreementsList) {
      agreementsList.innerHTML = aiMeta.agreements.map(a =>
        `<li><i class="fa-solid fa-check text-emerald"></i> ${a}</li>`
      ).join('');
    }
    if (aiMeta.actionItems && aiMeta.actionItems.length > 0 && actionItemsList) {
      actionItemsList.innerHTML = aiMeta.actionItems.map(t =>
        `<li><i class="fa-regular fa-square text-amber"></i> ${t}</li>`
      ).join('');
    }
  }
});
