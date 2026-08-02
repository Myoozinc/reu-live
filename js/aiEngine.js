/**
 * ReuLive - Conversational AI Chat Engine
 * Interprets meeting transcription in real-time and responds to user questions.
 * Replaces the old suggestion-card system with intelligent chat.
 */
class AIEngine {
  constructor() {
    this.currentTopic = 'En espera de audio de la reunión...';
    this.agreements = [];
    this.actionItems = [];
    this.sentiment = 'Neutral';
    this.topicHistory = [];
    this.lastInsightChunkCount = 0;
    this.insightInterval = 5; // Generate auto-insight every N transcript chunks
  }

  /**
   * Process transcript and extract metadata (topic, sentiment, items)
   * Called on every new transcript chunk
   */
  processTranscript(transcriptHistory) {
    if (!transcriptHistory || transcriptHistory.length === 0) return null;

    const recent = transcriptHistory.slice(-6);
    const recentText = recent.map(t => `${t.speaker}: ${t.text}`).join('\n');
    const fullText = transcriptHistory.map(t => t.text).join(' ');

    // Extract topic
    const newTopic = this.extractTopic(recentText, fullText);
    if (newTopic !== this.currentTopic) {
      this.topicHistory.push({
        topic: newTopic,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      this.currentTopic = newTopic;
    }

    this.sentiment = this.analyzeSentiment(recentText);
    this.extractItems(transcriptHistory);

    return {
      topic: this.currentTopic,
      sentiment: this.sentiment,
      agreements: this.agreements,
      actionItems: this.actionItems
    };
  }

  /**
   * Should we generate an auto-insight message?
   * Returns insight text or null
   */
  checkAutoInsight(transcriptHistory) {
    if (!transcriptHistory || transcriptHistory.length === 0) return null;
    
    const chunkCount = transcriptHistory.length;
    
    // Generate insight every N chunks
    if (chunkCount - this.lastInsightChunkCount >= this.insightInterval) {
      this.lastInsightChunkCount = chunkCount;
      return this.generateAutoInsight(transcriptHistory);
    }
    
    return null;
  }

  /**
   * Generate automatic insight based on transcript
   */
  generateAutoInsight(history) {
    const recent = history.slice(-8);
    const recentText = recent.map(t => t.text).join(' ').toLowerCase();
    const topic = this.currentTopic;
    const count = history.length;
    
    const insights = [];

    // Topic change insight
    if (this.topicHistory.length > 1) {
      const prev = this.topicHistory[this.topicHistory.length - 2];
      insights.push(`📋 El tema cambió de "${prev.topic}" a "${topic}".`);
    }

    // Agreement detection
    if (this.agreements.length > 0) {
      insights.push(`🤝 Se detectó un acuerdo: "${this.agreements[this.agreements.length - 1].substring(0, 80)}..."`);
    }

    // Activity insight
    if (count >= 10) {
      insights.push(`📊 Se han registrado ${count} intervenciones. Tema actual: "${topic}". Sentimiento: ${this.sentiment}.`);
    }

    // Keyword-based insights
    if (recentText.includes('urgente') || recentText.includes('problema') || recentText.includes('error')) {
      insights.push(`⚠️ Se detectaron temas urgentes o problemas en la conversación reciente. Presta atención.`);
    }

    if (recentText.includes('pregunta') || recentText.includes('opinión') || recentText.includes('qué piensas')) {
      insights.push(`❓ Parece que te están pidiendo tu opinión. ¿Quieres que te sugiera una respuesta?`);
    }

    if (insights.length > 0) {
      return insights[Math.floor(Math.random() * insights.length)];
    }

    return `💡 Tema actual: "${topic}" | ${count} intervenciones | Sentimiento: ${this.sentiment}`;
  }

  /**
   * MAIN CHAT METHOD: Respond to user question based on transcript context
   */
  respondToChat(userMessage, transcriptHistory) {
    const lower = userMessage.toLowerCase().trim();
    const history = transcriptHistory || [];
    const recentText = history.slice(-10).map(t => `${t.speaker}: ${t.text}`).join('\n');
    const fullText = history.map(t => `${t.speaker}: ${t.text}`).join('\n');
    const topic = this.currentTopic;
    const lastChunk = history.length > 0 ? history[history.length - 1] : null;

    // Empty transcript
    if (history.length === 0) {
      return 'Aún no hay transcripción de la reunión. Inicia la captura para que pueda analizar la conversación y ayudarte.';
    }

    // === SUMMARY REQUESTS ===
    if (lower.includes('resumen') || lower.includes('resumir') || lower.includes('resúmeme') || lower.includes('qué han dicho') || lower.includes('qué se ha dicho')) {
      return this.generateSummary(history);
    }

    // === TOPIC QUERIES ===
    if (lower.includes('de qué') || lower.includes('tema') || lower.includes('de que hablan') || lower.includes('qué están hablando') || lower.includes('qué se habla')) {
      return `El tema principal de la reunión ahora es: **"${topic}"**.\n\n` +
        `Últimas intervenciones:\n` +
        history.slice(-3).map(t => `• **${t.speaker}** (${t.timestamp}): "${t.text}"`).join('\n');
    }

    // === RESPONSE SUGGESTIONS ===
    if (lower.includes('qué digo') || lower.includes('qué respondo') || lower.includes('respuesta') || lower.includes('cómo respondo') || lower.includes('qué puedo decir') || lower.includes('sugiéreme')) {
      return this.generateResponseSuggestion(lastChunk, recentText, topic);
    }

    // === AGREEMENTS ===
    if (lower.includes('acuerdo') || lower.includes('acordamos') || lower.includes('qué se acordó')) {
      if (this.agreements.length === 0) {
        return 'No se han detectado acuerdos formales todavía en la reunión.';
      }
      return `**Acuerdos detectados hasta ahora:**\n\n` +
        this.agreements.map((a, i) => `${i + 1}. ${a}`).join('\n');
    }

    // === TASKS / ACTION ITEMS ===
    if (lower.includes('tarea') || lower.includes('pendiente') || lower.includes('action') || lower.includes('qué hay que hacer')) {
      if (this.actionItems.length === 0) {
        return 'No se han detectado tareas o pendientes explícitos hasta ahora.';
      }
      return `**Tareas pendientes detectadas:**\n\n` +
        this.actionItems.map((t, i) => `${i + 1}. ${t}`).join('\n');
    }

    // === WHO SAID / SPEAKER QUERIES ===
    if (lower.includes('quién dijo') || lower.includes('quien dijo') || lower.includes('quién mencionó')) {
      const searchTerm = lower.replace(/quién dijo|quien dijo|quién mencionó/g, '').trim();
      const matches = history.filter(t => t.text.toLowerCase().includes(searchTerm));
      if (matches.length === 0) {
        return `No encontré menciones de "${searchTerm}" en la transcripción.`;
      }
      return `**Menciones de "${searchTerm}":**\n\n` +
        matches.slice(-5).map(t => `• **${t.speaker}** (${t.timestamp}): "${t.text}"`).join('\n');
    }

    // === STATS ===
    if (lower.includes('estadística') || lower.includes('dato') || lower.includes('número') || lower.includes('cuántas')) {
      const speakers = {};
      history.forEach(t => { speakers[t.speaker] = (speakers[t.speaker] || 0) + 1; });
      const speakerStats = Object.entries(speakers).map(([k, v]) => `• ${k}: ${v} intervenciones`).join('\n');
      return `**Estadísticas de la reunión:**\n\n` +
        `• Total de intervenciones: ${history.length}\n` +
        `• Tema actual: ${topic}\n` +
        `• Sentimiento: ${this.sentiment}\n` +
        `• Acuerdos: ${this.agreements.length}\n` +
        `• Tareas: ${this.actionItems.length}\n\n` +
        `**Por participante:**\n${speakerStats}`;
    }

    // === LAST THING SAID ===
    if (lower.includes('qué fue lo último') || lower.includes('último que dij') || lower.includes('qué acaban de decir')) {
      const last = history.slice(-3);
      return `**Últimas intervenciones:**\n\n` +
        last.map(t => `• **${t.speaker}** (${t.timestamp}): "${t.text}"`).join('\n');
    }

    // === SENTIMENT ===
    if (lower.includes('sentimiento') || lower.includes('ambiente') || lower.includes('tono') || lower.includes('cómo va')) {
      return `El sentimiento actual de la reunión es: **${this.sentiment}**.\n\n` +
        `Tema: "${topic}".\n` +
        (this.sentiment.includes('Atención') 
          ? 'Se detectaron indicadores de preocupación o urgencia en la conversación.'
          : 'La conversación fluye de manera productiva.');
    }

    // === HELP ===
    if (lower.includes('ayuda') || lower.includes('help') || lower.includes('qué puedo preguntarte') || lower.includes('qué sabes hacer')) {
      return '**Puedo ayudarte con:**\n\n' +
        '• 📋 **"Dame un resumen"** → Resumen de toda la reunión\n' +
        '• 🎯 **"¿De qué están hablando?"** → Tema actual\n' +
        '• 💬 **"¿Qué debo responder?"** → Sugerencia de respuesta\n' +
        '• 🤝 **"¿Qué acuerdos hay?"** → Acuerdos detectados\n' +
        '• ✅ **"¿Qué tareas hay?"** → Pendientes y action items\n' +
        '• 📊 **"Dame estadísticas"** → Datos de la reunión\n' +
        '• 🔍 **"¿Quién dijo [algo]?"** → Buscar en la transcripción\n' +
        '• 😊 **"¿Cómo va el ambiente?"** → Sentimiento actual';
    }

    // === GENERIC / CONTEXTUAL RESPONSE ===
    return this.generateContextualResponse(userMessage, recentText, topic, lastChunk);
  }

  /**
   * Generate a full meeting summary
   */
  generateSummary(history) {
    const topic = this.currentTopic;
    const speakers = {};
    history.forEach(t => { speakers[t.speaker] = (speakers[t.speaker] || 0) + 1; });
    const mainSpeaker = Object.entries(speakers).sort((a, b) => b[1] - a[1])[0];

    let summary = `**📋 Resumen de la reunión hasta ahora:**\n\n`;
    summary += `• **Tema principal:** ${topic}\n`;
    summary += `• **Intervenciones totales:** ${history.length}\n`;
    summary += `• **Participante más activo:** ${mainSpeaker ? mainSpeaker[0] + ' (' + mainSpeaker[1] + ' intervenciones)' : 'N/A'}\n`;
    summary += `• **Sentimiento general:** ${this.sentiment}\n\n`;

    if (this.topicHistory.length > 1) {
      summary += `**Temas discutidos:**\n`;
      this.topicHistory.slice(-5).forEach(t => {
        summary += `• ${t.time} — ${t.topic}\n`;
      });
      summary += '\n';
    }

    // Last key points
    summary += `**Últimos puntos relevantes:**\n`;
    const keyChunks = history.slice(-5);
    keyChunks.forEach(t => {
      summary += `• **${t.speaker}:** "${t.text.substring(0, 100)}${t.text.length > 100 ? '...' : ''}"\n`;
    });

    if (this.agreements.length > 0) {
      summary += `\n**Acuerdos:** ${this.agreements.length} detectados\n`;
    }
    if (this.actionItems.length > 0) {
      summary += `**Tareas:** ${this.actionItems.length} pendientes\n`;
    }

    return summary;
  }

  /**
   * Generate a smart response suggestion
   */
  generateResponseSuggestion(lastChunk, recentText, topic) {
    if (!lastChunk) return 'Aún no hay suficiente contexto para sugerir una respuesta.';

    const text = lastChunk.text.toLowerCase();
    const speaker = lastChunk.speaker;

    let intro = `Basándome en lo que dijo **${speaker}** ("${lastChunk.text.substring(0, 80)}..."), te sugiero:\n\n`;

    // Context-specific response pools
    if (text.includes('precio') || text.includes('presupuesto') || text.includes('costo')) {
      return intro +
        `**Opción 1 (Directa):** "Tengo los números del presupuesto listos. Podemos ajustar el alcance para mantener el margen."\n\n` +
        `**Opción 2 (Propuesta):** "Propongo un esquema de pago por hitos para asegurar el flujo de caja."\n\n` +
        `**Opción 3 (Pregunta):** "¿Cuál es el tope presupuestario aprobado para esta fase?"`;
    }

    if (text.includes('fecha') || text.includes('cuándo') || text.includes('entrega') || text.includes('plazo')) {
      return intro +
        `**Opción 1:** "La primera versión estará lista para revisión en este sprint."\n\n` +
        `**Opción 2:** "Propongo una entrega parcial el miércoles para validar avances."\n\n` +
        `**Opción 3:** "¿Quién dará la aprobación final al momento de la entrega?"`;
    }

    if (text.includes('problema') || text.includes('error') || text.includes('no funciona') || text.includes('urgente')) {
      return intro +
        `**Opción 1:** "Entiendo la preocupación. Tenemos un plan B preparado para ese escenario."\n\n` +
        `**Opción 2:** "Propongo un POC de 2 semanas para validar la viabilidad antes de comprometernos."\n\n` +
        `**Opción 3:** "¿Cuál es específicamente el punto que genera más preocupación?"`;
    }

    if (text.includes('opinión') || text.includes('qué piensas') || text.includes('qué opinas')) {
      return intro +
        `**Opción 1:** "En mi opinión, la mejor ruta es avanzar con el enfoque modular que hemos discutido."\n\n` +
        `**Opción 2:** "Creo que deberíamos priorizar la estabilidad antes que las nuevas funcionalidades."\n\n` +
        `**Opción 3:** "Coincido con el punto anterior. ¿Podemos definir los próximos pasos concretos?"`;
    }

    // Generic response
    return intro +
      `**Opción 1 (Acuerdo):** "Totalmente de acuerdo, ${speaker}. Podemos avanzar con ese enfoque."\n\n` +
      `**Opción 2 (Propuesta):** "Una alternativa sería dividir el entregable en dos fases para medir avances."\n\n` +
      `**Opción 3 (Pregunta):** "¿Cuál sería el impacto si priorizamos esta tarea hoy?"`;
  }

  /**
   * Generic contextual response for free-form questions
   */
  generateContextualResponse(userMessage, recentText, topic, lastChunk) {
    const lower = userMessage.toLowerCase();

    // Try to find relevant info in transcript
    const keywords = lower.split(/\s+/).filter(w => w.length > 3);
    const matches = [];
    
    if (lastChunk) {
      const lastText = lastChunk.text.toLowerCase();
      for (const kw of keywords) {
        if (lastText.includes(kw)) {
          matches.push(lastChunk);
          break;
        }
      }
    }

    if (matches.length > 0) {
      return `Respecto a tu pregunta sobre "${userMessage}":\n\n` +
        `En la reunión, **${matches[0].speaker}** mencionó: "${matches[0].text}"\n\n` +
        `Tema actual: "${topic}". ¿Quieres que te sugiera cómo responder a esto?`;
    }

    return `Sobre "${userMessage}" en el contexto de la reunión ("${topic}"):\n\n` +
      `La conversación reciente no menciona directamente ese tema, pero puedo ayudarte a:\n` +
      `• Generar una respuesta relacionada\n` +
      `• Buscar si se mencionó antes\n` +
      `• Darte un resumen actualizado\n\n` +
      `¿Qué prefieres?`;
  }

  // ===== Existing helper methods =====

  extractTopic(recentText, fullText) {
    const combined = (recentText + ' ' + fullText).toLowerCase();

    const topicMap = [
      { keys: ['presupuesto', 'costo', 'precio', 'dinero', 'inversión', 'factura', 'pago'], topic: 'Presupuesto y Análisis Financiero' },
      { keys: ['fecha', 'entrega', 'sprint', 'deadline', 'plazo', 'calendario', 'cronograma'], topic: 'Planificación de Fechas y Entregables' },
      { keys: ['vercel', 'github', 'despliegue', 'deploy', 'servidor', 'hosting'], topic: 'Infraestructura Web y Despliegue' },
      { keys: ['diseño', 'ui', 'ux', 'interfaz', 'prototipo', 'mockup'], topic: 'Diseño de Interfaz y UX' },
      { keys: ['api', 'backend', 'base de datos', 'endpoint', 'integración'], topic: 'Arquitectura Backend e Integraciones' },
      { keys: ['cliente', 'usuario', 'feedback', 'satisfacción'], topic: 'Experiencia del Cliente y Feedback' },
      { keys: ['marketing', 'campaña', 'publicidad', 'marca', 'redes sociales'], topic: 'Marketing y Comunicación' },
      { keys: ['equipo', 'contratación', 'talento', 'roles'], topic: 'Gestión de Equipo y RRHH' },
      { keys: ['seguridad', 'cifrado', 'autenticación', 'privacidad'], topic: 'Seguridad y Protección de Datos' },
      { keys: ['testing', 'prueba', 'qa', 'bug', 'error'], topic: 'Control de Calidad y Testing' },
      { keys: ['venta', 'propuesta', 'contrato', 'negocio'], topic: 'Negociación Comercial y Ventas' },
      { keys: ['producto', 'feature', 'roadmap', 'mvp', 'lanzamiento'], topic: 'Desarrollo de Producto' },
      { keys: ['problema', 'bloqueo', 'urgente', 'crítico'], topic: 'Resolución de Problemas' },
      { keys: ['hola', 'buenos días', 'buenas tardes', 'empezar'], topic: 'Inicio y Bienvenida' },
    ];

    for (const entry of topicMap) {
      if (entry.keys.some(k => combined.includes(k))) return entry.topic;
    }

    const words = recentText.split(/\s+/).filter(w => w.length > 6);
    if (words.length >= 2) return `Discusión: ${words.slice(-3).join(' ')}`;

    return 'Coordinación General de la Reunión';
  }

  analyzeSentiment(text) {
    const lower = text.toLowerCase();
    const positive = ['excelente', 'perfecto', 'acuerdo', 'bien', 'genial', 'aprobado'];
    const negative = ['problema', 'urgente', 'error', 'fallo', 'retraso', 'bloqueado'];

    const posCount = positive.filter(w => lower.includes(w)).length;
    const negCount = negative.filter(w => lower.includes(w)).length;

    if (posCount > negCount && posCount > 0) return 'Positivo / Colaborativo';
    if (negCount > posCount && negCount > 0) return 'Atención Requerida';
    return 'Analítico / Técnico';
  }

  extractItems(history) {
    const agreementsSet = new Set(this.agreements);
    const actionItemsSet = new Set(this.actionItems);

    const agreementKw = ['acordamos', 'confirmado', 'definimos', 'quedamos en', 'aprobado'];
    const actionKw = ['necesitamos', 'hay que', 'tarea', 'entregar', 'pendiente', 'completar'];

    history.slice(-10).forEach(item => {
      const lower = item.text.toLowerCase();
      if (agreementKw.some(k => lower.includes(k))) agreementsSet.add(`${item.speaker}: ${item.text}`);
      if (actionKw.some(k => lower.includes(k))) actionItemsSet.add(`${item.speaker}: ${item.text}`);
    });

    this.agreements = Array.from(agreementsSet).slice(-8);
    this.actionItems = Array.from(actionItemsSet).slice(-8);
  }
}

window.AIEngine = AIEngine;
