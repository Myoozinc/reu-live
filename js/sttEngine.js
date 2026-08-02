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

    this.lastSpeakerType = 'interlocutor';
    this.lastSpeechTime = 0;
    this.silenceGapMs = 2000; // Gap to potentially switch speaker

    this.initRecognition();
  }

  setSpeakerName(name) {
    this.speakers.interlocutor = name || 'Interlocutor';
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
    // If there was a long silence gap, might be a different speaker
    const gap = now - this.lastSpeechTime;
    
    // Self-referential markers -> user
    if (lower.startsWith('yo ') || lower.includes('mi opinión') || lower.includes('creo que') || lower.startsWith('bueno, yo')) {
      return 'user';
    }
    
    // If gap is large, alternate speaker
    if (gap > this.silenceGapMs && this.lastSpeakerType === 'user') {
      return 'interlocutor';
    }
    if (gap > this.silenceGapMs && this.lastSpeakerType === 'interlocutor') {
      return 'user';
    }
    
    return this.lastSpeakerType;
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
