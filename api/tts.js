// GET /api/tts?id=<alertId>   → MP3 of that alert, read in the ElevenLabs voice
// GET /api/tts?phrase=sample  → MP3 of a fixed phrase (greeting / sample)
//
// The text is always built on the server from a stored alert, so nobody can use
// this endpoint to spend your credits on arbitrary text. Responses are cached on
// Vercel's CDN, so each alert is only generated once no matter how many phones play it.

import { listAlerts, redisConfigured, send, ttsConfigured } from './_lib.js';
import { PHRASES, spokenText } from '../src/lib/stations.js';

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim() || 'EXAVITQu4vr4xnSDxMaL'; // "Sarah", a free default voice
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_flash_v2_5';
const API_BASE = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';

export default async function handler(req, res) {
  if (!ttsConfigured) return send(res, 503, { error: 'Add ELEVENLABS_API_KEY in Vercel → Settings → Environment Variables.' });

  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('id');
  const phrase = url.searchParams.get('phrase');

  let text = null;
  if (phrase) {
    text = Object.hasOwn(PHRASES, phrase) ? PHRASES[phrase] : null;
  } else if (id && redisConfigured) {
    const alert = (await listAlerts()).find((a) => a.id === id);
    text = alert ? spokenText(alert) : null;
  }
  if (!text) return send(res, 404, { error: 'Unknown alert' }, { 'Cache-Control': 'no-store' });

  const r = await fetch(`${API_BASE}/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY.trim(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
    }),
  });

  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error(`[tts] ElevenLabs ${r.status}: ${detail}`);
    return send(res, 502, { error: `ElevenLabs ${r.status}`, detail }, { 'Cache-Control': 'no-store' });
  }

  const audio = Buffer.from(await r.arrayBuffer());
  return send(res, 200, audio, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.length),
    // Browser keeps it a day; Vercel's CDN keeps it for good (same URL = same audio).
    'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
  });
}
