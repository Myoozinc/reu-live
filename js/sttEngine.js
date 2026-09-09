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

    this.lastSpeakerType = 'user';
    this.activeSpeaker = 'user';
    this.lastSpeechTime = 0;
    this.isRealTimeTranscriptionActive = false;
    this.audioQueue = [];
    this.isProcessingQueue = false;

    this.initRecognition();
  }

  setActiveSpeaker(type) {
    if (type === 'user' || type === 'interlocutor') {
      this.activeSpeaker = type;
      this.lastSpeakerType = type;
    }
  }

  setSpeakerName(name) {
    this.speakers.interlocutor = name || 'Interlocutor';
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
          const speakerName = this.speakers[item.speakerType] || (item.speakerType === 'user' ? 'Tú' : 'Interlocutor');

          const chunk = {
            id: now,
            speaker: speakerName,
            speakerType: item.speakerType || 'interlocutor',
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

  getRecentContext(n = 8) {
    return this.transcriptHistory.slice(-n);
  }

  getFullTranscriptText() {
    return this.transcriptHistory.map(t => `${t.speaker}: ${t.text}`).join('\n');
  }
}

window.STTEngine = STTEngine;
