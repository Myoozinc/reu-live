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
   * REAL AI: Call the /api/chat serverless proxy (Groq/OpenRouter). Falls back
   * to the local keyword-based engine if the backend has no API key configured,
   * the request fails, or the browser is offline.
   * Returns { text, source: 'ai' | 'fallback' }
   */
  async respondToChatAsync(userMessage, transcriptHistory) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage,
          transcript: transcriptHistory,
          topic: this.currentTopic
        })
      });

      if (!res.ok) {
        // 503 = sin API key configurada en el servidor; otros = error puntual
        return { text: this.respondToChat(userMessage, transcriptHistory), source: 'fallback' };
      }

      const data = await res.json();
      if (data && data.reply) {
        return { text: data.reply, source: 'ai' };
      }
      return { text: this.respondToChat(userMessage, transcriptHistory), source: 'fallback' };
    } catch (err) {
      // Sin conexión, endpoint no desplegado, etc. -> nunca dejar al usuario sin respuesta
      console.warn('AI backend unavailable, using local fallback:', err);
      return { text: this.respondToChat(userMessage, transcriptHistory), source: 'fallback' };
    }
  }

  /**
   * MAIN CHAT METHOD (fallback, 100% local, sin IA real): Respond to user
   * question based on transcript context using keyword matching.
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
   * Generate a smart response suggestion based on the last spoken chunk
   */
  generateResponseSuggestion(lastChunk, recentText, topic) {
    if (!lastChunk || !lastChunk.text) {
      return 'Aún no hay suficiente contexto en la transcripción para sugerir una respuesta.';
    }

    const text = lastChunk.text.trim();
    const speaker = lastChunk.speaker || 'Interlocutor';
    const lower = text.toLowerCase();

    const snippet = this.getSubjectSnippet(text);

    let option1 = '';
    let option2 = '';
    let option3 = '';

    if (lower.includes('?') || lower.includes('qué') || lower.includes('cómo') || lower.includes('opinan') || lower.includes('gusta')) {
      option1 = `**Opción 1 (Afirmativa):** "Sí, totalmente de acuerdo con lo que mencionas sobre ${snippet}. Me parece una excelente idea."`;
      option2 = `**Opción 2 (Analítica):** "Respecto a ${snippet}, creo que es un punto interesante que vale la pena evaluar en detalle."`;
      option3 = `**Opción 3 (Pregunta de seguimiento):** "¿Qué otros factores o detalles consideran importantes sobre este tema?"`;
    } else {
      option1 = `**Opción 1 (Alineación):** "Entendido, ${speaker}. Coincido con lo que acabas de mencionar sobre ${snippet}."`;
      option2 = `**Opción 2 (Propuesta):** "Podemos tomar eso como punto de partida y avanzar con los siguientes pasos."`;
      option3 = `**Opción 3 (Síntesis):** "Perfecto, queda confirmado ese punto para el informe de la reunión."`;
    }

    return `Basándome en lo último dicho por **${speaker}** ("${text}"):\n\n${option1}\n\n${option2}\n\n${option3}`;
  }

  getSubjectSnippet(text) {
    const clean = text.replace(/[?¿!¡]/g, '').trim();
    const words = clean.split(/\s+/);
    if (words.length <= 6) return `"${clean}"`;
    return `"${words.slice(-6).join(' ')}"`;
  }

  /**
   * Dynamic Topic Extractor: Extracts key subject phrases from actual spoken text
   * instead of relying on hardcoded static dictionaries.
   */
  extractTopic(recentText, fullText) {
    const combined = (recentText + ' ' + fullText);

    const stopWords = new Set([
      'hola', 'bueno', 'esto', 'esta', 'este', 'una', 'un', 'unos', 'unas', 'prueba', 'entonces',
      'gracias', 'quisiera', 'hablar', 'poco', 'que', 'para', 'con', 'por', 'los', 'las', 'del',
      'pero', 'mas', 'más', 'nada', 'pues', 'como', 'sobre', 'todo', 'bien', 'siento', 'veo',
      'creo', 'dice', 'dijo', 'hacer', 'muy', 'ustedes', 'gusta', 'opinan', 'estoy', 'esta',
      'siento', 'sabes', 'saben', 'usted', 'tener', 'tenemos', 'tambien', 'también'
    ]);

    const words = combined.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]+/g) || [];
    const keywords = [];
    const seen = new Set();

    words.forEach(w => {
      const lower = w.toLowerCase();
      if (w.length >= 4 && !stopWords.has(lower) && !seen.has(lower)) {
        seen.add(lower);
        // Capitalize nicely
        keywords.push(w[0].toUpperCase() + w.slice(1));
      }
    });

    if (keywords.length > 0) {
      const mainSubjects = keywords.slice(-3);
      return mainSubjects.join(' / ');
    }

    return 'Conversación en vivo';
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
