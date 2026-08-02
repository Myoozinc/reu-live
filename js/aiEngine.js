/**
 * ReuLive - AI Intelligence Engine with Google Gemini API
 * Live Topic Extraction & Copilot Answer Generator.
 */

class AIEngine {
  constructor() {
    this.currentTopic = "En espera de audio de la reunión...";
    this.apiKey = localStorage.getItem('reulive_gemini_key') || '';
    this.agreements = [];
    this.actionItems = [];
    this.sentiment = "Neutral";
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    localStorage.setItem('reulive_gemini_key', this.apiKey);
  }

  getApiKey() {
    return this.apiKey;
  }

  /**
   * Main entry point to analyze latest transcript
   */
  async processTranscript(transcriptHistory) {
    if (!transcriptHistory || transcriptHistory.length === 0) {
      return {
        topic: "Inicio de la reunión",
        suggestions: this.getDefaultSuggestions(),
        sentiment: "Neutral"
      };
    }

    const recentText = transcriptHistory.slice(-4).map(t => `${t.speaker}: ${t.text}`).join('\n');
    const fullText = transcriptHistory.map(t => `${t.speaker}: ${t.text}`).join('\n');

    // If Gemini API Key is available, call Gemini 1.5 Flash API directly
    if (this.apiKey) {
      try {
        const geminiResult = await this.callGeminiAPI(recentText, fullText);
        if (geminiResult) {
          this.currentTopic = geminiResult.topic || this.currentTopic;
          this.sentiment = geminiResult.sentiment || "Colaborativo";
          if (geminiResult.agreements) this.agreements = geminiResult.agreements;
          if (geminiResult.actionItems) this.actionItems = geminiResult.actionItems;

          return {
            topic: this.currentTopic,
            suggestions: geminiResult.suggestions || this.generateCopilotResponses(recentText, this.currentTopic),
            sentiment: this.sentiment,
            agreements: this.agreements,
            actionItems: this.actionItems
          };
        }
      } catch (err) {
        console.warn('Fallback a motor heurístico tras error en API de Gemini:', err);
      }
    }

    // High-performance real-time NLP fallback
    this.currentTopic = this.extractMainTopic(recentText, fullText);
    this.sentiment = this.analyzeSentiment(recentText);
    this.extractItems(transcriptHistory);
    const suggestions = this.generateCopilotResponses(recentText, this.currentTopic);

    return {
      topic: this.currentTopic,
      suggestions,
      sentiment: this.sentiment,
      agreements: this.agreements,
      actionItems: this.actionItems
    };
  }

  /**
   * Google Gemini REST API Call
   */
  async callGeminiAPI(recentText, fullText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
    
    const prompt = `Eres el asistente copiloto IA en tiempo real de una reunión.
Analiza la siguiente transcripción reciente de la llamada:
"""
${recentText}
"""

Responde estrictamente en formato JSON válido con la siguiente estructura exacta:
{
  "topic": "Resumen de máximo 7 palabras del tema principal tratado en la reunión ahora mismo",
  "sentiment": "Colaborativo | Técnico | Urgente | Analítico",
  "suggestions": [
    {
      "type": "direct",
      "title": "Respuesta Directa",
      "icon": "fa-circle-check",
      "text": "Frase exacta entre comillas que el usuario puede decir directamente para responder a lo recién dicho."
    },
    {
      "type": "proposal",
      "title": "Propuesta / Alternativa",
      "icon": "fa-lightbulb",
      "text": "Una propuesta constructiva o alternativa estratégica relacionada con el tema."
    },
    {
      "type": "question",
      "title": "Pregunta Estratégica",
      "icon": "fa-circle-question",
      "text": "Una pregunta relevante e inteligente para hacerle a los demás participantes."
    },
    {
      "type": "summary",
      "title": "Resumen de Cierre",
      "icon": "fa-list-check",
      "text": "Una breve frase de confirmación o cierre del punto abordado."
    }
  ],
  "agreements": ["Acuerdo 1 si aplica"],
  "actionItems": ["Tarea 1 si aplica"]
}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Error en API Gemini`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract JSON block from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  }

