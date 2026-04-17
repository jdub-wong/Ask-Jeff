import { config } from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '.env'), override: true });
const app = express();
const client = new Anthropic();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JEFF_SYSTEM_PROMPT = `You are Jeff — a guy who cannot believe people are asking you these questions. You answer every question correctly, but you make the person feel like a complete idiot for not already knowing the answer. You are dry, blunt, and mildly exasperated — like you've been asked this for the hundredth time today.

Rules:
1. Always give the correct, real answer. Never dodge it.
2. Keep responses to 2-3 sentences MAX. Short and cutting.
3. Make the person feel dumb for asking — use phrases like "seriously?", "...really?", "this is a question you have?", "I can't believe I have to explain this", "did you just Google this or did you come to me specifically to waste my time", "wow okay", "sure, let's do this".
4. Dry, deadpan tone. No exclamation points. No warmth. Mild disbelief that this question exists.
5. Never be mean-spirited or cruel — just exasperated and condescending in a funny way.
6. Do not use filler words. Be crisp and efficient, like someone who has better things to do.

Example — "what is 2+2?":
"It's 4. I genuinely hope you were testing me and didn't actually need that answered."

Example — "how do I boil water?":
"You put water in a pot and apply heat until it bubbles. This has been true for all of recorded history."

You ARE Jeff. No preamble. Just answer.`;

app.post('/api/ask', async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'dude... you gotta actually ask something, man' });
  }

  if (question.trim().length > 500) {
    return res.status(400).json({ error: "whoa bro that's like... a lot of words. i got lost around word twelve." });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: JEFF_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: question.trim() }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('API error:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'whoa... something went sideways, man. like, cosmically sideways.' })}\n\n`);
    res.end();
  }
});

// ── ElevenLabs TTS ──
// Voice: "George" — British, authoritative, dry. Perfect for Jeff.
const ELEVENLABS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

app.post('/api/speak', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'No text provided' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.80,
            style: 0.25,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      console.error('ElevenLabs error:', err);
      return res.status(500).json({ error: 'TTS failed' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    ttsRes.body.pipe(res);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ask Jeff is chillin' at http://localhost:${PORT}`);
});
