/**
 * ReuLive - Main Application Controller
 * Unified flow: One button to start capture, transcription, and AI copilot.
 * Everything visible simultaneously on the same screen.
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

  // ===== DOM Elements =====
  // Header
  const liveStatusBadge = document.getElementById('liveStatusBadge');
  const statusText = document.getElementById('statusText');
  const currentTopicText = document.getElementById('currentTopicText');
  const timerText = document.getElementById('timerText');
  const btnCapture = document.getElementById('btnCapture');
  const btnCaptureText = document.getElementById('btnCaptureText');
  const btnExportReport = document.getElementById('btnExportReport');

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

  // Copilot Section
  const suggestionsContainer = document.getElementById('suggestionsContainer');
  const btnRefreshCopilot = document.getElementById('btnRefreshCopilot');
  const customPromptInput = document.getElementById('customPromptInput');
  const btnSendCustomPrompt = document.getElementById('btnSendCustomPrompt');

  // Transcript
  const transcriptStream = document.getElementById('transcriptStream');
  const transcriptCount = document.getElementById('transcriptCount');
  const btnClearTranscript = document.getElementById('btnClearTranscript');
  const speakerNameInput = document.getElementById('speakerNameInput');

  // Analytics
  const analyticsCurrentTopic = document.getElementById('analyticsCurrentTopic');
  const agreementsList = document.getElementById('agreementsList');
  const actionItemsList = document.getElementById('actionItemsList');

  // ===== Initialize =====
  mediaEngine.initCanvas(audioCanvas);

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

  // ===== STT Callbacks =====
  // Live subtitles (interim results)
  sttEngine.onInterimResult = (text) => {
    if (subtitlesText) {
      subtitlesText.textContent = text;
      subtitlesOverlay.classList.toggle('visible', text.length > 0);
    }
  };

  // Final results → AI processing + transcript update
  sttEngine.onFinalResult = async (chunk) => {
    // Add to transcript
    appendTranscriptItem(chunk);

    // Show final text briefly as subtitle
    if (subtitlesText) {
      subtitlesText.textContent = chunk.text;
      subtitlesOverlay.classList.add('visible');
      setTimeout(() => {
        if (subtitlesText.textContent === chunk.text) {
          subtitlesOverlay.classList.remove('visible');
        }
      }, 3000);
    }

    // Process with AI Engine immediately
    const aiResults = aiEngine.processTranscript(sttEngine.transcriptHistory);
    updateAIUI(aiResults);
  };

  sttEngine.onStatusChange = (status) => {
    if (status === 'listening') {
      updateStatus(true, 'TRANSCRIBIENDO EN VIVO');
    }
  };

  // ===== SINGLE CAPTURE BUTTON =====
  const startCapture = async () => {
    if (isActive) {
      // STOP everything
      await stopCapture();
      return;
    }

    try {
      // Update UI to "connecting" state
      btnCapture.disabled = true;
      btnCaptureText.textContent = 'Conectando...';
      updateStatus(true, 'CONECTANDO...');

      // Start unified capture (auto-detects device)
      const result = await mediaEngine.startUnifiedCapture();

      // Show video if available
      if (result.hasVideo) {
        const videoStream = mediaEngine.getVideoStream();
        if (videoStream) {
          captureVideo.srcObject = videoStream;
          captureVideo.classList.add('active');
        }
        capturePlaceholder.style.display = 'none';
      } else {
        capturePlaceholder.style.display = 'none';
        // Show a "audio only" indicator
        captureVideo.classList.remove('active');
      }

      // Update source label
      sourceLabel.textContent = `Fuente: ${result.sourceLabel}`;

      // Start recording immediately
      mediaEngine.startRecording();

      // Start speech recognition
      sttEngine.startListening();

      // Start timer
      startTimer();

      // Update UI
      isActive = true;
      btnCapture.disabled = false;
      btnCapture.classList.remove('btn-primary');
      btnCapture.classList.add('btn-danger');
      btnCaptureText.textContent = 'Detener y Guardar';
      btnCapture.querySelector('i').className = 'fa-solid fa-square';
      btnExportReport.disabled = false;

      updateStatus(true, 'GRABANDO EN VIVO');

    } catch (err) {
      console.error('Capture error:', err);
      btnCapture.disabled = false;
      btnCaptureText.textContent = 'Iniciar Captura';
      updateStatus(false, 'Error');
      alert('Error al iniciar captura: ' + err.message);
    }
  };

  const stopCapture = async () => {
    // Update UI to "stopping" state
    btnCapture.disabled = true;
    btnCaptureText.textContent = 'Guardando...';
    updateStatus(true, 'GUARDANDO ARCHIVOS...');

    // Stop speech recognition
    sttEngine.stopListening();

    // Stop recording and auto-download files
    await mediaEngine.stopAndExport();

    // Stop all media
    mediaEngine.stopAll();

    // Stop timer
    stopTimer();

    // Reset video
    captureVideo.srcObject = null;
    captureVideo.classList.remove('active');
    capturePlaceholder.style.display = '';

    // Reset UI
    isActive = false;
    btnCapture.disabled = false;
    btnCapture.classList.remove('btn-danger');
    btnCapture.classList.add('btn-primary');
    btnCaptureText.textContent = 'Iniciar Captura';
    btnCapture.querySelector('i').className = 'fa-solid fa-circle-dot';
    sourceLabel.textContent = 'Fuente: Sin Conectar';

    // Hide subtitles
    subtitlesOverlay.classList.remove('visible');
    subtitlesText.textContent = '';

    updateStatus(false, 'Listo');
  };

  // Bind capture button
  btnCapture.addEventListener('click', startCapture);
  if (btnPlaceholderStart) btnPlaceholderStart.addEventListener('click', startCapture);

  // ===== Copilot Controls =====
  btnRefreshCopilot.addEventListener('click', () => {
    const aiResults = aiEngine.processTranscript(sttEngine.transcriptHistory);
    updateAIUI(aiResults);
  });

  // Custom prompt
  const handleCustomPrompt = () => {
    const query = customPromptInput.value.trim();
    if (!query) return;

    const responseText = aiEngine.queryCustomCopilot(query, sttEngine.transcriptHistory);

    const customCard = document.createElement('div');
    customCard.className = 'suggestion-card card-direct';
    customCard.innerHTML = `
      <div class="card-tag"><i class="fa-solid fa-wand-magic-sparkles"></i> Respuesta del Copiloto</div>
      <p class="suggestion-text">${responseText}</p>
      <div class="card-actions">
        <button class="btn-sm btn-copy"><i class="fa-regular fa-copy"></i> Copiar</button>
      </div>
    `;

    suggestionsContainer.prepend(customCard);
    bindCardButtons(customCard);
    customPromptInput.value = '';
  };

  btnSendCustomPrompt.addEventListener('click', handleCustomPrompt);
  customPromptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCustomPrompt();
  });

  // Export Report
  btnExportReport.addEventListener('click', () => {
    const history = sttEngine.transcriptHistory;

    let md = `# Informe de Reunión ReuLive AI\n\n`;
    md += `**Fecha:** ${new Date().toLocaleString()}\n`;
    md += `**Tema Principal:** ${aiEngine.currentTopic}\n`;
    md += `**Duración:** ${timerText.textContent}\n`;
    md += `**Intervenciones:** ${history.length}\n\n`;
    md += `---\n\n## 📝 Transcripción Completa\n\n`;

    history.forEach(item => {
      md += `* **[${item.timestamp}] ${item.speaker}:** ${item.text}\n`;
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

  // ===== UI Update Functions =====
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

    // Update count badge
    if (transcriptCount) {
      transcriptCount.textContent = sttEngine.transcriptHistory.length;
    }
  }

  function updateAIUI(aiResults) {
    // Update topic
    currentTopicText.textContent = aiResults.topic;
    if (analyticsCurrentTopic) analyticsCurrentTopic.textContent = aiResults.topic;

    // Update sentiment
    if (sentimentText) sentimentText.textContent = aiResults.sentiment;

    // Update suggestion cards
    suggestionsContainer.innerHTML = '';
    aiResults.suggestions.forEach(sug => {
      const card = document.createElement('div');
      card.className = `suggestion-card card-${sug.type}`;
      card.innerHTML = `
        <div class="card-tag"><i class="fa-solid ${sug.icon}"></i> ${sug.title}</div>
        <p class="suggestion-text">${sug.text}</p>
        <div class="card-actions">
          <button class="btn-sm btn-copy"><i class="fa-regular fa-copy"></i> Copiar</button>
          <button class="btn-sm btn-speak"><i class="fa-solid fa-volume-high"></i> Escuchar</button>
        </div>
      `;
      suggestionsContainer.appendChild(card);
      bindCardButtons(card);
    });

    // Update agreements & action items
    if (aiResults.agreements && aiResults.agreements.length > 0 && agreementsList) {
      agreementsList.innerHTML = aiResults.agreements.map(a =>
        `<li><i class="fa-solid fa-check text-emerald"></i> ${a}</li>`
      ).join('');
    }
    if (aiResults.actionItems && aiResults.actionItems.length > 0 && actionItemsList) {
      actionItemsList.innerHTML = aiResults.actionItems.map(t =>
        `<li><i class="fa-regular fa-square text-amber"></i> ${t}</li>`
      ).join('');
    }
  }

  function bindCardButtons(card) {
    const textEl = card.querySelector('.suggestion-text');
    if (!textEl) return;
    const text = textEl.textContent;

    const btnCopy = card.querySelector('.btn-copy');
    const btnSpeak = card.querySelector('.btn-speak');

    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const cleanText = text.replace(/^"|"$/g, '');
        navigator.clipboard.writeText(cleanText).catch(() => {});
        btnCopy.innerHTML = `<i class="fa-solid fa-check"></i> Copiado`;
        setTimeout(() => {
          btnCopy.innerHTML = `<i class="fa-regular fa-copy"></i> Copiar`;
        }, 2000);
      });
    }

    if (btnSpeak && 'speechSynthesis' in window) {
      btnSpeak.addEventListener('click', () => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.replace(/^"|"$/g, ''));
        utterance.lang = 'es-ES';
        window.speechSynthesis.speak(utterance);
      });
    }
  }

  // Handle display stream ending (user stops screen share from browser UI)
  // This ensures we clean up properly
  const checkStreamEnded = () => {
    if (isActive && mediaEngine.displayStream) {
      const videoTracks = mediaEngine.displayStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.onended = () => {
          console.log('Screen share stopped by user');
          stopCapture();
        };
      });
    }
  };

  // Periodic check for stream health
  const originalStart = startCapture;
  // We'll add the stream ended listener after capture starts
  const originalBtnHandler = btnCapture.onclick;

});
