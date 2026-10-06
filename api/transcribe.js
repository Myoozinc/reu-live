// Vercel Serverless Function: /api/transcribe
// Recibe un chunk de audio (base64) y lo transcribe con Whisper vía Groq (plan gratuito).
// Esto reemplaza a la Web Speech API del navegador, que SOLO puede escuchar
// el micrófono. Con esto sí se transcribe el audio real grabado (sistema + mic).
//
// Si se pide `translateTo` y la persona habla otro idioma, devuelve también la traducción
// (una sola petición desde el navegador: menos espera).
//
// Variable de entorno necesaria: GROQ_API_KEY -> https://console.groq.com/keys

import { languageCode, translateText, LANGUAGES } from './_lib/llm.js';

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } }
};

// Cada modelo tiene su propio límite gratuito en Groq: si uno se agota (429), se usa el otro.
const WHISPER_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];

// Frases que Whisper "inventa" sobre silencio o ruido (vienen de subtítulos de YouTube).
const HALLUCINATION_PATTERNS = [
  /subt[ií]tul(os|ado)s? (realizados? )?(por|de)/i,
  /amara\.org/i,
  /gracias por (ver|mirar|su atenci[oó]n)( el v[ií]deo)?[.!]*$/i,
  /suscr[ií]bete|suscr[ií]banse|dale like|no olvides suscribirte/i,
  /^(\s*(gracias|m[uú]sica|aplausos|risas|silencio)[.!]*\s*)+$/i,
  /^\s*[\[(].*[\])]\s*$/,              // "[Música]", "(risas)"
  /thanks for watching|thank you for watching/i,
  /^\s*(\.|…|-)+\s*$/
];

function isHallucination(text) {
  const t = (text || '').trim();
  if (t.length < 2) return true;
  return HALLUCINATION_PATTERNS.some(re => re.test(t));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    res.status(503).json({ error: 'no_api_key', message: 'Configura GROQ_API_KEY en el servidor.' });
    return;
  }

  try {
    const { audioBase64, mimeType, prompt, language, translateTo } = req.body || {};
    if (!audioBase64) {
      res.status(400).json({ error: 'audioBase64 requerido' });
      return;
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
    // 'auto' (o vacío) = Whisper detecta el idioma de cada fragmento
    const lang = typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : null;
    const target = LANGUAGES[translateTo] ? translateTo : null;
    // El final de lo ya transcrito da continuidad: nombres, términos y frases cortadas.
    const contextPrompt = typeof prompt === 'string' ? prompt.slice(-400) : '';

    let lastStatus = 502;
    for (const model of WHISPER_MODELS) {
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), `chunk.${ext}`);
      form.append('model', model);
      if (lang) form.append('language', lang);
      form.append('temperature', '0');
      form.append('response_format', 'verbose_json');
      if (contextPrompt) form.append('prompt', contextPrompt);

      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: form,
        signal: AbortSignal.timeout(15000)
      }).catch(err => {
        console.error(`Groq Whisper (${model}) request error:`, err.message);
        return null;
      });

      if (!r) continue;
      if (!r.ok) {
        lastStatus = r.status;
        console.error(`Groq Whisper (${model}) error:`, r.status, (await r.text()).slice(0, 300));
        continue;
      }

      const data = await r.json();
      // Descarta segmentos que Whisper marca como probable silencio o de muy baja confianza
      const segments = Array.isArray(data.segments) ? data.segments : null;
      let text = segments
        ? segments
            .filter(s => !(s.no_speech_prob > 0.6 && s.avg_logprob < -0.7) && s.avg_logprob > -1.2)
            .map(s => (s.text || '').trim())
            .filter(t => !isHallucination(t))
            .join(' ')
        : (data.text || '');
      text = text.replace(/\s+/g, ' ').trim();
      if (isHallucination(text)) text = '';

      const detected = languageCode(data.language) || lang || '';
      let translation = null;
      if (text && target && detected && detected !== target) {
        translation = await translateText(text, target, detected).catch(() => null);
      }

      res.status(200).json({ text, language: detected, translation, model });
      return;
    }

    res.status(lastStatus === 429 ? 429 : 502).json({
      error: lastStatus === 429 ? 'rate_limited' : 'upstream_error',
      message: 'Error al transcribir el audio.'
    });
  } catch (err) {
    console.error('transcribe.js handler error:', err);
    res.status(500).json({ error: 'server_error', message: 'Error interno del servidor.' });
  }
}
