// Vercel Serverless Function: /api/chat
// Copiloto IA real con modelos gratuitos de Groq (y OpenRouter como respaldo).
// Modo 'copilot': JSON con tema, resumen, respuesta sugerida, propuesta, pregunta,
//                 acuerdos y tareas detectados por la IA (en el idioma del usuario).
// Modo 'chat':    responde preguntas libres del usuario basadas en la transcripción.
// Modo 'report':  resumen final de la reunión (acta) en JSON.

import { runLLM, hasAnyKey, languageName, LANGUAGES } from './_lib/llm.js';

const MAX_TRANSCRIPT_CHARS = 9000;   // ~2.5k tokens: cabe en los límites gratuitos por minuto
const REPORT_PART_CHARS = 14000;     // trozos para resumir reuniones largas
const REPORT_MAX_PARTS = 5;

function transcriptLines(transcript, limit) {
  const safe = Array.isArray(transcript) ? transcript.slice(-limit) : [];
  return safe.map(t => {
    const isUser = t.speakerType === 'user';
    const name = String(t.speaker || (isUser ? 'Tú' : 'Interlocutor')).slice(0, 40);
    const label = isUser ? `${name} [USUARIO]` : `${name} [INTERLOCUTOR]`;
    const lang = t.lang ? ` (${t.lang})` : '';
    return `[${t.timestamp || ''}] ${label}${lang}: ${String(t.text || '').slice(0, 1500)}`;
  });
}

function formatTranscript(transcript) {
  const text = transcriptLines(transcript, 50).join('\n');
  // Quedarse con el FINAL (lo más reciente), nunca con el principio
  return text.length > MAX_TRANSCRIPT_CHARS ? '…' + text.slice(-MAX_TRANSCRIPT_CHARS) : text;
}

function formatMemory(memory) {
  if (!memory || typeof memory !== 'object') return '';
  const parts = [];
  if (memory.summary) parts.push(`Resumen previo: ${String(memory.summary).slice(0, 600)}`);
  if (Array.isArray(memory.agreements) && memory.agreements.length) {
    parts.push('Acuerdos ya detectados:\n' + memory.agreements.slice(-10).map(a => `- ${String(a).slice(0, 200)}`).join('\n'));
  }
  if (Array.isArray(memory.actionItems) && memory.actionItems.length) {
    parts.push('Tareas ya detectadas:\n' + memory.actionItems.slice(-10).map(a => `- ${String(a).slice(0, 200)}`).join('\n'));
  }
  return parts.join('\n\n');
}

function copilotSystemPrompt(userLang) {
  const lang = languageName(userLang);
  return `Eres el copiloto en vivo de ReuLive. Ayudas al USUARIO durante una llamada (Zoom, Meet, WhatsApp, Teams o presencial) leyendo la transcripción automática.

Contexto de la transcripción:
- Las líneas marcadas [USUARIO] son lo que dijo el usuario al que ayudas. Las marcadas [INTERLOCUTOR] son de la otra persona. Entre paréntesis puede ir el idioma detectado.
- La transcripción es automática: puede tener palabras mal reconocidas o frases cortadas. Interpreta la intención más probable y no repitas los errores.

Tu tarea: sugerir al USUARIO qué decir AHORA, respondiendo a lo último relevante que dijo el INTERLOCUTOR. Si lo último lo dijo el USUARIO, sugiere cómo continuar o cerrar su idea.

Responde ÚNICAMENTE con un objeto JSON válido con estas claves:
{
  "topic": "tema concreto de la conversación, 2 a 5 palabras",
  "summary": "1 oración: qué se está tratando ahora mismo y en qué punto está",
  "direct_response": "frase natural que el usuario puede decir en voz alta tal cual, en primera persona, máximo 35 palabras",
  "proposal": "propuesta concreta y accionable sobre lo que se discute, máximo 35 palabras",
  "question": "una pregunta útil para hacerle al interlocutor, máximo 25 palabras",
  "their_language": "código del idioma en que habla el INTERLOCUTOR (es, en, fr, it, de...)",
  "say_in_their_language": "SOLO si el interlocutor habla un idioma distinto del ${lang}: la misma frase de direct_response traducida a su idioma, para decirla en voz alta. Si no, cadena vacía",
  "agreements": ["acuerdos o decisiones REALMENTE tomados en toda la conversación, redactados en una frase"],
  "action_items": [{"task": "tarea concreta", "owner": "responsable o vacío", "due": "plazo o vacío"}],
  "sentiment": "positivo | neutral | tenso"
}

Reglas:
- Escribe topic, summary, direct_response, proposal, question, agreements y action_items en ${lang}, aunque la conversación esté en otro idioma (el usuario lee en ${lang}).
- Todo debe ser específico sobre lo que realmente se habló (nombres, cifras, productos, fechas). Nada genérico como "profundicemos en ese punto".
- No inventes datos que no estén en la transcripción. Si algo no está claro, la pregunta sugerida puede servir para aclararlo.
- Si no hay acuerdos o tareas reales, devuelve listas vacías.
- Sin markdown y sin texto fuera del JSON.`;
}

