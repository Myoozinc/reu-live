/**
 * ReuLive - Conversational AI Chat Engine
 * Interprets meeting transcription in real-time and responds to user questions.
 * Replaces the old suggestion-card system with intelligent chat.
 */
class AIEngine {
  constructor() {
    this.currentTopic = 'En espera de audio de la reunión...';
    this.agreements = [];
    this.detailedAgreements = [];
    this.actionItems = [];
    this.detailedActionItems = [];
    this.sentiment = 'Neutral';
    this.meetingIntensity = 'Baja / Distendida';
    this.meetingTone = 'Coordinación General';
    this.topicHistory = [];
    this.lastInsightChunkCount = 0;
    this.insightInterval = 5;
    this.detailedMetrics = null;
  }

  reset() {
    this.currentTopic = 'En espera de audio de la reunión...';
    this.agreements = [];
    this.detailedAgreements = [];
    this.actionItems = [];
    this.detailedActionItems = [];
    this.sentiment = 'Neutral';
    this.meetingIntensity = 'Baja / Distendida';
    this.meetingTone = 'Coordinación General';
    this.topicHistory = [];
    this.lastInsightChunkCount = 0;
    this.detailedMetrics = null;
    console.log('[AIEngine] Estado de IA y analítica reiniciados limpiamente.');
  }

