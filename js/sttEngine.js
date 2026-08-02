/**
 * ReuLive - Speech-to-Text Engine & Live Transcript Processor
 * Handles browser SpeechRecognition API and simulated real-time Zoom streams.
 */

class STTEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.language = 'es-ES'; // Default Spanish, supports en-US
    this.transcriptHistory = [];
    
    this.onTranscriptChunk = null;
    this.onStatusChange = null;

    this.demoInterval = null;
    this.isDemoMode = false;

    this.initBrowserSpeech();
  }

  initBrowserSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not supported natively in this browser.');
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
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptSegment;
        } else {
          interimTranscript += transcriptSegment;
        }
      }

      if (finalTranscript.trim().length > 0) {
        const chunk = {
          id: Date.now(),
          speaker: 'Zoom / Participante',
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
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'no-speech' && this.isListening) {
        // Auto-restart continuous listening
        try { this.recognition.start(); } catch (e) {}
      }
    };

    this.recognition.onend = () => {
      if (this.isListening && !this.isDemoMode) {
        // Automatically restart speech recognition for continuous meeting capture
        try {
          this.recognition.start();
        } catch (e) {
          console.log('Recognition restart deferred.');
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
        console.warn('Recognition start caught error:', err);
      }
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    this.isDemoMode = false;
  }

  /**
   * Simulated Live Zoom Meeting Audio Stream
   * Runs a realistic 2-speaker tech/project meeting in Spanish to demonstrate live topic extraction & AI copilot
   */
  startDemoMeetingStream() {
    this.isDemoMode = true;
    this.isListening = true;

    const sampleScript = [
      {
        speaker: 'Carlos (PM Zoom)',
        speakerType: 'zoom',
        text: 'Bienvenidos a todos a la reunión. El objetivo principal de hoy es definir la arquitectura de software y los entregables para la entrega del sprint.'
      },
      {
        speaker: 'Tú (Micrófono)',
        speakerType: 'user',
        text: 'Hola Carlos. Sí, estuve revisando el backend y tenemos dos opciones: despliegue serverless en Vercel o contenedores Docker en AWS.'
      },
      {
        speaker: 'Sofia (Tech Lead Zoom)',
        speakerType: 'zoom',
        text: 'Vercel nos dará despliegue continuo instantáneo con repositorios de GitHub. ¿Cómo manejaremos la latencia de las llamadas en tiempo real?'
      },
      {
        speaker: 'Carlos (PM Zoom)',
        speakerType: 'zoom',
        text: 'Buena pregunta Sofia. Necesitamos asegurarnos de que la integración con la API de IA responda en menos de 500 milisegundos durante la llamada.'
      },
      {
        speaker: 'Tú (Micrófono)',
        speakerType: 'user',
        text: 'Podemos implementar almacenamiento en caché para las respuestas más comunes y streaming con WebSockets para la transcripción en vivo.'
      },
      {
        speaker: 'Sofia (Tech Lead Zoom)',
        speakerType: 'zoom',
        text: 'Me parece una excelente estrategia. ¿Podemos fijar el presupuesto de infraestructura antes del viernes?'
      }
    ];

    let index = 0;

    // Send first line immediately
    const sendLine = () => {
      const line = sampleScript[index % sampleScript.length];
      const chunk = {
        id: Date.now(),
        speaker: line.speaker,
        speakerType: line.speakerType,
        text: line.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };

      this.transcriptHistory.push(chunk);

      if (this.onTranscriptChunk) {
        this.onTranscriptChunk(chunk);
      }

      index++;
    };

    sendLine();
    this.demoInterval = setInterval(sendLine, 5500);
  }
}

window.STTEngine = STTEngine;
