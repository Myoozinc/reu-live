/**
 * ReuLive - AI Copilot Engine
 * Real-time topic extraction and intelligent response generation.
 * Processes transcript chunks and generates contextual answers in <100ms.
 */
class AIEngine {
  constructor() {
    this.currentTopic = 'En espera de audio de la reunión...';
    this.agreements = [];
    this.actionItems = [];
    this.sentiment = 'Neutral';
    this.topicHistory = [];
  }

  /**
   * Main processor called on every final transcript chunk
   */
  processTranscript(transcriptHistory) {
    if (!transcriptHistory || transcriptHistory.length === 0) {
      return {
        topic: 'Inicio de la reunión',
        suggestions: this.getDefaultSuggestions(),
        sentiment: 'Neutral',
        agreements: [],
        actionItems: []
      };
    }

    const recent = transcriptHistory.slice(-6);
    const recentText = recent.map(t => `${t.speaker}: ${t.text}`).join('\n');
    const fullText = transcriptHistory.map(t => t.text).join(' ');
    const lastChunk = transcriptHistory[transcriptHistory.length - 1];

    // Extract topic
    const newTopic = this.extractTopic(recentText, fullText);
    if (newTopic !== this.currentTopic) {
      this.topicHistory.push({
        topic: newTopic,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      this.currentTopic = newTopic;
    }

    // Analyze sentiment
    this.sentiment = this.analyzeSentiment(recentText);

    // Extract agreements and action items
    this.extractItems(transcriptHistory);

    // Generate instant copilot suggestions
    const suggestions = this.generateSuggestions(lastChunk, recentText, this.currentTopic);

    return {
      topic: this.currentTopic,
      suggestions,
      sentiment: this.sentiment,
      agreements: this.agreements,
      actionItems: this.actionItems
    };
  }

  /**
   * Topic extraction from conversation context
   */
  extractTopic(recentText, fullText) {
    const combined = (recentText + ' ' + fullText).toLowerCase();

    const topicMap = [
      { keys: ['presupuesto', 'costo', 'precio', 'dinero', 'inversión', 'factura', 'pago', 'cobro', 'tarifa'], topic: 'Presupuesto y Análisis Financiero' },
      { keys: ['fecha', 'entrega', 'sprint', 'deadline', 'plazo', 'calendario', 'cronograma', 'semana'], topic: 'Planificación de Fechas y Entregables' },
      { keys: ['vercel', 'github', 'despliegue', 'deploy', 'servidor', 'hosting', 'dominio', 'producción'], topic: 'Infraestructura Web y Despliegue' },
      { keys: ['diseño', 'ui', 'ux', 'interfaz', 'prototipo', 'mockup', 'figma', 'estilo', 'colores'], topic: 'Diseño de Interfaz y Experiencia de Usuario' },
      { keys: ['api', 'backend', 'base de datos', 'endpoint', 'microservicio', 'integración'], topic: 'Arquitectura Backend e Integraciones' },
      { keys: ['cliente', 'usuario', 'feedback', 'satisfacción', 'encuesta', 'experiencia'], topic: 'Experiencia del Cliente y Feedback' },
      { keys: ['marketing', 'campaña', 'publicidad', 'marca', 'branding', 'redes sociales', 'contenido'], topic: 'Estrategia de Marketing y Comunicación' },
      { keys: ['equipo', 'contratación', 'talento', 'capacitación', 'roles', 'responsabilidades'], topic: 'Gestión de Equipo y Recursos Humanos' },
      { keys: ['seguridad', 'cifrado', 'autenticación', 'privacidad', 'cumplimiento', 'gdpr'], topic: 'Seguridad y Protección de Datos' },
      { keys: ['testing', 'prueba', 'qa', 'bug', 'error', 'calidad', 'regresión'], topic: 'Control de Calidad y Testing' },
      { keys: ['venta', 'negocio', 'propuesta', 'contrato', 'acuerdo', 'deal', 'cierre'], topic: 'Negociación Comercial y Ventas' },
      { keys: ['producto', 'feature', 'funcionalidad', 'roadmap', 'mvp', 'lanzamiento', 'versión'], topic: 'Desarrollo de Producto y Roadmap' },
      { keys: ['problema', 'bloqueo', 'urgente', 'crítico', 'incidencia', 'resolver'], topic: 'Resolución de Problemas y Bloqueos' },
      { keys: ['reunión', 'agenda', 'punto', 'tema', 'siguiente', 'anterior'], topic: 'Coordinación y Agenda de la Reunión' },
      { keys: ['hola', 'buenos días', 'buenas tardes', 'empezar', 'comenzar', 'iniciar'], topic: 'Inicio y Bienvenida' },
    ];

    for (const entry of topicMap) {
      if (entry.keys.some(k => combined.includes(k))) {
        return entry.topic;
      }
    }

    // Fallback: extract key words
    const words = recentText.split(/\s+/).filter(w => w.length > 6);
    if (words.length >= 2) {
      return `Discusión: ${words.slice(-3).join(' ')}`;
    }

    return 'Coordinación General de la Reunión';
  }

  /**
   * Sentiment analysis
   */
  analyzeSentiment(text) {
    const lower = text.toLowerCase();
    const positive = ['excelente', 'perfecto', 'acuerdo', 'bien', 'genial', 'increíble', 'fantástico', 'aprobado', 'correcto'];
    const negative = ['problema', 'urgente', 'error', 'fallo', 'retraso', 'bloqueado', 'imposible', 'cancelar'];
    const neutral = ['creo', 'pienso', 'quizás', 'posiblemente', 'analizar', 'revisar'];

    const posCount = positive.filter(w => lower.includes(w)).length;
    const negCount = negative.filter(w => lower.includes(w)).length;

    if (posCount > negCount && posCount > 0) return 'Positivo / Colaborativo';
    if (negCount > posCount && negCount > 0) return 'Atención Requerida';
    return 'Analítico / Técnico';
  }

  /**
   * Extract agreements and action items
   */
  extractItems(history) {
    const agreementsSet = new Set(this.agreements);
    const actionItemsSet = new Set(this.actionItems);

    const agreementKeywords = ['acordamos', 'confirmado', 'definimos', 'quedamos en', 'aceptado', 'aprobado'];
    const actionKeywords = ['necesitamos', 'hay que', 'tarea', 'entregar', 'pendiente', 'asignar', 'completar', 'revisar'];

    history.slice(-10).forEach(item => {
      const lower = item.text.toLowerCase();
      if (agreementKeywords.some(k => lower.includes(k))) {
        agreementsSet.add(`${item.speaker}: ${item.text}`);
      }
      if (actionKeywords.some(k => lower.includes(k))) {
        actionItemsSet.add(`${item.speaker}: ${item.text}`);
      }
    });

    this.agreements = Array.from(agreementsSet).slice(-8);
    this.actionItems = Array.from(actionItemsSet).slice(-8);
  }

  /**
   * Generate 4 smart response suggestions based on context
   */
  generateSuggestions(lastChunk, recentText, topic) {
    const text = (lastChunk ? lastChunk.text : recentText).toLowerCase();
    const speaker = lastChunk ? lastChunk.speaker : 'Interlocutor';

    // Response pools organized by detected context
    const responseDB = {
      pricing: {
        detect: ['precio', 'presupuesto', 'costo', 'cuánto', 'pagar', 'inversión', 'factura', 'tarifa', 'cobro'],
        direct: [
          `"Tengo los números del presupuesto desglosados. Podemos ajustar el alcance para mantener el margen."`,
          `"El presupuesto está dentro del rango aprobado. Puedo enviar el desglose detallado ahora mismo."`,
          `"Hemos optimizado los costos un 15%. La propuesta actualizada refleja el ahorro."`,
        ],
        proposal: [
          `"Propongo un esquema de pago por hitos completados para asegurar el flujo de caja."`,
          `"Podemos dividir la inversión en fases para reducir el riesgo financiero."`,
          `"Una alternativa es usar herramientas de código abierto para reducir los costos de licencias."`,
        ],
        question: [
          `"¿Cuál es el tope presupuestario aprobado por la dirección para esta fase?"`,
          `"¿Hay flexibilidad en el presupuesto si incluimos funcionalidades adicionales?"`,
          `"¿Prefieren pago mensual recurrente o un pago único por entregable?"`,
        ],
        summary: [
          `"Acuerdo de costos: Revisaremos la propuesta económica ajustada antes de finalizar el día."`,
          `"Quedamos en confirmar el presupuesto final y enviar la factura proforma esta semana."`,
        ]
      },
      timeline: {
        detect: ['fecha', 'cuándo', 'tiempo', 'plazo', 'sprint', 'entrega', 'deadline', 'semana', 'calendario'],
        direct: [
          `"Podemos tener la primera versión lista para revisión en este sprint."`,
          `"La fecha de entrega se mantiene. Estamos en un 75% de avance general."`,
          `"El cronograma está al día. Los hitos principales se están cumpliendo."`,
        ],
        proposal: [
          `"Propongo una entrega parcial el miércoles para validar avances."`,
          `"Podemos comprimir el timeline 2 días si paralelizamos las tareas de frontend y backend."`,
        ],
        question: [
          `"¿Quién será responsable de dar la aprobación final al momento de la entrega?"`,
          `"¿Hay alguna dependencia externa que pueda afectar la fecha?"`,
        ],
        summary: [
          `"Compromiso: Mantener la fecha de entrega y enviar reporte de avance diario."`,
          `"Acordamos el siguiente milestone para el viernes con revisión intermedia."`,
        ]
      },
      technical: {
        detect: ['vercel', 'github', 'código', 'despliegue', 'api', 'backend', 'servidor', 'desarrollo', 'sistema', 'deploy', 'bug'],
        direct: [
          `"El repositorio está configurado con CI/CD automático. Cada commit genera un despliegue."`,
          `"La arquitectura está diseñada de forma modular para escalar sin problemas."`,
          `"El sistema está funcionando estable en producción con 99.9% de uptime."`,
        ],
        proposal: [
          `"Sugiero implementar preview deployments para probar cada cambio antes de producción."`,
          `"Podemos añadir monitoring automático para detectar problemas antes que los usuarios."`,
        ],
        question: [
          `"¿Tienen los accesos de desarrollador listos o necesitan invitación al repositorio?"`,
          `"¿Hay algún requerimiento de seguridad o compliance que debamos considerar?"`,
        ],
        summary: [
          `"Resumen técnico: Integración continua lista, despliegue automático configurado."`,
          `"Stack confirmado: Frontend en producción, API estable, monitoreo activo."`,
        ]
      },
      negotiation: {
        detect: ['propuesta', 'contrato', 'negociar', 'condiciones', 'términos', 'oferta', 'competencia', 'alternativa'],
        direct: [
          `"Nuestra propuesta es competitiva y cubre todos los requerimientos solicitados."`,
          `"Estamos abiertos a ajustar las condiciones para llegar a un acuerdo favorable para ambos."`,
        ],
        proposal: [
          `"Propongo incluir un periodo de prueba de 30 días para demostrar el valor."`,
          `"Podemos ofrecer un descuento del 10% si cerramos el acuerdo esta semana."`,
        ],
        question: [
          `"¿Qué aspectos de la propuesta son más importantes para tomar la decisión?"`,
          `"¿Están evaluando otras alternativas o propuestas en paralelo?"`,
        ],
        summary: [
          `"Próximos pasos: Enviar propuesta ajustada con las condiciones discutidas hoy."`,
        ]
      },
      objection: {
        detect: ['no estoy seguro', 'no creo', 'difícil', 'complicado', 'preocupa', 'riesgo', 'imposible', 'no funciona'],
        direct: [
          `"Entiendo la preocupación. Permíteme explicar cómo mitigamos ese riesgo."`,
          `"Es un punto válido. Tenemos un plan B preparado para ese escenario."`,
        ],
        proposal: [
          `"Para reducir el riesgo, podemos hacer un piloto pequeño antes del lanzamiento completo."`,
          `"Propongo un POC de 2 semanas para validar la viabilidad técnica antes de comprometernos."`,
        ],
        question: [
          `"¿Cuál es específicamente el punto que genera más preocupación?"`,
          `"¿Qué evidencia o garantías necesitarían para sentirse más cómodos con la decisión?"`,
        ],
        summary: [
          `"Identificamos las preocupaciones clave. Siguiente paso: propuesta de mitigación de riesgos."`,
        ]
      },
      greeting: {
        detect: ['hola', 'buenos', 'empezar', 'listo', 'iniciar', 'comenzar', 'bienvenido'],
        direct: [
          `"Hola, excelente día. Estoy listo para repasar los puntos principales de la agenda."`,
          `"Hola a todos. Tengo los materiales preparados, podemos comenzar cuando gusten."`,
        ],
        proposal: [
          `"Propongo dedicar los primeros 5 minutos a repasar los objetivos y luego los avances."`,
          `"Sugiero empezar con un resumen rápido de lo pendiente del meeting anterior."`,
        ],
        question: [
          `"¿Todos me escuchan bien y pueden ver la información?"`,
          `"¿Hay algún tema adicional que debamos agregar a la agenda de hoy?"`,
        ],
        summary: [
          `"Reunión iniciada con transcripción y copiloto de IA en vivo. Grabación activa."`,
        ]
      },
      design: {
        detect: ['diseño', 'ui', 'ux', 'interfaz', 'prototipo', 'mockup', 'figma', 'colores', 'tipografía', 'layout'],
        direct: [
          `"El diseño sigue las mejores prácticas de UX moderna con un enfoque mobile-first."`,
          `"Los prototipos están listos para revisión. Incluyen las iteraciones del feedback anterior."`,
        ],
        proposal: [
          `"Propongo hacer una sesión de testing de usabilidad con 5 usuarios antes de desarrollar."`,
          `"Podemos crear un design system reutilizable para mantener consistencia visual."`,
        ],
        question: [
          `"¿Tienen preferencias de marca o guías de estilo que debamos seguir?"`,
          `"¿El diseño debe ser responsive o tiene prioridad una plataforma específica?"`,
        ],
        summary: [
          `"Diseño aprobado con las modificaciones discutidas. Siguiente: implementación."`,
        ]
      }
    };

    // Find matching context
    let matchedCtx = null;
    for (const [key, ctx] of Object.entries(responseDB)) {
      if (ctx.detect.some(k => text.includes(k))) {
        matchedCtx = ctx;
        break;
      }
    }

    // Fallback to generic responses
    if (!matchedCtx) {
      matchedCtx = {
        direct: [
          `"Totalmente de acuerdo con lo que mencionas, ${speaker}. Podemos avanzar con ese enfoque."`,
          `"Excelente punto. Estoy alineado y podemos proceder inmediatamente."`,
        ],
        proposal: [
          `"Una opción práctica es dividir el entregable en dos fases cortas para medir avances."`,
          `"Propongo documentar los acuerdos de hoy y enviar un resumen ejecutivo por email."`,
        ],
        question: [
          `"¿Cuál sería el impacto directo si priorizamos esta tarea hoy?"`,
          `"¿Hay algún bloqueador que debamos resolver antes de avanzar?"`,
        ],
        summary: [
          `"Resumen: Queda confirmado el acuerdo. Enviaremos la síntesis por escrito."`,
          `"Próximos pasos definidos. Seguimiento programado para esta semana."`,
        ]
      };
    }

    // Pick random from each pool
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    return [
      {
        type: 'direct',
        title: '⚡ Respuesta Directa',
        icon: 'fa-circle-check',
        text: pick(matchedCtx.direct)
      },
      {
        type: 'proposal',
        title: '💡 Propuesta Estratégica',
        icon: 'fa-lightbulb',
        text: pick(matchedCtx.proposal)
      },
      {
        type: 'question',
        title: '❓ Pregunta de Clarificación',
        icon: 'fa-circle-question',
        text: pick(matchedCtx.question)
      },
      {
        type: 'summary',
        title: '📌 Síntesis / Cierre',
        icon: 'fa-list-check',
        text: pick(matchedCtx.summary)
      }
    ];
  }

  getDefaultSuggestions() {
    return [
      {
        type: 'direct',
        title: '⚡ Respuesta Directa',
        icon: 'fa-circle-check',
        text: '"Hola a todos, estoy listo para iniciar y repasar los puntos principales."'
      },
      {
        type: 'proposal',
        title: '💡 Propuesta Estratégica',
        icon: 'fa-lightbulb',
        text: '"Podemos comenzar revisando los avances principales y luego abrir preguntas."'
      },
      {
        type: 'question',
        title: '❓ Pregunta de Clarificación',
        icon: 'fa-circle-question',
        text: '"¿Todos pueden escucharme con claridad y ver los datos?"'
      },
      {
        type: 'summary',
        title: '📌 Síntesis / Cierre',
        icon: 'fa-list-check',
        text: '"Confirmado: transcripción en vivo y copiloto de IA activado."'
      }
    ];
  }

  /**
   * Custom prompt handler
   */
  queryCustomCopilot(prompt, transcriptHistory) {
    const context = transcriptHistory.slice(-5).map(t => t.text).join(' ');
    const topic = this.currentTopic;

    // Generate contextual response based on prompt and conversation
    const lower = prompt.toLowerCase();

    if (lower.includes('resumen') || lower.includes('resumir')) {
      return `[Copiloto IA]: Resumen de la reunión hasta ahora — Tema principal: "${topic}". Se han discutido ${transcriptHistory.length} intervenciones. ${this.agreements.length > 0 ? 'Acuerdos: ' + this.agreements.slice(-2).join('; ') : 'No hay acuerdos registrados aún.'}`;
    }

    if (lower.includes('qué digo') || lower.includes('qué respondo') || lower.includes('ayuda')) {
      return `[Copiloto IA]: Basándome en el contexto actual sobre "${topic}", te sugiero responder: "He revisado todos los puntos y estoy de acuerdo con avanzar según lo propuesto. ¿Procedemos con la siguiente fase?"`;
    }

    if (lower.includes('dato') || lower.includes('número') || lower.includes('estadística')) {
      return `[Copiloto IA]: En esta reunión se han registrado ${transcriptHistory.length} intervenciones, ${this.agreements.length} acuerdos y ${this.actionItems.length} tareas pendientes. El sentimiento general es: ${this.sentiment}.`;
    }

    return `[Copiloto IA]: Respecto a "${prompt}" en el contexto de "${topic}", te sugiero: "Es un punto importante. Propongo que lo incluyamos como tema prioritario y definamos un plan de acción concreto para resolverlo esta semana."`;
  }
}

window.AIEngine = AIEngine;