  /**
   * Process transcript and extract metadata (topic, sentiment, intensity, tone, items, metrics)
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
    this.analyzeIntensityAndTone(transcriptHistory);
    this.extractItems(transcriptHistory);
    const metrics = this.calculateDetailedMetrics(transcriptHistory);

    return {
      topic: this.currentTopic,
      sentiment: this.sentiment,
      intensity: this.meetingIntensity,
      tone: this.meetingTone,
      agreements: this.agreements,
      detailedAgreements: this.detailedAgreements,
      actionItems: this.actionItems,
      detailedActionItems: this.detailedActionItems,
      metrics
    };
  }

  /**
   * Fetches real-time structured Copilot suggestions from /api/chat using full transcript
   * Always connected to the entire conversation history!
   */
  async fetchLiveCopilot(transcriptHistory) {
    if (!transcriptHistory || transcriptHistory.length === 0) {
      return this.getLocalCopilotFallback(transcriptHistory);
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'copilot',
          transcript: transcriptHistory,
          topic: this.currentTopic
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.copilot) {
          const c = data.copilot;
          if (c.topic) this.currentTopic = c.topic;
          return {
            topic: c.topic || this.currentTopic,
            summary: c.summary || 'Conversación en curso',
            direct_response: c.direct_response || 'De acuerdo, podemos profundizar en ese punto.',
            proposal: c.proposal || 'Propongo definir los siguientes pasos concretos.',
            question: c.question || '¿Qué otros aspectos consideran prioritarios?',
            source: data.provider || 'ai'
          };
        }
      }
    } catch (err) {
      console.warn('Live copilot backend request error, using local generator:', err);
    }

    return this.getLocalCopilotFallback(transcriptHistory);
  }

  getLocalCopilotFallback(history) {
    const lastChunk = history && history.length > 0 ? history[history.length - 1] : null;
    const text = lastChunk ? lastChunk.text : '';
    const speaker = lastChunk ? lastChunk.speaker : 'el interlocutor';
    const snippet = text ? this.getSubjectSnippet(text) : 'el tema actual';

    let directResponse = `Totalmente de acuerdo con lo que acaba de plantear ${speaker} sobre ${snippet}.`;
    let proposal = `Propongo consolidar los puntos principales de ${snippet} para llegar a un acuerdo.`;
    let question = `¿Qué opinan ustedes sobre este aspecto de ${snippet}?`;

    // Adapt by Intensity
    if (this.meetingIntensity && (this.meetingIntensity.includes('Alta') || this.meetingIntensity.includes('Crítica'))) {
      directResponse = `Entiendo la importancia y urgencia de lo que menciona ${speaker}. Podemos priorizarlo y darle salida inmediata.`;
      proposal = `Sugiero aislar este punto crítico sobre ${snippet} y definir los responsables directos para resolverlo hoy.`;
      question = `¿Cuál es el bloqueo principal ahora mismo y qué recurso específico se necesita para destrabarlo?`;
    } else if (this.meetingTone === 'Técnico & Arquitectura') {
      directResponse = `Alineado con el planteamiento técnico sobre ${snippet}. Es una solución sólida y mantenible.`;
      proposal = `Propongo validar esta integración en staging antes de promoverla a producción para evitar regresiones.`;
      question = `¿Cuáles son los requerimientos de latencia o dependencias críticas para implementar este cambio?`;
    } else if (this.meetingTone === 'Negociación & Acuerdos') {
      directResponse = `El planteamiento de ${speaker} sobre ${snippet} es un buen punto de partida. Busquemos un acuerdo ganar-ganar.`;
      proposal = `Propongo un esquema de trabajo por hitos verificables para asegurar el cumplimiento de ambas partes.`;
      question = `¿Qué condiciones o plazos consideran prioritarios para cerrar este acuerdo en esta misma llamada?`;
    }

    return {
      topic: this.currentTopic || 'Conversación en vivo',
      summary: text ? `Debatiendo sobre ${snippet} (${this.meetingTone} · ${this.meetingIntensity})` : 'En espera de intervenciones en la reunión...',
      direct_response: directResponse,
      proposal: proposal,
      question: question,
      source: 'local'
    };
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
    const agreementKw = ['acordamos', 'confirmado', 'definimos', 'quedamos en', 'aprobado', 'cerramos', 'pactado'];
    const actionKw = ['necesitamos', 'hay que', 'tarea', 'entregar', 'pendiente', 'completar', 'responsable', 'asignar'];

    const newAgreements = [];
    const newDetailedAgreements = [];
    const newActionItems = [];
    const newDetailedActionItems = [];

    history.forEach((item, index) => {
      const lower = item.text.toLowerCase();
      const isAgreement = agreementKw.some(k => lower.includes(k));
      const isAction = actionKw.some(k => lower.includes(k));

      if (isAgreement) {
        const textSummary = `${item.speaker}: ${item.text}`;
        newAgreements.push(textSummary);

        let priority = 'Estratégica';
        if (lower.includes('inmediato') || lower.includes('hoy') || lower.includes('ya') || lower.includes('urgente')) {
          priority = 'Alta / Inmediata';
        } else if (lower.includes('semana') || lower.includes('luego') || lower.includes('próximo')) {
          priority = 'Media / Operativa';
        }

        newDetailedAgreements.push({
          id: `agr_${index}_${item.id || Date.now()}`,
          title: item.text.length > 70 ? item.text.substring(0, 70) + '...' : item.text,
          speaker: item.speaker,
          timestamp: item.timestamp || '00:00',
          priority: priority,
          context: item.text,
          status: 'Compromiso en firme'
        });
      }

      if (isAction) {
        const textSummary = `${item.speaker}: ${item.text}`;
        newActionItems.push(textSummary);

        let priority = 'Media / Operativa';
        if (lower.includes('urgente') || lower.includes('asap') || lower.includes('crítico')) {
          priority = 'Alta / Crítica';
        }

        newDetailedActionItems.push({
          id: `act_${index}_${item.id || Date.now()}`,
          title: item.text.length > 70 ? item.text.substring(0, 70) + '...' : item.text,
          speaker: item.speaker,
          timestamp: item.timestamp || '00:00',
          priority: priority,
          context: item.text,
          status: 'Pendiente de ejecución'
        });
      }
    });

    this.agreements = newAgreements.slice(-10);
    this.detailedAgreements = newDetailedAgreements.slice(-10);
    this.actionItems = newActionItems.slice(-10);
    this.detailedActionItems = newDetailedActionItems.slice(-10);
  }

  /**
   * Technical Analytical Metrics & Speaker Interventions Breakdown
   * Computes Tú vs Interlocutores participation, words, WPM, and technical depth.
   */
  calculateDetailedMetrics(history = []) {
    if (!history || history.length === 0) {
      return {
        totalInterventions: 0,
        userInterventions: 0,
        interlocutorInterventions: 0,
        userRatio: 50,
        interlocutorRatio: 50,
        userWords: 0,
        interlocutorWords: 0,
        totalWords: 0,
        wpm: 0,
        technicalDepth: 'General / Estratégica',
        technicalTermsFound: [],
        technicalScore: 0,
        conversationalBalance: 'Inicio de sesión',
        speakers: {}
      };
    }

    let userInterventions = 0;
    let interlocutorInterventions = 0;
    let userWords = 0;
    let interlocutorWords = 0;
    const speakers = {};

    history.forEach(chunk => {
      const words = (chunk.text || '').trim().split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const isUser = chunk.speakerType === 'user';

      if (isUser) {
        userInterventions++;
        userWords += wordCount;
      } else {
        interlocutorInterventions++;
        interlocutorWords += wordCount;
      }

      const spk = chunk.speaker || (isUser ? 'Tú' : 'Interlocutor');
      if (!speakers[spk]) {
        speakers[spk] = { name: spk, count: 0, words: 0, isUser };
      }
      speakers[spk].count++;
      speakers[spk].words += wordCount;
    });

    const totalWords = userWords + interlocutorWords;
    const userRatio = totalWords > 0 ? Math.round((userWords / totalWords) * 100) : 50;
    const interlocutorRatio = 100 - userRatio;

    // Estimate minutes elapsed
    let elapsedMinutes = 1;
    if (history.length >= 2) {
      const firstTime = history[0].id || 0;
      const lastTime = history[history.length - 1].id || 0;
      if (lastTime > firstTime) {
        elapsedMinutes = Math.max(1, (lastTime - firstTime) / 60000);
      }
    }
    const wpm = Math.round(totalWords / elapsedMinutes);

    // Technical depth analysis
    const technicalVocabulary = [
      'arquitectura', 'backend', 'frontend', 'api', 'endpoint', 'servidor', 'base de datos', 'despliegue',
      'deploy', 'github', 'vercel', 'producción', 'testing', 'código', 'seguridad', 'latencia',
      'algoritmo', 'token', 'autenticación', 'ssl', 'kpi', 'conversión', 'roi', 'ebitda', 'sprint',
      'roadmap', 'infraestructura', 'nube', 'docker', 'ci/cd', 'microservicio', 'staging', 'queries',
      'framework', 'librería', 'compilación', 'bug', 'cache', 'devops', 'react', 'node', 'redis'
    ];

    const fullTextLower = history.map(t => t.text).join(' ').toLowerCase();
    const termsFound = technicalVocabulary.filter(term => fullTextLower.includes(term));
    const termCount = termsFound.length;

    let technicalDepth = 'General / Estratégica';
    if (termCount >= 5) {
      technicalDepth = 'Alta / Especializada';
    } else if (termCount >= 2) {
      technicalDepth = 'Media / Aplicada';
    }

    // Conversational Balance
    let conversationalBalance = 'Equilibrado / Diálogo Fluido';
    if (userRatio > 65) {
      conversationalBalance = 'Tú Lideras la Exposición';
    } else if (userRatio < 35) {
      conversationalBalance = 'Escucha Activa / Interlocutor Presenta';
    }

    const metrics = {
      totalInterventions: history.length,
      userInterventions,
      interlocutorInterventions,
      userRatio,
      interlocutorRatio,
      userWords,
      interlocutorWords,
      totalWords,
      wpm,
      technicalDepth,
      technicalTermsFound: termsFound,
      technicalScore: Math.min(100, Math.round((termCount / 8) * 100)),
      conversationalBalance,
      speakers
    };

    this.detailedMetrics = metrics;
    return metrics;
  }

  /**
   * Meeting Intensity & Tone Detection
   * Evaluates conversational tension, urgency, and semantic domain.
   */
  analyzeIntensityAndTone(history = []) {
    if (!history || history.length === 0) {
      this.meetingIntensity = 'Baja / Distendida';
      this.meetingTone = 'Coordinación General';
      return { intensity: this.meetingIntensity, tone: this.meetingTone };
    }

    const recent = history.slice(-8);
    const recentText = recent.map(t => t.text).join(' ').toLowerCase();
    const fullText = history.map(t => t.text).join(' ').toLowerCase();

    // Urgent / tension keywords
    const urgentWords = ['urgente', 'problema', 'error', 'fallo', 'crítico', 'bloqueado', 'imposible', 'retraso', 'riesgo', 'cuidado', 'grave', 'preocupa', 'cancelar', 'tensión'];
    const calmWords = ['excelente', 'perfecto', 'tranquilo', 'de acuerdo', 'bien', 'claro', 'gracias', 'avance', 'éxito'];

    const urgentCount = urgentWords.filter(w => recentText.includes(w)).length;
    const calmCount = calmWords.filter(w => recentText.includes(w)).length;

    const exclamations = (recentText.match(/[!¡]/g) || []).length;
    const questions = (recentText.match(/[?¿]/g) || []).length;

    // Intensity scale
    if (urgentCount >= 3 || (urgentCount >= 2 && exclamations >= 2)) {
      this.meetingIntensity = 'Crítica / Resolución Urgente';
    } else if (urgentCount >= 1 || questions >= 4) {
      this.meetingIntensity = 'Alta / Negociación Activa';
    } else if (calmCount >= 2) {
      this.meetingIntensity = 'Baja / Distendida y Fluida';
    } else {
      this.meetingIntensity = 'Media / Productiva';
    }

    // Tone clusters
    const toneClusters = [
      { name: 'Negociación & Acuerdos', keys: ['precio', 'presupuesto', 'costo', 'propuesta', 'contrato', 'margen', 'descuento', 'términos', 'cerrar', 'acuerdo'] },
      { name: 'Técnico & Arquitectura', keys: ['api', 'código', 'bug', 'deploy', 'base de datos', 'servidor', 'arquitectura', 'desarrollo', 'infraestructura', 'github', 'vercel'] },
      { name: 'Estratégico / Decisión', keys: ['visión', 'objetivo', 'plan', 'hitos', 'impacto', 'estrategia', 'decisión', 'dirección', 'roadmap'] },
      { name: 'Creativo & Diseño', keys: ['idea', 'diseño', 'interfaz', 'ux', 'experiencia', 'innovación', 'concepto', 'estilo', 'colores'] },
      { name: 'Operativo & Seguimiento', keys: ['tarea', 'sprint', 'semana', 'pendiente', 'estado', 'avance', 'revisión', 'entregable'] }
    ];

    let detectedTone = 'Coordinación General';
    let maxMatches = 0;
    for (const cluster of toneClusters) {
      const matches = cluster.keys.filter(k => fullText.includes(k)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedTone = cluster.name;
      }
    }
    this.meetingTone = detectedTone;

    return {
      intensity: this.meetingIntensity,
      tone: this.meetingTone
    };
  }
}

window.AIEngine = AIEngine;