  extractMainTopic(recentText, fullText) {
    const lower = (recentText + ' ' + fullText).toLowerCase();

    if (lower.includes('vercel') || lower.includes('github') || lower.includes('despliegue')) {
      return "Arquitectura de Software & Despliegue en Vercel";
    }
    if (lower.includes('presupuesto') || lower.includes('costo') || lower.includes('finanzas')) {
      return "Análisis de Presupuesto y Recursos Financieros";
    }
    if (lower.includes('diseño') || lower.includes('ui') || lower.includes('interfaz')) {
      return "Diseño de Interfaz de Usuario y Experiencia (UI/UX)";
    }
    if (lower.includes('api') || lower.includes('backend') || lower.includes('database')) {
      return "Integración Backend, APIs y Datos en Tiempo Real";
    }
    if (lower.includes('zoom') || lower.includes('audio') || lower.includes('micrófono')) {
      return "Captura de Dispositivo & Integración de Audio";
    }

    const words = recentText.split(' ').filter(w => w.length > 5);
    if (words.length >= 2) {
      return `Coordinación sobre ${words.slice(-3).join(' ')}`;
    }

    return "Estrategia General y Coordinación de la Reunión";
  }

  analyzeSentiment(text) {
    const lower = text.toLowerCase();
    if (lower.includes('excelente') || lower.includes('perfecto') || lower.includes('bien')) {
      return "Colaborativo / Positivo";
    }
    if (lower.includes('problema') || lower.includes('urgente') || lower.includes('error')) {
      return "Atención Requerida";
    }
    return "Analítico / Técnico";
  }

  extractItems(history) {
    const agreementsSet = new Set(this.agreements);
    const actionItemsSet = new Set(this.actionItems);

    history.forEach(item => {
      const lower = item.text.toLowerCase();
      if (lower.includes('acordamos') || lower.includes('fijar') || lower.includes('definir')) {
        agreementsSet.add(item.text);
      }
      if (lower.includes('necesitamos') || lower.includes('tarea') || lower.includes('hacer')) {
        actionItemsSet.add(item.text);
      }
    });

    this.agreements = Array.from(agreementsSet).slice(-5);
    this.actionItems = Array.from(actionItemsSet).slice(-5);
  }

  generateCopilotResponses(recentText, topic) {
    const lower = recentText.toLowerCase();

    let direct = '"Entendido. Coincido con ese enfoque y podemos avanzar con la ejecución de inmediato."';
    if (lower.includes('vercel') || lower.includes('github')) {
      direct = '"Conectemos el repositorio de GitHub con Vercel para tener despliegues continuos automáticos."';
    } else if (lower.includes('presupuesto')) {
      direct = '"Tengo los datos clave listos y podemos ajustar la asignación para optimizar costos."';
    }

    let proposal = '"Una alternativa eficiente es dividir la entrega en dos fases para acelerar la salida a producción."';
    if (lower.includes('zoom') || lower.includes('audio')) {
      proposal = '"Sugeriría usar la Web Display Media API para capturar el audio nativo de Zoom sin instalar programas externos."';
    }

    let question = '"¿Cuál es la prioridad principal que debemos validar en esta etapa?"';
    let summary = `"Para resumen del punto sobre ${topic}: estamos alineados para proceder con los siguientes pasos."`;

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
        title: 'Pregunta Estratégica',
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
        text: '"Hola a todos, estoy listo para iniciar y repasar los puntos de la reunión."'
      },
      {
        type: 'proposal',
        title: 'Propuesta / Alternativa',
        icon: 'fa-lightbulb',
        text: '"Podemos iniciar revisando los avances principales y luego abrir espacio para preguntas."'
      },
      {
        type: 'question',
        title: 'Pregunta Estratégica',
        icon: 'fa-circle-question',
        text: '"¿Todos pueden escuchar el audio con claridad y ver la pantalla compartida?"'
      },
      {
        type: 'summary',
        title: 'Resumen de Cierre',
        icon: 'fa-list-check',
        text: '"Confirmado, tenemos la transcripción en tiempo real y el copiloto de IA activado."'
      }
    ];
  }

  async queryCustomCopilot(prompt, fullTranscript) {
    if (this.apiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
        const bodyText = `Contexto de la reunión:\n${fullTranscript.slice(-10).map(t => t.text).join('\n')}\n\nPregunta privada del usuario durante la reunión: "${prompt}". Responde de forma muy concisa con lo que el usuario debería responder o decir en la reunión.`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: bodyText }] }] })
        });
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } catch (e) {
        console.warn('Error en Gemini Custom Query:', e);
      }
    }

    return `[Copiloto IA]: Para responder a "${prompt}", te sugiero indicar: "Respecto a ese punto, los datos nos permiten avanzar manteniendo el control de calidad en el proyecto."`;
  }
}

window.AIEngine = AIEngine;
