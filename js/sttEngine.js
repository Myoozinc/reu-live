/**
 * ReuLive - Speech-to-Text Engine & Live Transcript Processor
 * Production Speech Recognition for Zoom, System Audio & Microphone streams.
 */

class STTEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.language = 'es-ES';
    this.transcriptHistory = [];
    
    this.onTranscriptChunk = null;
    this.onStatusChange = null;

    this.initBrowserSpeech();
  }

  initBrowserSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API no disponible en este navegador. Se utilizará entrada manual y procesamiento de audio.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;

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
        }
      }

      if (finalTranscript.trim().length > 0) {
        const chunk = {
          id: Date.now(),
          speaker: 'Audio de la Reunión',
          speakerType: 'zoom',
          text: finalTranscript.trim(),
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
      if (event.error === 'no-speech' && this.isListening) {
        try { this.recognition.start(); } catch (e) {}
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          console.log('Reintento de reconocimiento diferido.');
        }
      } else {
        if (this.onStatusChange) this.onStatusChange('stopped');
      }
    };
  }

  startListening() {
    if (this.recognition && !this.isListening) {
      this.isListening = true;
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('Error al iniciar SpeechRecognition:', err);
      }
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }

  addManualChunk(text, speaker = 'Tu Voz / Micrófono', speakerType = 'user') {
    const chunk = {
      id: Date.now(),
      speaker: speaker,
      speakerType: speakerType,
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    this.transcriptHistory.push(chunk);
    if (this.onTranscriptChunk) {
      this.onTranscriptChunk(chunk);
    }
  }
}

window.STTEngine = STTEngine;
