// TransitAlert relay — real-time fan-out + AI voice.
//
// • WebSocket: every connected browser (dispatchers and commuters, on any
//   device on the network) gets each broadcast instantly. New clients receive
//   recent history on connect.
// • HTTP: GET /tts/:alertId returns the announcement as natural-sounding MP3
//   audio from ElevenLabs (if ELEVENLABS_API_KEY is set in .env). Audio is
//   generated once per alert and cached, so every phone plays the same file.
//
//   node server/relay.js          (defaults to port 8787)

import http from 'node:http';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createTTS } from './tts.js';
import { PHRASES, spokenText } from '../src/lib/stations.js';

loadEnv(fileURLToPath(new URL('../.env', import.meta.url)));

const PORT = Number(process.env.PORT) || 8787;
const MAX_HISTORY = 100;
const MAX_MESSAGE_LEN = 500;
const PRIORITIES = new Set(['info', 'warning', 'critical']);

const tts = createTTS({
  apiKey: process.env.ELEVENLABS_API_KEY?.trim(),
  // "Sarah" — one of ElevenLabs' default voices, available on the free plan.
  voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || 'EXAVITQu4vr4xnSDxMaL',
  // Flash is the fastest model and uses fewer credits than the premium models.
  modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_flash_v2_5',
});

let history = [];

// ---- HTTP: AI voice audio ---------------------------------------------------
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size, alerts: history.length, tts: tts.status }, null, 2));
    return;
  }

  const match = url.pathname.match(/^\/tts\/(phrase\/)?([\w-]{1,64})$/);
  if (req.method !== 'GET' || !match) {
    res.writeHead(404).end('Not found');
    return;
  }

  let text;
  if (match[1]) {
    text = PHRASES[match[2]];
  } else {
    const alert = history.find((a) => a.id === match[2]);
    text = alert && spokenText(alert);
  }
  if (!text) {
    res.writeHead(404).end('Unknown alert');
    return;
  }

  try {
    const audio = await tts.synthesize(text);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(audio);
  } catch (err) {
    console.warn(`[voice] ${err.message}`);
    res.writeHead(err.status || 500).end(err.message);
  }
});

// ---- WebSocket: real-time alerts --------------------------------------------
const wss = new WebSocketServer({ server });

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function fanOut(payload, except) {
  for (const client of wss.clients) {
    if (client !== except) send(client, payload);
  }
}

function broadcastPresence() {
  fanOut({ type: 'presence', count: wss.clients.size });
}

function isValidAlert(a) {
  return (
    a &&
    typeof a.id === 'string' &&
    /^[\w-]{1,64}$/.test(a.id) &&
    typeof a.stationId === 'string' &&
    typeof a.message === 'string' &&
    a.message.trim().length > 0 &&
    a.message.length <= MAX_MESSAGE_LEN &&
    PRIORITIES.has(a.priority) &&
    Number.isFinite(a.createdAt)
  );
}

function clean(a) {
  return {
    id: a.id,
    stationId: a.stationId.slice(0, 64),
    message: a.message.trim(),
    priority: a.priority,
    createdAt: a.createdAt,
    source: typeof a.source === 'string' ? a.source.slice(0, 60) : 'Dispatcher',
  };
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  send(ws, { type: 'config', tts: tts.enabled });
  send(ws, { type: 'sync', alerts: history });
  broadcastPresence();
  console.log(`[relay] client connected (${req.socket.remoteAddress}) — ${wss.clients.size} online`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'alert' && isValidAlert(msg.alert)) {
      const alert = clean(msg.alert);
      if (history.some((a) => a.id === alert.id)) return;
      history = [alert, ...history].slice(0, MAX_HISTORY);
      fanOut({ type: 'alert', alert }, ws);
      console.log(`[relay] ${alert.priority.toUpperCase()} @ ${alert.stationId}: ${alert.message}`);
      // Start generating the voice right away so it's ready when phones ask for it.
      if (tts.enabled) tts.synthesize(spokenText(alert)).catch(() => {});
    } else if (msg.type === 'backfill' && Array.isArray(msg.alerts)) {
      // A reconnecting client sharing alerts the relay missed. Store them and
      // pass them on as quiet history (not as new, spoken alerts).
      const known = new Set(history.map((a) => a.id));
      const fresh = msg.alerts.slice(0, MAX_HISTORY).filter(isValidAlert).map(clean).filter((a) => !known.has(a.id));
      if (!fresh.length) return;
      history = [...history, ...fresh].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY);
      fanOut({ type: 'sync', alerts: fresh }, ws);
    } else if (msg.type === 'clear') {
      history = [];
      fanOut({ type: 'clear' }, ws);
      console.log('[relay] history cleared');
    }
  });

  ws.on('close', () => {
    broadcastPresence();
    console.log(`[relay] client left — ${wss.clients.size} online`);
  });
});

// Drop dead connections (phones that went to sleep, closed tabs).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  const lanIps = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log(`[relay] TransitAlert relay listening on ws://localhost:${PORT}`);
  for (const ip of lanIps) console.log(`[relay]   on your network: ws://${ip}:${PORT}`);
  console.log(
    tts.enabled
      ? '[voice] AI voice ON (ElevenLabs) — check http://localhost:' + PORT + '/health'
      : '[voice] AI voice OFF — add ELEVENLABS_API_KEY to .env to enable. Using device voices.',
  );
});

// Minimal .env loader (KEY=value lines), so no extra dependency is needed.
function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}
