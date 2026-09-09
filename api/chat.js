// Vercel Serverless Function: /api/chat
// Usa Groq como proveedor principal (rápido y gratis/muy barato) y OpenRouter
// como respaldo si Groq falla o no está configurado.
//
// Variables de entorno necesarias (al menos una):
//   GROQ_API_KEY       -> https://console.groq.com/keys
//   OPENROUTER_API_KEY -> https://openrouter.ai/keys

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

  const { userMessage, transcript, topic } = req.body || {};
  if (!userMessage || typeof userMessage !== 'string') {
    res.status(400).json({ error: 'userMessage requerido' });
    return;
  }

  const safeTranscript = Array.isArray(transcript) ? transcript.slice(-60) : [];
  const transcriptText = safeTranscript
    .map(t => `[${t.timestamp || ''}] ${t.speaker || 'Participante'}: ${t.text || ''}`)
    .join('\n')
    .slice(0, 12000);

  const systemPrompt =
    'Eres el copiloto IA de ReuLive, un asistente que ayuda a una persona durante una reunión en vivo. ' +
    'Recibes la transcripción parcial de la reunión y una pregunta o instrucción del usuario. ' +
    'Responde en español, de forma breve, concreta y accionable (markdown simple: **negrita**, listas). ' +
    'Si la transcripción no contiene información suficiente, dilo explícitamente en vez de inventar datos.';

  const userPrompt =
    `Tema actual detectado: ${topic || 'desconocido'}\n\n` +
    `Transcripción reciente de la reunión:\n${transcriptText || '(sin transcripción todavía)'}\n\n` +
    `Pregunta/instrucción del usuario: ${userMessage}`;

  // ---- Intento 1: Groq ----
  if (groqKey) {
    const groqModels = ['qwen/qwen3.6-27b', 'groq/compound', 'llama-3.3-70b-versatile'];
    for (const model of groqModels) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model,
            max_tokens: 700,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        });

        if (r.ok) {
          const data = await r.json();
          let reply = data.choices?.[0]?.message?.content;
          if (reply) {
            // Clean up reasoning <think> tags if present
            reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            res.status(200).json({ reply, provider: `groq (${model})` });
            return;
          }
        }
      } catch (err) {
        console.error(`Groq request failed for model ${model}:`, err);
      }
    }
  }

  // ---- Intento 2: OpenRouter (respaldo) ----
  if (openrouterKey) {
    const openrouterModels = ['meta-llama/llama-3.3-70b-instruct:free', 'liquid/lfm-2.5-2.6b:free', 'nvidia/nemotron-3.5-lightning:free'];
    for (const model of openrouterModels) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openrouterKey}`
          },
          body: JSON.stringify({
            model,
            max_tokens: 700,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        });

        if (r.ok) {
          const data = await r.json();
          let reply = data.choices?.[0]?.message?.content;
          if (reply) {
            reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            res.status(200).json({ reply, provider: `openrouter (${model})` });
            return;
          }
        }
      } catch (err) {
        console.error(`OpenRouter request failed for model ${model}:`, err);
      }
    }
  } else {
        console.error('OpenRouter error:', r.status, await r.text());
      }
    } catch (err) {
      console.error('OpenRouter request failed:', err);
    }
  }

  res.status(502).json({ error: 'upstream_error', message: 'No se pudo obtener respuesta de ningún proveedor de IA.' });
}
