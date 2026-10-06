// Vercel Serverless Function: /api/chat
// Copiloto IA real con modelos gratuitos de Groq (y OpenRouter como respaldo).
// Modo 'copilot': devuelve JSON con tema, resumen, respuesta sugerida, propuesta, pregunta,
//                 acuerdos y tareas detectados por la IA.
// Modo 'chat':    responde preguntas libres del usuario basadas en la transcripción.

// Cada modelo de Groq tiene su propio límite gratuito: si uno se agota (429) o no existe,
// se prueba el siguiente. Se puede cambiar sin tocar código con GROQ_CHAT_MODELS="a,b,c".
const DEFAULT_GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
  'llama-3.1-8b-instant'
];
const DEFAULT_OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3.5-lightning:free',
  'liquid/lfm-2.5-2.6b:free'
];

const MODEL_TIMEOUT_MS = 9000;   // por modelo: no esperar a uno lento
const TOTAL_BUDGET_MS = 24000;   // por petición (maxDuration de la función: 30 s)
const MAX_TRANSCRIPT_CHARS = 9000;   // ~2.5k tokens: cabe en los límites gratuitos por minuto

function envList(name, fallback) {
  const v = process.env[name];
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : fallback;
}

function formatTranscript(transcript) {
  const safe = Array.isArray(transcript) ? transcript.slice(-50) : [];
  const text = safe
    .map(t => {
      const isUser = t.speakerType === 'user';
      const name = String(t.speaker || (isUser ? 'Tú' : 'Interlocutor')).slice(0, 40);
      const label = isUser ? `${name} [USUARIO]` : `${name} [INTERLOCUTOR]`;
      return `[${t.timestamp || ''}] ${label}: ${String(t.text || '').slice(0, 1500)}`;
    })
    .join('\n');
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

const COPILOT_SYSTEM_PROMPT = `Eres el copiloto en vivo de ReuLive. Ayudas al USUARIO durante una llamada (Zoom, Meet, WhatsApp, Teams o presencial) leyendo la transcripción automática.

Contexto de la transcripción:
- Las líneas marcadas [USUARIO] son lo que dijo el usuario al que ayudas. Las marcadas [INTERLOCUTOR] son de la otra persona.
- La transcripción es automática: puede tener palabras mal reconocidas o frases cortadas. Interpreta la intención más probable y no repitas los errores.

Tu tarea: sugerir al USUARIO qué decir AHORA, respondiendo a lo último relevante que dijo el INTERLOCUTOR. Si lo último lo dijo el USUARIO, sugiere cómo continuar o cerrar su idea.

Responde ÚNICAMENTE con un objeto JSON válido con estas claves:
{
  "topic": "tema concreto de la conversación, 2 a 5 palabras",
  "summary": "1 oración: qué se está tratando ahora mismo y en qué punto está",
  "direct_response": "frase natural que el usuario puede decir en voz alta tal cual, en primera persona, máximo 35 palabras",
  "proposal": "propuesta concreta y accionable sobre lo que se discute, máximo 35 palabras",
  "question": "una pregunta útil para hacerle al interlocutor, máximo 25 palabras",
  "agreements": ["acuerdos o decisiones REALMENTE tomados en toda la conversación, redactados en una frase"],
  "action_items": [{"task": "tarea concreta", "owner": "responsable o vacío", "due": "plazo o vacío"}],
  "sentiment": "positivo | neutral | tenso"
}

Reglas:
- Todo debe ser específico sobre lo que realmente se habló (nombres, cifras, productos, fechas). Nada genérico como "profundicemos en ese punto".
- No inventes datos que no estén en la transcripción. Si algo no está claro, la pregunta sugerida puede servir para aclararlo.
- Si no hay acuerdos o tareas reales, devuelve listas vacías.
- Escribe en el mismo idioma que la conversación (por defecto, español). Sin markdown y sin texto fuera del JSON.`;

const CHAT_SYSTEM_PROMPT = `Eres el copiloto de ReuLive, un asistente para reuniones y llamadas en vivo.
Responde la pregunta del usuario basándote en la transcripción proporcionada.
- Las líneas [USUARIO] son del usuario que te pregunta; las [INTERLOCUTOR] son de la otra persona.
- La transcripción es automática y puede tener errores de reconocimiento: interpreta la intención más probable.
- Si te pide qué responder o decir, da 2 o 3 opciones listas para decir en voz alta, concretas sobre lo hablado.
- Si algo no aparece en la transcripción, dilo claramente en vez de inventarlo.
- Responde en el idioma del usuario, de forma breve y útil (negritas y listas cortas).`;

function buildBody(model, messages, isJson, minimal) {
  const body = {
    model,
    messages,
    temperature: isJson ? 0.4 : 0.5,
    max_tokens: isJson ? 1400 : 1000
  };
  if (!minimal) {
    if (isJson) body.response_format = { type: 'json_object' };
    // Los modelos de razonamiento gastan tokens "pensando": limitar para que quede respuesta
    if (model.includes('gpt-oss')) body.reasoning_effort = 'low';
  }
  return body;
}

function parseCopilotJson(reply) {
  const match = reply.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : reply);
  if (!parsed || typeof parsed !== 'object' || !parsed.direct_response) {
    throw new Error('JSON sin las claves esperadas');
  }
  return parsed;
}