function chatSystemPrompt(userLang) {
  return `Eres el copiloto de ReuLive, un asistente para reuniones y llamadas en vivo.
Responde la pregunta del usuario basándote en la transcripción proporcionada.
- Las líneas [USUARIO] son del usuario que te pregunta; las [INTERLOCUTOR] son de la otra persona.
- La transcripción es automática y puede tener errores de reconocimiento: interpreta la intención más probable.
- Si te pide qué responder o decir, da 2 o 3 opciones listas para decir en voz alta, concretas sobre lo hablado. Si el interlocutor habla otro idioma, añade cada opción también en su idioma.
- Si algo no aparece en la transcripción, dilo claramente en vez de inventarlo.
- Responde en ${languageName(userLang)} (o en el idioma en que te escriba el usuario), de forma breve y útil (negritas y listas cortas).`;
}

function reportSystemPrompt(userLang) {
  const lang = languageName(userLang);
  return `Eres un secretario de actas experto. A partir de la transcripción automática de una reunión (puede tener errores de reconocimiento y varios idiomas), redacta el acta final en ${lang}.
Las líneas [USUARIO] son del usuario de la app; las [INTERLOCUTOR] son de las otras personas.

Responde ÚNICAMENTE con un objeto JSON válido:
{
  "title": "título concreto de la reunión, máximo 8 palabras",
  "executive_summary": "resumen ejecutivo de 3 a 5 oraciones: de qué se habló, qué se decidió y qué queda pendiente",
  "key_points": ["puntos principales tratados, una frase cada uno"],
  "decisions": ["decisiones o acuerdos tomados"],
  "action_items": [{"task": "tarea concreta", "owner": "responsable o vacío", "due": "plazo o vacío"}],
  "open_questions": ["temas sin resolver o dudas abiertas"],
  "next_steps": ["próximos pasos recomendados"]
}
Reglas: solo información que aparezca en la transcripción (no inventes nombres, cifras ni fechas); listas vacías si no hay nada; todo en ${lang}; sin markdown.`;
}

