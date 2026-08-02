/**
 * ReuLive - AI Intelligence Engine
 * Handles Real-Time Main Topic Extraction, Sentiment Analysis,
 * and Dynamic AI Copilot User Response Suggestions.
 */

class AIEngine {
  constructor() {
    this.currentTopic = "En espera de conversación...";
    this.topicsHistory = [];
    this.agreements = [];
    this.actionItems = [];
    this.sentiment = "Neutral";
  }

  /**
   * Process latest transcript text and update meeting topic & suggestions
   */
  processTranscript(transcriptHistory) {
    if (!transcriptHistory || transcriptHistory.length === 0) {
      return {
        topic: "Inicio de la reunión",
        suggestions: this.getDefaultSuggestions(),
        sentiment: "Neutral"
      };
    }

    // Extract recent combined text
    const recentText = transcriptHistory.slice(-5).map(t => t.text).join(' ');
    const fullText = transcriptHistory.map(t => t.text).join(' ');

    // 1. Topic Heuristic & NLP Extraction
    this.currentTopic = this.extractMainTopic(recentText, fullText);

    // 2. Sentiment Analysis
    this.sentiment = this.analyzeSentiment(recentText);

    // 3. Extract Decisions & Action Items
    this.extractItems(transcriptHistory);

    // 4. Generate 4 Live Suggested Responses for the user
    const suggestions = this.generateCopilotResponses(recentText, this.currentTopic);

    return {
      topic: this.currentTopic,
      suggestions,
      sentiment: this.sentiment,
      agreements: this.agreements,
      actionItems: this.actionItems
    };
  }

  extractMainTopic(recentText, fullText) {
    const lower = (recentText + ' ' + fullText).toLowerCase();

    if (lower.includes('vercel') || lower.includes('github') || lower.includes('despliegue') || lower.includes('servidor')) {
      return "Arquitectura de Software, Despliegue en Vercel & Repositorio Git";
    }
    if (lower.includes('presupuesto') || lower.includes('costo') || lower.includes('precio') || lower.includes('dinero')) {
      return "Análisis de Presupuesto, Costos y Recursos Financieros";
    }
    if (lower.includes('diseño') || lower.includes('ui') || lower.includes('interfaz') || lower.includes('pantalla')) {
      return "Diseño de Interfaz de Usuario y Experiencia (UI/UX)";
    }
    if (lower.includes('api') || lower.includes('backend') || lower.includes('base de datos') || lower.includes('websocket')) {
      return "Integración Backend, APIs y Streaming en Tiempo Real";
    }
    if (lower.includes('fecha') || lower.includes('entrega') || lower.includes('sprint') || lower.includes('plazo')) {
      return "Planificación de Entregables, Cronograma & Fechas del Sprint";
    }
    if (lower.includes('zoom') || lower.includes('grabación') || lower.includes('audio') || lower.includes('micrófono')) {
      return "Captura de Audio de Dispositivo & Integración con Zoom";
    }

    // Default dynamic summary fallback
    const words = recentText.split(' ').filter(w => w.length > 5);
    if (words.length >= 2) {
      return `Discusión de ${words.slice(-3).join(' ')}`;
    }

    return "Estrategia General y Coordinación del Proyecto";
  }

  analyzeSentiment(text) {
    const lower = text.toLowerCase();
    if (lower.includes('excelente') || lower.includes('perfecto') || lower.includes('bien') || lower.includes('acuerdo')) {
      return "Colaborativo / Positivo";
    }
    if (lower.includes('problema') || lower.includes('error') || lower.includes('urgente') || lower.includes('latencia')) {
      return "Atención Requerida";
    }
    return "Analítico / Técnico";
  }

  extractItems(history) {
    const agreementsSet = new Set(this.agreements);
    const actionItemsSet = new Set(this.actionItems);

    history.forEach(item => {
      const lower = item.text.toLowerCase();
      if (lower.includes('acordamos') || lower.includes('excelente estrategia') || lower.includes('fijar') || lower.includes('definir')) {
        agreementsSet.add(item.text);
      }
      if (lower.includes('necesitamos') || lower.includes('tarea') || lower.includes('entregar') || lower.includes('hacer')) {
        actionItemsSet.add(item.text);
      }
    });

    this.agreements = Array.from(agreementsSet).slice(-5);
    this.actionItems = Array.from(actionItemsSet).slice(-5);
  }