async function callProvider({ url, key, model, messages, isJson, extraHeaders }) {
  // Intento completo y, si el modelo rechaza algún parámetro (400), uno mínimo
  for (const minimal of [false, true]) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, ...extraHeaders },
      body: JSON.stringify(buildBody(model, messages, isJson, minimal)),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
    });

    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 200);
      console.warn(`${model} -> ${r.status} ${detail}`);
      if (r.status === 400 && !minimal) continue;
      return null;
    }

    const data = await r.json();
    let reply = data.choices?.[0]?.message?.content || '';
    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!reply) {
      console.warn(`${model} -> respuesta vacía (finish_reason: ${data.choices?.[0]?.finish_reason})`);
      return null;
    }
    if (!isJson) return { reply };
    try {
      return { copilot: parseCopilotJson(reply) };
    } catch (err) {
      console.warn(`${model} -> JSON inválido:`, err.message);
      if (!minimal) continue;
      return null;
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!groqKey && !openrouterKey) {
    res.status(503).json({ error: 'no_api_key', message: 'Configura GROQ_API_KEY u OPENROUTER_API_KEY en el servidor.' });
    return;
  }

  const { userMessage, transcript, topic, mode, memory } = req.body || {};
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

  const messages = [
    { role: 'system', content: isCopilotMode ? COPILOT_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  const providers = [];
  if (groqKey) {
    envList('GROQ_CHAT_MODELS', DEFAULT_GROQ_MODELS).forEach(model => providers.push({
      name: 'groq', model, key: groqKey, url: 'https://api.groq.com/openai/v1/chat/completions'
    }));
  }
  if (openrouterKey) {
    envList('OPENROUTER_CHAT_MODELS', DEFAULT_OPENROUTER_MODELS).forEach(model => providers.push({
      name: 'openrouter', model, key: openrouterKey, url: 'https://openrouter.ai/api/v1/chat/completions',
      extraHeaders: { 'X-Title': 'ReuLive' }
    }));
  }

  const startedAt = Date.now();
  for (const p of providers) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    try {
      const result = await callProvider({ ...p, messages, isJson: isCopilotMode });
      if (result) {
        res.status(200).json({ ...result, provider: `${p.name} (${p.model})` });
        return;
      }
    } catch (err) {
      console.error(`${p.name} ${p.model} error:`, err.name === 'TimeoutError' ? 'timeout' : err.message);
    }
  }

  res.status(502).json({ error: 'upstream_error', message: 'No se pudo obtener respuesta de ningún proveedor de IA.' });
}
