// ElevenLabs text-to-speech with a disk cache.
//
// Each distinct sentence is generated ONCE and saved to server/.tts-cache/,
// so replays, repeated quick alerts and every phone in the room cost nothing
// extra. That keeps a hackathon comfortably inside the free plan.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CACHE_DIR = fileURLToPath(new URL('./.tts-cache/', import.meta.url));
const API_BASE = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';

export function createTTS({ apiKey, voiceId, modelId }) {
  const enabled = Boolean(apiKey);
  const inflight = new Map();
  const status = { enabled, generated: 0, cacheHits: 0, lastError: null };

  async function synthesize(text) {
    if (!enabled) throw Object.assign(new Error('AI voice not configured'), { status: 503 });

    const key = createHash('sha1').update(`${voiceId}|${modelId}|${text}`).digest('hex');
    const file = path.join(CACHE_DIR, `${key}.mp3`);

    try {
      const cached = await readFile(file);
      status.cacheHits++;
      return cached;
    } catch {
      /* not cached yet */
    }

    // If two phones ask for the same alert at once, only call the API once.
    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
      const res = await fetch(
        `${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
          }),
        },
      );
      if (!res.ok) {
        let detail = (await res.text()).slice(0, 300);
        const hint =
          res.status === 401
            ? 'check ELEVENLABS_API_KEY in your .env file'
            : res.status === 402 || /quota/i.test(detail)
              ? 'free monthly credits used up, or this voice needs a paid plan'
              : res.status === 429
                ? 'too many requests, wait a moment'
                : null;
        if (hint) detail = `${hint} (${detail})`;
        status.lastError = `HTTP ${res.status}: ${detail}`;
        throw Object.assign(new Error(`ElevenLabs ${res.status}: ${detail}`), { status: 502 });
      }
      const audio = Buffer.from(await res.arrayBuffer());
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, audio);
      status.generated++;
      status.lastError = null;
      return audio;
    })().finally(() => inflight.delete(key));

    inflight.set(key, job);
    return job;
  }

  return { enabled, status, synthesize };
}