  /**
   * Generates 4 context-aware live response cards for the user
   */
  generateCopilotResponses(recentText, topic) {
    const lower = recentText.toLowerCase();

    // 1. Respuesta Directa / Técnica
    let direct = '"Entendido. Coincido con ese enfoque y podemos proceder de forma inmediata para optimizar los tiempos de ejecución."';
    if (lower.includes('vercel') || lower.includes('github')) {
      direct = '"Conectemos el repositorio de GitHub con Vercel directamente para tener despliegues automáticos en cada commit."';
    } else if (lower.includes('latencia') || lower.includes('tiempo real')) {
      direct = '"Podemos optimizar la latencia usando almacenamiento en caché ligero y procesamiento asíncrono."';
    } else if (lower.includes('presupuesto')) {
      direct = '"Tengo los números preliminares listos y podemos ajustar la asignación para mantenernos dentro del margen."';
    }

    // 2. Propuesta / Alternativa
    let proposal = '"Una alternativa eficiente es dividir la entrega en dos etapas: primero el MVP funcional y luego las mejoras avanzadas."';
    if (lower.includes('aws') || lower.includes('servidor')) {
      proposal = '"En lugar de configurar un servidor desde cero, podemos desplegar la app web en Vercel en menos de 2 minutos."';
    } else if (lower.includes('audio') || lower.includes('zoom')) {
      proposal = '"Sugeriría usar la Web Display Media API para capturar el audio nativo de la ventana de Zoom sin instalar programas extra."';
    }

    // 3. Pregunta Clave / Estratégica
    let question = '"¿Cuál es la prioridad principal que debemos validar primero con los usuarios clave?"';
    if (lower.includes('entregables') || lower.includes('sprint')) {
      question = '"¿Quién será la persona encargada de realizar la revisión final y aprobación del sprint?"';
    } else if (lower.includes('tecnología') || lower.includes('api')) {
      question = '"¿Existe alguna restricción de seguridad o permisos que debamos considerar antes de integrar la API?"';
    }

    // 4. Resumen / Cierre
    let summary = `"Para resumen de este punto sobre ${topic}: podemos tomar este acuerdo y avanzar al siguiente tema."`;
    if (lower.includes('viernes') || lower.includes('plazo')) {
      summary = '"Resumen: Haremos el push a GitHub hoy mismo y dejaremos el despliegue listo antes de la fecha límite."';
    }

    return [
      {
        type: 'direct',
        title: 'Respuesta Directa',
        icon: 'fa-circle-check',
        text: direct
      },
      {
        type: 'proposal',
        title: 'Propuesta / Alternativa',
        icon: 'fa-lightbulb',
        text: proposal
      },
      {
        type: 'question',
        title: 'Pregunta Clave',
        icon: 'fa-circle-question',
        text: question
      },
      {
        type: 'summary',
        title: 'Resumen de Cierre',
        icon: 'fa-list-check',
        text: summary
      }
    ];
  }

  getDefaultSuggestions() {
    return [
      {
        type: 'direct',
        title: 'Respuesta Directa',
        icon: 'fa-circle-check',
        text: '"Hola a todos, estoy listo para iniciar y repasar los puntos principales de la orden del día."'
      },
      {
        type: 'proposal',
        title: 'Propuesta / Alternativa',
        icon: 'fa-lightbulb',
        text: '"Podemos iniciar revisando los avances del último sprint y luego abrir espacio para preguntas."'
      },
      {
        type: 'question',
        title: 'Pregunta Clave',
        icon: 'fa-circle-question',
        text: '"¿Todos pueden escuchar mi audio con claridad y ver la pantalla compartida?"'
      },
      {
        type: 'summary',
        title: 'Resumen de Cierre',
        icon: 'fa-list-check',
        text: '"Confirmado, tenemos la grabación activada y el copiloto de inteligencia artificial listo."'
      }
    ];
  }

  /**
   * Handle Custom Secret Prompt to AI Copilot
   */
  async queryCustomCopilot(prompt, fullTranscript) {
    // Simulates an immediate AI response tailored to user query
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`[Copiloto AI]: Para responder a "${prompt}", te sugiero mencionar: "En relación a ese punto, los datos indican que podemos proceder con el despliegue automatizado manteniendo el control de calidad en GitHub."`);
      }, 600);
    });
  }
}

window.AIEngine = AIEngine;
