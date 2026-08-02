/**
 * ReuLive - Main Application Controller
 * Orchestrates MediaEngine, STTEngine, AIEngine, UI interactions, and Export.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Instantiate Core Engines
  const mediaEngine = new MediaEngine();
  const sttEngine = new STTEngine();
  const aiEngine = new AIEngine();

  // Elements - Header & Status
  const liveStatusBadge = document.getElementById('liveStatusBadge');
  const statusText = document.getElementById('statusText');
  const currentTopicText = document.getElementById('currentTopicText');
  const timerText = document.getElementById('timerText');
  const btnConnectZoom = document.getElementById('btnConnectZoom');
  const btnGitGuide = document.getElementById('btnGitGuide');
  const btnExportReport = document.getElementById('btnExportReport');

  // Elements - Viewport
  const remoteVideo = document.getElementById('remoteVideo');
  const videoPlaceholder = document.getElementById('videoPlaceholder');
  const sourceLabel = document.getElementById('sourceLabel');
  const audioCanvas = document.getElementById('audioVisualizerCanvas');
  const micVolumeLevel = document.getElementById('micVolumeLevel');
  const sentimentText = document.getElementById('sentimentText');
  const systemAudioMeter = document.getElementById('systemAudioMeter');
  const userMicMeter = document.getElementById('userMicMeter');
  
  const btnStartRecord = document.getElementById('btnStartRecord');
  const btnStopRecord = document.getElementById('btnStopRecord');
  const btnQuickStartDemo = document.getElementById('btnQuickStartDemo');
  const btnToggleVideo = document.getElementById('btnToggleVideo');
  const btnToggleAudio = document.getElementById('btnToggleAudio');

  // Elements - Copilot & Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const suggestionsContainer = document.getElementById('suggestionsContainer');
  const transcriptStream = document.getElementById('transcriptStream');
  const btnClearTranscript = document.getElementById('btnClearTranscript');
  const btnAutoScroll = document.getElementById('btnAutoScroll');
  const btnRefreshCopilot = document.getElementById('btnRefreshCopilot');
  const topicTimelineList = document.getElementById('topicTimelineList');
  const agreementsList = document.getElementById('agreementsList');
  const actionItemsList = document.getElementById('actionItemsList');
  const copilotBadgeCount = document.getElementById('copilotBadgeCount');

  const customPromptInput = document.getElementById('customPromptInput');
  const btnSendCustomPrompt = document.getElementById('btnSendCustomPrompt');

  // Elements - Modals
  const modalConnection = document.getElementById('modalConnection');
  const modalGitVercel = document.getElementById('modalGitVercel');
  const btnCloseModalConnect = document.getElementById('btnCloseModalConnect');
  const btnCloseModalGit = document.getElementById('btnCloseModalGit');

  const optScreenAudio = document.getElementById('optScreenAudio');
  const optMicOnly = document.getElementById('optMicOnly');
  const optLiveDemo = document.getElementById('optLiveDemo');

  // State
  let timerInterval = null;
  let timerSeconds = 0;
  let isAutoScroll = true;

  // Initialize Canvas Visualizer
  mediaEngine.initCanvas(audioCanvas);

  mediaEngine.onVolumeChange = (vol) => {
    micVolumeLevel.textContent = `${vol}%`;
    userMicMeter.style.width = `${Math.min(vol * 1.5, 100)}%`;
    if (vol > 5) {
      systemAudioMeter.style.width = `${Math.min(vol * 1.2 + 10, 100)}%`;
    } else {
      systemAudioMeter.style.width = '0%';
    }
  };

  // Setup STT Callbacks
  sttEngine.onTranscriptChunk = (chunk) => {
    appendTranscriptItem(chunk);

    // Process AI Topic & Copilot Suggestions
    const aiResults = aiEngine.processTranscript(sttEngine.transcriptHistory);
    updateAIUI(aiResults);
  };

  // Modal Event Listeners
  btnConnectZoom.addEventListener('click', () => {
    modalConnection.style.display = 'flex';
  });

  btnGitGuide.addEventListener('click', () => {
    modalGitVercel.style.display = 'flex';
  });

  btnCloseModalConnect.addEventListener('click', () => {
    modalConnection.style.display = 'none';
  });

  btnCloseModalGit.addEventListener('click', () => {
    modalGitVercel.style.display = 'none';
  });

  // Modal Backdrop Click to Close
  [modalConnection, modalGitVercel].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });

  // Option 1: Screen + Audio Capture (Zoom)
  optScreenAudio.addEventListener('click', async () => {
    modalConnection.style.display = 'none';
    try {
      const result = await mediaEngine.startScreenAudioCapture();
      
      if (result.videoTrack) {
        remoteVideo.srcObject = new MediaStream([result.videoTrack]);
        remoteVideo.classList.add('active');
        videoPlaceholder.style.display = 'none';
        btnToggleVideo.disabled = false;
      }

      sourceLabel.textContent = 'Fuente: Zoom / Pantalla con Audio';
      btnToggleAudio.disabled = false;
      btnStartRecord.disabled = false;
      btnExportReport.disabled = false;

      updateStatus(true, 'Conectado a Zoom');
      sttEngine.startListening();
      startTimer();

    } catch (err) {
      alert('No se pudo compartir la pantalla/audio de Zoom. Permiso denegado.');
    }
  });

  // Option 2: Mic Only Capture
  optMicOnly.addEventListener('click', async () => {
    modalConnection.style.display = 'none';
    try {
      await mediaEngine.startMicOnlyCapture();
      sourceLabel.textContent = 'Fuente: Micrófono del Dispositivo';
      btnToggleAudio.disabled = false;
      btnStartRecord.disabled = false;
      btnExportReport.disabled = false;

      updateStatus(true, 'Micrófono Activo');
      sttEngine.startListening();
      startTimer();
    } catch (err) {
      alert('No se pudo acceder al micrófono del dispositivo.');
    }
  });

  // Option 3: Live Zoom Demo Simulation
  const startDemo = () => {
    modalConnection.style.display = 'none';
    sourceLabel.textContent = 'Fuente: Simulación Reunión Zoom Live';
    videoPlaceholder.style.display = 'none';
    remoteVideo.classList.add('active');
    
    // Create animated cyber canvas placeholder in video element
    remoteVideo.style.display = 'none';
    
    btnStartRecord.disabled = false;
    btnExportReport.disabled = false;
    btnToggleAudio.disabled = false;

    updateStatus(true, 'Demo Zoom en Vivo');
    sttEngine.startDemoMeetingStream();
    startTimer();
  };

  optLiveDemo.addEventListener('click', startDemo);
  btnQuickStartDemo.addEventListener('click', startDemo);

  // Tab Switching Logic
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });

  // Recording Controls
  btnStartRecord.addEventListener('click', () => {
    mediaEngine.startRecording();
    btnStartRecord.style.display = 'none';
    btnStopRecord.style.display = 'inline-flex';
  });

  btnStopRecord.addEventListener('click', async () => {
    const recordResult = await mediaEngine.stopRecording();
    btnStopRecord.style.display = 'none';
    btnStartRecord.style.display = 'inline-flex';

    if (recordResult && recordResult.url) {
      const a = document.createElement('a');
      a.href = recordResult.url;
      a.download = `ReuLive-Reunion-${new Date().toISOString().slice(0,10)}.webm`;
      a.click();
    }
  });

  // Custom AI Query Prompt
  const handleCustomPrompt = async () => {
    const query = customPromptInput.value.trim();
    if (!query) return;

    const responseText = await aiEngine.queryCustomCopilot(query, sttEngine.transcriptHistory);
    
    // Add custom copilot answer to suggestions
    const customCard = document.createElement('div');
    customCard.className = 'suggestion-card card-direct';
    customCard.innerHTML = `
      <div class="card-tag"><i class="fa-solid fa-wand-magic-sparkles"></i> Respuesta a tu consulta</div>
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

  // Export Meeting Report (Markdown & Text)
  btnExportReport.addEventListener('click', () => {
    const topic = aiEngine.currentTopic;
    const history = sttEngine.transcriptHistory;

    let markdown = `# Informe de Reunión ReuLive AI\n\n`;
    markdown += `**Fecha:** ${new Date().toLocaleString()}\n`;
    markdown += `**Tema Principal:** ${topic}\n`;
    markdown += `**Duración:** ${timerText.textContent}\n\n`;
    markdown += `--- \n\n## 📝 Transcripción Completa\n\n`;

    history.forEach(item => {
      markdown += `* **[${item.timestamp}] ${item.speaker}:** ${item.text}\n`;
    });

    markdown += `\n--- \n\n## 🤝 Acuerdos Tomados\n`;
    aiEngine.agreements.forEach(a => markdown += `- ${a}\n`);

    markdown += `\n## 📋 Tareas / Action Items\n`;
    aiEngine.actionItems.forEach(t => markdown += `- ${t}\n`);

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Informe-Reunion-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
  });

  // Clear Transcript
  btnClearTranscript.addEventListener('click', () => {
    sttEngine.transcriptHistory = [];
    transcriptStream.innerHTML = `
      <div class="stream-item system-msg">
        <span class="time">00:00</span>
        <span class="text"><i class="fa-solid fa-info-circle"></i> Transcripción reiniciada...</span>
      </div>
    `;
  });

  // Copy Code in Modal
  document.querySelectorAll('.btn-copy-code').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code');
      navigator.clipboard.writeText(code);
      btn.innerHTML = `<i class="fa-solid fa-check"></i> ¡Copiado!`;
      setTimeout(() => {
        btn.innerHTML = `<i class="fa-regular fa-copy"></i> Copiar Comandos`;
      }, 2000);
    });
  });

  // Helpers
  function updateStatus(isLive, label) {
    if (isLive) {
      liveStatusBadge.className = 'status-badge status-live';
      statusText.textContent = label || 'LIVE RECORDING';
    } else {
      liveStatusBadge.className = 'status-badge status-offline';
      statusText.textContent = 'Listo para conectar';
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

    if (isAutoScroll) {
      transcriptStream.scrollTop = transcriptStream.scrollHeight;
    }
  }

  function updateAIUI(aiResults) {
    // 1. Update Main Topic Badge
    currentTopicText.textContent = aiResults.topic;

    // 2. Update Sentiment
    sentimentText.textContent = aiResults.sentiment;

    // 3. Update Copilot Response Cards
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

    // 4. Update Topic Timeline & Agreements
    updateTopicTimeline(aiResults.topic);
    updateLists(aiResults.agreements, aiResults.actionItems);
  }

  function bindCardButtons(card) {
    const text = card.querySelector('.suggestion-text').textContent;
    const btnCopy = card.querySelector('.btn-copy');
    const btnSpeak = card.querySelector('.btn-speak');

    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const cleanText = text.replace(/^"|"$/g, '');
        navigator.clipboard.writeText(cleanText);
        btnCopy.innerHTML = `<i class="fa-solid fa-check"></i> ¡Copiado!`;
        setTimeout(() => {
          btnCopy.innerHTML = `<i class="fa-regular fa-copy"></i> Copiar`;
        }, 2000);
      });
    }

    if (btnSpeak && 'speechSynthesis' in window) {
      btnSpeak.addEventListener('click', () => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        window.speechSynthesis.speak(utterance);
      });
    }
  }

  function updateTopicTimeline(topic) {
    topicTimelineList.innerHTML = `
      <li class="active-topic">
        <span class="time-badge">Ahora</span>
        <div class="topic-info">
          <strong>${topic}</strong>
          <p>Extraído en tiempo real desde la conversación activa.</p>
        </div>
      </li>
    `;
  }

  function updateLists(agreements, actionItems) {
    if (agreements && agreements.length > 0) {
      agreementsList.innerHTML = agreements.map(a => `<li><i class="fa-solid fa-check text-emerald"></i> ${a}</li>`).join('');
    }
    if (actionItems && actionItems.length > 0) {
      actionItemsList.innerHTML = actionItems.map(t => `<li><i class="fa-regular fa-square text-amber"></i> ${t}</li>`).join('');
    }
  }
});
