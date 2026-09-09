/**
 * ReuLive - Robust Real-Time Speech-to-Text Engine
 * Uses native browser SpeechRecognition API with auto-restart.
 * Provides both interim (for subtitles) and final (for AI) results.
 */
class STTEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.language = 'es-ES';
    this.transcriptHistory = [];
    this.restartAttempts = 0;
    this.maxRestartAttempts = 50;
    
    // Callbacks
    this.onInterimResult = null;   // For live subtitles (partial text)
    this.onFinalResult = null;     // For AI processing (complete chunks)
    this.onStatusChange = null;

    // Speaker identification
    this.speakers = {
      interlocutor: 'Interlocutor',
      user: 'Tú'
    };

    this.onSpeakerNameUpdated = null;
    this.detectedAliases = {};
    this.nicknameDict = {
      'tina': 'Cristina', 'cristina': 'Tina',
      'clau': 'Claudia', 'claudia': 'Clau',
      'dani': 'Daniela', 'daniela': 'Dani',
      'pepe': 'José', 'jose': 'Pepe',
      'nacho': 'Ignacio', 'ignacio': 'Nacho',
      'paco': 'Francisco', 'pancho': 'Francisco', 'francisco': 'Paco',
      'lola': 'Dolores', 'dolores': 'Lola',
      'manu': 'Manuel', 'manuel': 'Manu',
      'alex': 'Alejandro', 'alejandro': 'Alex',
      'chema': 'José María',
      'gabi': 'Gabriela', 'gabriela': 'Gabi',
      'fer': 'Fernando', 'fernando': 'Fer',
      'sebas': 'Sebastián', 'sebastian': 'Sebas',
      'mati': 'Matías', 'matias': 'Mati',
      'nico': 'Nicolás', 'nicolas': 'Nico',
      'cami': 'Camila', 'camila': 'Cami',
      'vale': 'Valentina', 'valentina': 'Vale',
      'lu': 'Lucía', 'lucia': 'Lu'
    };

    this.lastSpeakerType = 'user';
    this.activeSpeaker = 'user';
    this.lastSpeechTime = 0;
    this.isRealTimeTranscriptionActive = false;
    this.audioQueue = [];
    this.isProcessingQueue = false;

    this.initRecognition();
  }

  reset() {
    this.transcriptHistory = [];
    this.audioQueue = [];
    this.isProcessingQueue = false;
    this.restartAttempts = 0;
    this.lastSpeechTime = 0;
    this.speakers = {
      interlocutor: 'Interlocutor',
      user: 'Tú'
    };
    this.detectedAliases = {};
    console.log('[STTEngine] Historial y estado reiniciados limpiamente.');
  }

  setActiveSpeaker(type) {
    if (type === 'user' || type === 'interlocutor') {
      this.activeSpeaker = type;
      this.lastSpeakerType = type;
    }
  }

  setSpeakerName(name) {
    if (!name) return;
    const cleanName = name.trim();
    this.speakers.interlocutor = cleanName;
    this.transcriptHistory.forEach(chunk => {
      if (chunk.speakerType === 'interlocutor') {
        chunk.speaker = cleanName;
      }
    });
    if (this.onSpeakerNameUpdated) {
      this.onSpeakerNameUpdated('interlocutor', cleanName, null, this.transcriptHistory);
    }
  }

  /**
   * Receives real-time audio chunk from mediaEngine.js ({ blob, speakerType }).
   * Converts to base64 and POSTs to /api/transcribe (Whisper vía Groq).
   * Automatically falls back to browser Web Speech API if /api/transcribe fails or 503.
   */
  async handleAudioChunk({ blob, speakerType }) {
    this.audioQueue.push({ blob, speakerType });
    if (!this.isProcessingQueue) {
      this.processAudioQueue();
    }
  }

  async processAudioQueue() {
    if (this.audioQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const item = this.audioQueue.shift();

    if (this.onInterimResult) {
      this.onInterimResult('Transcribiendo audio con Whisper...');
    }

    try {
      const base64 = await this.blobToBase64(item.blob);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: item.blob.type || 'audio/webm'
        })
      });

      if (this.onInterimResult) {
        this.onInterimResult('');
      }

      if (res.ok) {
        const data = await res.json();
        const text = (data.text || '').trim();

        if (text.length > 0) {
          this.isRealTimeTranscriptionActive = true;
          // Stop browser Web Speech API if it was running as fallback to avoid duplicate entries
          if (this.recognition && this.isListening) {
            try { this.recognition.stop(); } catch (e) {}
          }

          const now = Date.now();
          const speakerType = item.speakerType || 'interlocutor';
          this.detectAndApplySpeakerNames(text, speakerType);
          const speakerName = this.speakers[speakerType] || (speakerType === 'user' ? 'Tú' : 'Interlocutor');

          const chunk = {
            id: now,
            speaker: speakerName,
            speakerType: speakerType,
            text: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            provider: 'whisper'
          };

          this.transcriptHistory.push(chunk);

          if (this.onFinalResult) {
            this.onFinalResult(chunk);
          }
        }
      } else {
        console.warn('/api/transcribe fallback active:', res.status);
        this.isRealTimeTranscriptionActive = false;
        // Fall back to Web Speech API
        if (!this.isListening) {
          this.startListening();
        }
      }
    } catch (err) {
      console.warn('Error sending chunk to /api/transcribe, using fallback:', err);
      this.isRealTimeTranscriptionActive = false;
      if (this.onInterimResult) this.onInterimResult('');
      if (!this.isListening) {
        this.startListening();
      }
    }

    // Process next queued chunk
    setTimeout(() => this.processAudioQueue(), 100);
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || '';
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.restartAttempts = 0;
      if (this.onStatusChange) this.onStatusChange('listening');
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      // Show interim results as subtitles
      if (interimTranscript && this.onInterimResult) {
        this.onInterimResult(interimTranscript);
      }

      // Process final results for AI
      if (finalTranscript.trim().length > 0) {
        const now = Date.now();
        const text = finalTranscript.trim();

        // Simple speaker detection heuristic
        const speakerType = this.detectSpeaker(text, now);
        this.detectAndApplySpeakerNames(text, speakerType);
        const speakerName = this.speakers[speakerType] || 'Participante';
        this.lastSpeechTime = now;
        this.lastSpeakerType = speakerType;

        const chunk = {
          id: now,
          speaker: speakerName,
          speakerType: speakerType,
          text: text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };

        this.transcriptHistory.push(chunk);

        // Clear subtitles and show final
        if (this.onInterimResult) this.onInterimResult('');
        if (this.onFinalResult) this.onFinalResult(chunk);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      // Auto-restart on recoverable errors
      if (['no-speech', 'network', 'aborted'].includes(event.error) && this.isListening) {
        this.scheduleRestart();
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if we're supposed to be listening
      if (this.isListening) {
        this.scheduleRestart();
      } else {
        if (this.onStatusChange) this.onStatusChange('stopped');
      }
    };
  }

  detectSpeaker(text, now) {
    const lower = text.toLowerCase();
    
    // Explicit user markers
    if (lower.startsWith('yo ') || lower.includes('mi opinión') || lower.includes('creo que') || lower.startsWith('bueno, yo') || lower.includes('por mi parte')) {
      return 'user';
    }

    // Explicit interlocutor questions / references
    if (lower.startsWith('ustedes ') || lower.startsWith('usted ') || lower.includes('qué opinan ustedes') || lower.includes('les gusta a ustedes')) {
      // If the phrase is asking the group, this is typical of whoever is presenting
      return this.activeSpeaker || 'user';
    }

    // Default to the currently selected or active speaker
    return this.activeSpeaker || this.lastSpeakerType || 'user';
  }

  scheduleRestart() {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.warn('Max restart attempts reached.');
      return;
    }
    this.restartAttempts++;
    const delay = Math.min(300 * this.restartAttempts, 2000);
    setTimeout(() => {
      if (this.isListening && this.recognition) {
        try {
          this.recognition.start();
        } catch (e) {
          // Already started, ignore
        }
      }
    }, delay);
  }

  startListening() {
    if (!this.recognition) {
      console.error('SpeechRecognition not available.');
      return false;
    }
    this.isListening = true;
    this.restartAttempts = 0;
    try {
      this.recognition.start();
      return true;
    } catch (err) {
      console.log('Recognition already started or restarting...');
      return true;
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }

  /**
   * Smart Named Entity & Nickname Diarization
   * Detects when someone says a person's name or nickname, e.g.:
   * - "Hola Tina", "Hola Claudia", "Oye Marcos", "Gracias Andrea"
   * - "Me llamo Cristina pero me dicen Tina" -> binds alias and updates
   * - "Mi nombre es Carlos" / "Me llamo Roberto"
   */
  detectAndApplySpeakerNames(text, speakerType) {
    if (!text) return;
    const cleanText = text.trim();

    // 1. Check self-introductions with nicknames:
    // e.g. "me llamo Cristina pero me dicen Tina" or "me dicen Tina pero me llamo Cristina"
    const nicknamePattern1 = /(?:me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)\s+pero\s+(?:me dicen|dime)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i;
    const matchNick1 = cleanText.match(nicknamePattern1);
    if (matchNick1) {
      const realName = this.capitalizeWord(matchNick1[1]);
      const nickname = this.capitalizeWord(matchNick1[2]);
      this.detectedAliases[nickname.toLowerCase()] = realName;
      this.detectedAliases[realName.toLowerCase()] = nickname;
      const targetRole = speakerType === 'user' ? 'user' : 'interlocutor';
      this.updateSpeakerNameRetroactively(targetRole, `${realName} (${nickname})`, nickname);
      return;
    }

    const nicknamePattern2 = /(?:me dicen|dime)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)\s+pero\s+(?:me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i;
    const matchNick2 = cleanText.match(nicknamePattern2);
    if (matchNick2) {
      const nickname = this.capitalizeWord(matchNick2[1]);
      const realName = this.capitalizeWord(matchNick2[2]);
      this.detectedAliases[nickname.toLowerCase()] = realName;
      this.detectedAliases[realName.toLowerCase()] = nickname;
      const targetRole = speakerType === 'user' ? 'user' : 'interlocutor';
      this.updateSpeakerNameRetroactively(targetRole, `${realName} (${nickname})`, nickname);
      return;
    }

    // 2. Direct greetings: "Hola Tina", "Hola Claudia", "Buenos días Carlos", "Oye Marcos", "Qué opinas Tina"
    const commonNonNames = new Set([
      'todos', 'todas', 'equipo', 'gente', 'amigo', 'amiga', 'compañeros', 'grupo', 'chicos', 'chicas',
      'bien', 'bueno', 'gracias', 'hola', 'día', 'tarde', 'noche', 'aquí', 'hoy', 'ahí', 'nuevo', 'otra',
      'reunión', 'zoom', 'audio', 'sistema', 'favor', 'claro', 'cierto', 'verdad'
    ]);

    const greetingPatterns = [
      /(?:hola|buenos días|buenas tardes|buenas noches)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i,
      /(?:oye|dime|cuéntame|gracias|qué opinas|cómo estás|un gusto|bienvenido|bienvenida)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i,
      /(?:hablo con|estoy con|habla con)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i
    ];

    for (const pat of greetingPatterns) {
      const match = cleanText.match(pat);
      if (match && match[1]) {
        const rawName = match[1];
        const lowerName = rawName.toLowerCase();
        if (rawName.length >= 3 && !commonNonNames.has(lowerName)) {
          let resolvedName = this.capitalizeWord(rawName);
          const alias = this.detectedAliases[lowerName] || this.nicknameDict[lowerName];
          if (alias && alias.toLowerCase() !== lowerName) {
            resolvedName = `${this.capitalizeWord(alias)} (${resolvedName})`;
          }

          // If speaker was 'user', they addressed the interlocutor!
          if (speakerType === 'user') {
            this.updateSpeakerNameRetroactively('interlocutor', resolvedName, rawName);
            return;
          } else if (speakerType === 'interlocutor') {
            // Interlocutor greeted user by name
            this.updateSpeakerNameRetroactively('user', resolvedName, rawName);
            return;
          }
        }
      }
    }

    // 3. Simple self introduction: "Mi nombre es [Nombre]" or "Me llamo [Nombre]"
    const introPattern = /(?:mi nombre es|me llamo|yo soy)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i;
    const matchIntro = cleanText.match(introPattern);
    if (matchIntro && matchIntro[1]) {
      const rawName = matchIntro[1];
      const lowerName = rawName.toLowerCase();
      if (rawName.length >= 3 && !commonNonNames.has(lowerName)) {
        const resolvedName = this.capitalizeWord(rawName);
        const targetRole = speakerType === 'user' ? 'user' : 'interlocutor';
        this.updateSpeakerNameRetroactively(targetRole, resolvedName);
      }
    }
  }

  updateSpeakerNameRetroactively(role, newName, nickname = null) {
    if (!newName) return;
    this.speakers[role] = newName;

    // Retroactively update earlier chunks
    let updatedCount = 0;
    this.transcriptHistory.forEach(chunk => {
      if (chunk.speakerType === role) {
        chunk.speaker = newName;
        updatedCount++;
      }
    });

    console.log(`[STTEngine] Identificado ${role} -> "${newName}". ${updatedCount} intervenciones actualizadas retroactivamente.`);

    if (this.onSpeakerNameUpdated) {
      this.onSpeakerNameUpdated(role, newName, nickname, this.transcriptHistory);
    }
  }

  capitalizeWord(w) {
    if (!w) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  getRecentContext(n = 8) {
    return this.transcriptHistory.slice(-n);
  }

  getFullTranscriptText() {
    return this.transcriptHistory.map(t => `${t.speaker}: ${t.text}`).join('\n');
  }
}

window.STTEngine = STTEngine;
