/**
 * ReuLive - Real-Time Speech-to-Text & Voice Activity Engine
 * Continuous multi-browser STT with speaker diarization & instant triggers.
 */

class STTEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.language = 'es-ES';
    this.transcriptHistory = [];
    
    this.onTranscriptChunk = null;
    this.onStatusChange = null;

    // Speaker Profiles & Identification
    this.speakers = {
      zoom: 'Hablante 1 (Interlocutor)',
      user: 'Tú'
    };

    this.initBrowserSpeech();
  }

  setSpeakerName(type, name) {
    if (this.speakers[type]) {
      this.speakers[type] = name;
    }
  }

  initBrowserSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API no disponible en este navegador.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;
    this.recognition.maxAlternatives = 1;

    let interimSpan = '';

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStatusChange) this.onStatusChange('listening');
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptSegment;
        } else {
          interimSpan = transcriptSegment;
        }
      }

      if (finalTranscript.trim().length > 0) {
        const text = finalTranscript.trim();
        
        // Speaker Diarization Heuristic
        const speakerType = this.detectSpeakerType(text);
        const speakerName = this.speakers[speakerType] || 'Participante';

        const chunk = {
          id: Date.now(),
          speaker: speakerName,
          speakerType: speakerType,
          text: text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        
        this.transcriptHistory.push(chunk);

        if (this.onTranscriptChunk) {
          this.onTranscriptChunk(chunk);
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Error en SpeechRecognition:', event.error);
      if ((event.error === 'no-speech' || event.error === 'network') && this.isListening) {
        setTimeout(() => {
          try { this.recognition.start(); } catch (e) {}
        }, 300);
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        setTimeout(() => {
          try { this.recognition.start(); } catch (e) {}
        }, 200);
      } else {
        if (this.onStatusChange) this.onStatusChange('stopped');
      }
    };
  }

  detectSpeakerType(text) {
    // If text contains self-referential markers, tag as user, otherwise interlocutor
    const lower = text.toLowerCase();
    if (lower.startsWith('yo ') || lower.startsWith('hola, yo') || lower.includes('mi opinión')) {
      return 'user';
    }
    return 'zoom';
  }

  startListening() {
    this.isListening = true;
    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (err) {
        console.log('Recognition ya iniciado o reiniciando...');
      }
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }

  /**
   * Manual Audio Chunk Injector (para mensajes rápidos o prueba de voz)
   */
  injectSpeechChunk(text, speakerType = 'zoom') {
    const chunk = {
      id: Date.now(),
      speaker: this.speakers[speakerType] || (speakerType === 'user' ? 'Tú' : 'Interlocutor'),
      speakerType: speakerType,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    this.transcriptHistory.push(chunk);
    if (this.onTranscriptChunk) {
      this.onTranscriptChunk(chunk);
    }
  }
}

window.STTEngine = STTEngine;
