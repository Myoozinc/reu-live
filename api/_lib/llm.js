// Llamadas compartidas a modelos de IA gratuitos (Groq y OpenRouter como respaldo).
// Cada modelo de Groq tiene su propio límite gratuito: si uno se agota (429), no existe
// o tarda demasiado, se prueba el siguiente.

const MODEL_SETS = {
  // Calidad: copiloto, chat y resumen final. Configurable con GROQ_CHAT_MODELS="a,b,c".
  chat: {
    env: 'GROQ_CHAT_MODELS',
    groq: ['openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant']
  },
  // Rapidez: traducción en vivo y notas parciales. Configurable con GROQ_FAST_MODELS.
  fast: {
    env: 'GROQ_FAST_MODELS',
    groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b']
  },
  // Resumen final: textos largos, mejor modelos con más tokens por minuto gratis.
  report: {
    env: 'GROQ_REPORT_MODELS',
    groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant']
  }
};

const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3.5-lightning:free',
  'liquid/lfm-2.5-2.6b:free'
];

export const LANGUAGES = {
  es: 'español',
  en: 'inglés (English)',
  fr: 'francés (français)',
  it: 'italiano',
  de: 'alemán (Deutsch)'
};

// Whisper (verbose_json) devuelve el idioma detectado en inglés: "spanish", "german"...
const WHISPER_LANGUAGE_CODES = {
  spanish: 'es', english: 'en', french: 'fr', italian: 'it', german: 'de',
  portuguese: 'pt', catalan: 'ca', dutch: 'nl', russian: 'ru', chinese: 'zh',
  japanese: 'ja', korean: 'ko', arabic: 'ar', polish: 'pl', turkish: 'tr'
};

export function languageCode(whisperLanguage) {
  const l = String(whisperLanguage || '').toLowerCase().trim();
  if (/^[a-z]{2}$/.test(l)) return l;
  return WHISPER_LANGUAGE_CODES[l] || l || '';
}

export function languageName(code) {
  return LANGUAGES[code] || code || 'español';
}

function envList(name, fallback) {
  const v = process.env[name];
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : fallback;
}

export function hasAnyKey() {
  return !!(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
}

function buildBody(model, messages, { json, maxTokens, temperature }, minimal) {
  const body = { model, messages, temperature, max_tokens: maxTokens };
  if (!minimal) {
    if (json) body.response_format = { type: 'json_object' };
    // Los modelos de razonamiento gastan tokens "pensando": limitar para que quede respuesta
    if (model.includes('gpt-oss')) body.reasoning_effort = 'low';
  }
  return body;
}

export function parseJsonReply(reply) {
  const match = reply.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : reply);
}

async function callOne({ url, key, model, extraHeaders }, messages, opts) {
  // Intento completo y, si el modelo rechaza algún parámetro (400) o el JSON no sirve, uno mínimo
  for (const minimal of [false, true]) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, ...extraHeaders },
      body: JSON.stringify(buildBody(model, messages, opts, minimal)),
      signal: AbortSignal.timeout(opts.timeoutMs)
    });

    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 200);
      console.warn(`${model} -> ${r.status} ${detail}`);
      if (r.status === 400 && !minimal) continue;
      return null;
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!reply) {
      console.warn(`${model} -> respuesta vacía (finish_reason: ${data.choices?.[0]?.finish_reason})`);
      return null;
    }
    if (!opts.json) return { text: reply };
    try {
      const parsed = parseJsonReply(reply);
      if (opts.validate && !opts.validate(parsed)) throw new Error('JSON sin las claves esperadas');
      return { json: parsed };
    } catch (err) {
      console.warn(`${model} -> JSON inválido:`, err.message);
      if (!minimal) continue;
      return null;
    }
  }
  return null;
}

/**
 * Runs `messages` against the model set, falling back model by model.
 * Returns { text } or { json }, plus `provider`; null if every model failed.
 */
export async function runLLM(messages, {
  set = 'chat',
  json = false,
  validate = null,
  maxTokens = 1000,
  temperature = 0.4,
  timeoutMs = 9000,
  budgetMs = 24000
} = {}) {
  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const modelSet = MODEL_SETS[set] || MODEL_SETS.chat;

  const providers = [];
  if (groqKey) {
    envList(modelSet.env, modelSet.groq).forEach(model => providers.push({
      name: 'groq', model, key: groqKey, url: 'https://api.groq.com/openai/v1/chat/completions'
    }));
  }
  if (openrouterKey) {
    envList('OPENROUTER_CHAT_MODELS', OPENROUTER_MODELS).forEach(model => providers.push({
      name: 'openrouter', model, key: openrouterKey, url: 'https://openrouter.ai/api/v1/chat/completions',
      extraHeaders: { 'X-Title': 'ReuLive' }
    }));
  }

  const opts = { json, validate, maxTokens, temperature, timeoutMs };
  const startedAt = Date.now();
  for (const p of providers) {
    if (Date.now() - startedAt > budgetMs) break;
    try {
      const result = await callOne(p, messages, opts);
      if (result) return { ...result, provider: `${p.name} (${p.model})` };
    } catch (err) {
      console.error(`${p.name} ${p.model} error:`, err.name === 'TimeoutError' ? 'timeout' : err.message);
    }
  }
  return null;
}

/** Fast translation of a short text. Returns the translated string or null. */
export async function translateText(text, targetCode, sourceCode) {
  const target = languageName(targetCode);
  const source = sourceCode ? languageName(sourceCode) : 'el idioma original';
  const result = await runLLM([
    {
      role: 'system',
      content: `Eres un intérprete simultáneo. Traduce del ${source} al ${target} el texto que te den, ` +
        'de forma natural y fiel al sentido (es una transcripción automática de una llamada: corrige errores ' +
        'evidentes de reconocimiento). Responde SOLO con la traducción, sin comillas ni comentarios.'
    },
    { role: 'user', content: String(text).slice(0, 3000) }
  ], { set: 'fast', maxTokens: 700, temperature: 0.2, timeoutMs: 6000, budgetMs: 12000 });
  return result && result.text ? result.text.replace(/^["“«]|["”»]$/g, '').trim() : null;
}
