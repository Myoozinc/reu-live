// Vercel Serverless Function: /api/chat
// Copiloto IA real con Groq y OpenRouter
// Soporta modo 'copilot' (genera tema, respuesta sugerida, propuesta y pregunta en JSON)
// y modo 'chat' (responde preguntas libres del usuario basadas en la transcripción).

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

  const { userMessage, transcript, topic, mode } = req.body || {};
  const isCopilotMode = mode === 'copilot';

  if (!isCopilotMode && (!userMessage || typeof userMessage !== 'string')) {
    res.status(400).json({ error: 'userMessage requerido' });
    return;
  }

  const safeTranscript = Array.isArray(transcript) ? transcript.slice(-60) : [];
  const transcriptText = safeTranscript
    .map(t => `[${t.timestamp || ''}] ${t.speaker || 'Participante'}: ${t.text || ''}`)
    .join('\n')
    .slice(0, 12000);

  let systemPrompt = '';
  let userPrompt = '';

  if (isCopilotMode) {
    systemPrompt =
      'Eres el copiloto IA en vivo de ReuLive para reuniones. Tu misión es analizar la transcripción completa de la conversación y generar sugerencias en tiempo real directamente sobre lo que se está hablando.\n' +
      'Responde ÚNICAMENTE un objeto JSON válido con estas claves exactas:\n' +
      '{\n' +
      '  "topic": "tema principal de la conversación en 2-4 palabras",\n' +
      '  "summary": "1 oración concisa resumiendo lo que se está debatiendo ahora",\n' +
      '  "direct_response": "respuesta sugerida inmediata, natural y lista para que el usuario la diga en voz alta",\n' +
      '  "proposal": "propuesta o idea constructiva sobre el tema en discusión",\n' +
      '  "question": "pregunta estratégica e interesante para hacerle a la otra persona"\n' +
      '}\n' +
      'Reglas críticas: Todo DEBE ser sobre el tema exacto hablado (si hablan de música de Shakira, responde de Shakira; si hablan de una app, responde de la app). NUNCA hables de presupuestos o temas genéricos a menos que aparezcan en el texto. No uses formato markdown alrededor del JSON.';

    userPrompt = `Transcripción de la reunión:\n${transcriptText || '(La reunión acaba de iniciar)'}`;
  } else {
    systemPrompt =
      'Eres el copiloto IA de ReuLive, un asistente inteligente en reuniones en vivo. ' +
      'Tu objetivo es responder a la pregunta del usuario basándote ESTRICTAMENTE en la transcripción real proporcionada. ' +
      'SIEMPRE responde de forma directamente relevante al tema exacto de la transcripción. ' +
      'Si la transcripción habla de un tema (por ejemplo, aplicaciones, música, Shakira, etc.), tus respuestas DEBEN ser sobre ese tema exacto. ' +
      'Responde en español, de forma concisa, útil y accionable (usando negrita y listas).';

    userPrompt =
      `Tema detectado: ${topic || 'en curso'}\n\n` +
      `Transcripción reciente:\n${transcriptText || '(sin transcripción todavía)'}\n\n` +
      `Pregunta del usuario: ${userMessage}`;
  }

  // Modelos ordenados por velocidad y fiabilidad en Groq
  const groqModels = ['openai/gpt-oss-20b', 'groq/compound', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b'];

  if (groqKey) {
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
            max_tokens: 400,
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

            if (isCopilotMode) {
              try {
                // Parse JSON if clean or extract JSON substring
                const jsonMatch = reply.match(/\{[\s\S]*\}/);
                const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(reply);
                res.status(200).json({ copilot: parsed, provider: `groq (${model})` });
                return;
              } catch (parseErr) {
                console.warn('JSON parse error from model, trying next:', parseErr);
              }
            } else {
              res.status(200).json({ reply, provider: `groq (${model})` });
              return;
            }
          }
        } else {
          console.warn(`Groq model ${model} returned:`, r.status);
        }
      } catch (err) {
        console.error(`Groq request error for ${model}:`, err);
      }
    }
  }

  // Respaldo OpenRouter si Groq falla
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
            max_tokens: 400,
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
            if (isCopilotMode) {
              try {
                const jsonMatch = reply.match(/\{[\s\S]*\}/);
                const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(reply);
                res.status(200).json({ copilot: parsed, provider: `openrouter (${model})` });
                return;
              } catch (parseErr) {}
            } else {
              res.status(200).json({ reply, provider: `openrouter (${model})` });
              return;
            }
          }
        }
      } catch (err) {
        console.error(`OpenRouter error for ${model}:`, err);
      }
    }
  }

  res.status(502).json({ error: 'upstream_error', message: 'No se pudo obtener respuesta de ningún proveedor de IA.' });
}