async function buildReport(transcript, memory, userLang) {
  const lines = transcriptLines(transcript, 5000);
  let fullText = lines.join('\n');
  let notesIntro = 'Transcripción completa';

  // Reuniones largas: primero notas por partes (modelo rápido), luego el acta con esas notas
  if (fullText.length > REPORT_PART_CHARS) {
    const parts = [];
    let current = '';
    for (const line of lines) {
      if ((current + line).length > REPORT_PART_CHARS && current) {
        parts.push(current);
        current = '';
      }
      current += line + '\n';
    }
    if (current) parts.push(current);

    // Si hay demasiadas partes, se agrupan para no superar el tiempo ni la cuota gratuita
    const groupSize = Math.ceil(parts.length / REPORT_MAX_PARTS);
    const grouped = [];
    for (let i = 0; i < parts.length; i += groupSize) grouped.push(parts.slice(i, i + groupSize).join(''));

    const notes = [];
    for (let i = 0; i < grouped.length; i++) {
      const r = await runLLM([
        { role: 'system', content: `Resume en ${languageName(userLang)} esta parte ${i + 1}/${grouped.length} de una reunión en 6 a 12 viñetas concretas: temas, cifras, nombres, decisiones y tareas con responsable. Solo lo que aparece en el texto.` },
        { role: 'user', content: grouped[i].slice(0, REPORT_PART_CHARS * 1.2) }
      ], { set: 'fast', maxTokens: 700, temperature: 0.2, timeoutMs: 12000, budgetMs: 20000 });
      notes.push(`Parte ${i + 1}:\n${r && r.text ? r.text : grouped[i].slice(-2500)}`);
    }
    fullText = notes.join('\n\n');
    notesIntro = 'Notas de la reunión por partes (en orden)';
  }

  const memoryText = formatMemory(memory);
  return runLLM([
    { role: 'system', content: reportSystemPrompt(userLang) },
    { role: 'user', content: (memoryText ? `${memoryText}\n\n` : '') + `${notesIntro}:\n${fullText}` }
  ], {
    set: 'report',
    json: true,
    validate: (p) => p && typeof p.executive_summary === 'string',
    maxTokens: 2000,
    temperature: 0.3,
    timeoutMs: 20000,
    budgetMs: 30000
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!hasAnyKey()) {
    res.status(503).json({ error: 'no_api_key', message: 'Configura GROQ_API_KEY u OPENROUTER_API_KEY en el servidor.' });
    return;
  }

  const { userMessage, transcript, topic, mode, memory } = req.body || {};
  const userLang = LANGUAGES[req.body?.userLang] ? req.body.userLang : 'es';

  if (mode === 'report') {
    if (!Array.isArray(transcript) || transcript.length === 0) {
      res.status(400).json({ error: 'transcript requerido' });
      return;
    }
    const result = await buildReport(transcript, memory, userLang);
    if (result && result.json) {
      res.status(200).json({ report: result.json, provider: result.provider });
    } else {
      res.status(502).json({ error: 'upstream_error', message: 'No se pudo generar el resumen.' });
    }
    return;
  }

  const isCopilotMode = mode === 'copilot';
  if (!isCopilotMode && (!userMessage || typeof userMessage !== 'string')) {
    res.status(400).json({ error: 'userMessage requerido' });
    return;
  }

  const transcriptText = formatTranscript(transcript);
  const memoryText = formatMemory(memory);

  const userPrompt = isCopilotMode
    ? (memoryText ? `${memoryText}\n\n` : '') +
      `Transcripción (lo más reciente al final):\n${transcriptText || '(La reunión acaba de iniciar)'}`
    : `Tema detectado: ${String(topic || 'en curso').slice(0, 120)}\n\n` +
      (memoryText ? `${memoryText}\n\n` : '') +
      `Transcripción (lo más reciente al final):\n${transcriptText || '(sin transcripción todavía)'}\n\n` +
      `Pregunta del usuario: ${userMessage.slice(0, 2000)}`;

  const result = await runLLM([
    { role: 'system', content: isCopilotMode ? copilotSystemPrompt(userLang) : chatSystemPrompt(userLang) },
    { role: 'user', content: userPrompt }
  ], isCopilotMode
    ? { json: true, validate: (p) => p && p.direct_response, maxTokens: 1400, temperature: 0.4 }
    : { maxTokens: 1000, temperature: 0.5 });

  if (result) {
    res.status(200).json(isCopilotMode
      ? { copilot: result.json, provider: result.provider }
      : { reply: result.text, provider: result.provider });
    return;
  }

  res.status(502).json({ error: 'upstream_error', message: 'No se pudo obtener respuesta de ningún proveedor de IA.' });
}
