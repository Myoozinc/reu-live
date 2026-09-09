// Vercel Serverless Function: /api/transcribe
// Recibe un chunk de audio (base64) y lo transcribe con Whisper vía Groq.
// Esto reemplaza a la Web Speech API del navegador, que SOLO puede escuchar
// el micrófono. Con esto sí se transcribe el audio real grabado (sistema + mic).
//
// Variable de entorno necesaria: GROQ_API_KEY -> https://console.groq.com/keys

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } }
};

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
    const { audioBase64, mimeType } = req.body || {};
    if (!audioBase64) {
      res.status(400).json({ error: 'audioBase64 requerido' });
      return;
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), `chunk.${ext}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    form.append('response_format', 'json');

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}` },
      body: form
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('Groq Whisper error:', r.status, errText);
      res.status(502).json({ error: 'upstream_error', message: 'Error al transcribir el audio.' });
      return;
    }

    const data = await r.json();
    res.status(200).json({ text: (data.text || '').trim() });
  } catch (err) {
    console.error('transcribe.js handler error:', err);
    res.status(500).json({ error: 'server_error', message: 'Error interno del servidor.' });
  }
}
