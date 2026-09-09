/**
 * ReuLive - Main Application Controller
 * Unified flow with mic/video mute, AI chat interface, and voice-to-chat.
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

  // Media Controls (Mute buttons)
  const btnMuteMic = document.getElementById('btnMuteMic');
  const btnMuteVideo = document.getElementById('btnMuteVideo');

  // AI Chat
  const aiChatMessages = document.getElementById('aiChatMessages');
  const aiChatInput = document.getElementById('aiChatInput');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnVoiceChat = document.getElementById('btnVoiceChat');
  const btnClearChat = document.getElementById('btnClearChat');

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

    // Process with AI Engine
    const aiMeta = aiEngine.processTranscript(sttEngine.transcriptHistory);
    if (aiMeta) {
      updateMetaUI(aiMeta);
    }
  };

  sttEngine.onStatusChange = (status) => {
    if (status === 'listening') {
      updateStatus(true, 'TRANSCRIBIENDO EN VIVO');
    }
  };

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

      // Also pause STT when mic is muted (so user noise doesn't get transcribed)
      // But we keep listening for system audio on desktop
      // On mobile, we pause completely since mic IS the source
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

      // Show video
      if (result.hasVideo) {
        const videoStream = mediaEngine.getVideoStream();
        if (videoStream) {
          captureVideo.srcObject = videoStream;
          captureVideo.classList.add('active');
        }
        capturePlaceholder.style.display = 'none';
      } else {
        capturePlaceholder.style.display = 'none';
      }

      sourceLabel.textContent = `Fuente: ${result.sourceLabel || 'Micrófono'}`;

      // AVISO: el navegador solo puede transcribir el micrófono real si usa Web Speech API local.
      // Si está activo /api/transcribe con Groq Whisper, no aplica la limitación.
      if (!mediaEngine.isMobile() && !sttEngine.isRealTimeTranscriptionActive) {
        addChatMessage('insight',
          '⚠ La transcripción en vivo en modo local solo puede "escuchar" tu micrófono. ' +
          'Si usas auriculares, la voz de los demás participantes no se transcribirá automáticamente en modo offline. ' +
          'Para transcribir a todos, usa los altavoces del dispositivo o configura GROQ_API_KEY en Vercel.'
        );
      }

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

      // Add chat message
      addChatMessage('ai', '🎙️ Captura iniciada. Estoy escuchando la reunión y analizando la conversación en tiempo real. Pregúntame lo que necesites.');

      // Listen for screen share ending
      if (mediaEngine.displayStream) {
        mediaEngine.displayStream.getVideoTracks().forEach(track => {
          track.onended = () => stopCapture();
        });
      }

    } catch (err) {
      console.error('Capture error:', err);
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
    capturePlaceholder.style.display = '';

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

    addChatMessage('ai', '⏹️ Captura detenida. Los archivos de audio y video se han descargado automáticamente.');
  };

  btnCapture.addEventListener('click', startCapture);
  if (btnPlaceholderStart) btnPlaceholderStart.addEventListener('click', startCapture);

  // ===== AI CHAT =====
  const sendChatMessage = async (text) => {
    if (!text || !text.trim()) return;
    const message = text.trim();

    // Add user message to chat
    addChatMessage('user', message);

    // Show a lightweight "typing" placeholder while we wait for the real AI
    const typingMsg = addChatMessage('ai', '…');

    const { text: response, source } = await aiEngine.respondToChatAsync(message, sttEngine.transcriptHistory);

    if (typingMsg) typingMsg.remove();
    addChatMessage('ai', response, source === 'fallback');
  };

  btnSendChat.addEventListener('click', () => {
    sendChatMessage(aiChatInput.value);
    aiChatInput.value = '';
  });

  aiChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage(aiChatInput.value);
      aiChatInput.value = '';
    }
  });

  // Chat tip click handlers (the initial tip buttons)
  aiChatMessages.addEventListener('click', (e) => {
    const tip = e.target.closest('.chat-tips li');
    if (tip) {
      sendChatMessage(tip.textContent);
    }
    // Copy button
    const copyBtn = e.target.closest('.chat-copy-btn');
    if (copyBtn) {
      const bubble = copyBtn.closest('.chat-bubble');
      if (bubble) {
        const text = bubble.querySelector('p') ? 
          Array.from(bubble.querySelectorAll('p')).map(p => p.textContent).join('\n') : 
          bubble.textContent;
        navigator.clipboard.writeText(text).catch(() => {});
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
        }, 2000);
      }
    }
  });

  // Clear chat
  if (btnClearChat) {
    btnClearChat.addEventListener('click', () => {
      aiChatMessages.innerHTML = `
        <div class="chat-msg chat-ai">
          <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
          <div class="chat-bubble">
            <p>Chat reiniciado. Sigo escuchando la reunión. ¿En qué puedo ayudarte?</p>
          </div>
        </div>
      `;
    });
  }

  // ===== VOICE-TO-CHAT =====
  // User can press and hold the mic button to speak a question to the AI
  // This uses a SEPARATE SpeechRecognition instance from the meeting transcription
  const initVoiceChat = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btnVoiceChat.style.display = 'none';
      return;
    }

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

      // Show interim in input
      if (interimText) {
        aiChatInput.value = interimText;
      }

      // Send final result
      if (finalText.trim()) {
        aiChatInput.value = '';
        sendChatMessage(finalText.trim());
      }
    };

    voiceChatRecognition.onend = () => {
      isVoiceChatting = false;
      btnVoiceChat.classList.remove('recording');
      aiChatInput.placeholder = 'Escribe o habla al copiloto...';
    };

    voiceChatRecognition.onerror = (e) => {
      console.warn('Voice chat error:', e.error);
      isVoiceChatting = false;
      btnVoiceChat.classList.remove('recording');
      aiChatInput.placeholder = 'Escribe o habla al copiloto...';
    };
  };

  initVoiceChat();

  btnVoiceChat.addEventListener('click', () => {
    if (!voiceChatRecognition) return;

    if (isVoiceChatting) {
      // Stop voice chat
      voiceChatRecognition.stop();
      isVoiceChatting = false;
      btnVoiceChat.classList.remove('recording');
      aiChatInput.placeholder = 'Escribe o habla al copiloto...';
    } else {
      // Start voice chat
      try {
        voiceChatRecognition.start();
        isVoiceChatting = true;
        btnVoiceChat.classList.add('recording');
        aiChatInput.placeholder = '🎤 Escuchando tu pregunta...';
        aiChatInput.value = '';
      } catch (e) {
        console.warn('Could not start voice chat:', e);
      }
    }
  });

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

  function addChatMessage(type, text, isFallback) {
    const msgDiv = document.createElement('div');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Convert **bold** markdown to <strong>
    const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    const fallbackTag = isFallback
      ? '<div class="chat-fallback-tag" title="IA en la nube no disponible: respuesta generada localmente por reglas."><i class="fa-solid fa-plug-circle-exclamation"></i> Modo local</div>'
      : '';

    if (type === 'user') {
      msgDiv.className = 'chat-msg chat-user';
      msgDiv.innerHTML = `
        <div class="chat-avatar"><i class="fa-solid fa-user"></i></div>
        <div class="chat-bubble">
          <p>${formatted}</p>
          <div class="chat-time">${time}</div>
        </div>
      `;
    } else if (type === 'insight') {
      msgDiv.className = 'chat-msg chat-insight';
      msgDiv.innerHTML = `
        <div class="chat-bubble">
          <p>${formatted}</p>
          <div class="chat-time">${time}</div>
        </div>
      `;
    } else {
      // AI message
      msgDiv.className = 'chat-msg chat-ai';
      msgDiv.innerHTML = `
        <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="chat-bubble">
          <p>${formatted}</p>
          ${fallbackTag}
          <button class="chat-copy-btn"><i class="fa-regular fa-copy"></i> Copiar</button>
          <div class="chat-time">${time}</div>
        </div>
      `;
    }

    aiChatMessages.appendChild(msgDiv);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    return msgDiv;
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
