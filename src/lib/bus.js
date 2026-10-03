// Real-time alert bus.
//
// Three layers, so the demo works in every setup:
//   1. In-memory listeners  → Dispatcher + Commuter in the SAME tab (split view)
//   2. BroadcastChannel     → other tabs/windows in the SAME browser, no server needed
//   3. Other DEVICES (e.g. phones), one of two ways:
//      • Local / self-hosted: WebSocket relay (server/relay.js), instant.
//      • Deployed on Vercel:  /api/alerts, checked every couple of seconds
//        (Vercel can't keep a WebSocket server running).
//
// Alerts are de-duplicated by id, so an alert arriving over several layers is
// only shown and spoken once. History persists in localStorage.

const STORAGE_KEY = 'transitalert:history';
const MAX_HISTORY = 100;

const RELAY_URL =
  import.meta.env.VITE_RELAY_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`;

// On a deployed HTTPS site with no relay configured (e.g. Vercel), use the /api functions.
const USE_API =
  import.meta.env.VITE_USE_API === '1' || (location.protocol === 'https:' && !import.meta.env.VITE_RELAY_URL);
const POLL_MS = 2000;
const POLL_HIDDEN_MS = 15000;

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(alerts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    /* storage full or blocked — history just won't survive reload */
  }
}

function makeId() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
}

let state = {
  alerts: loadHistory(),
  relay: 'connecting', // 'connecting' | 'online' | 'offline'
  devices: USE_API ? null : 0, // null = unknown (API mode can't count devices)
  tts: false, // server has an AI voice (ElevenLabs) configured
};
const seen = new Set(state.alerts.map((a) => a.id));
const stateListeners = new Set();
const liveListeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  stateListeners.forEach((fn) => fn(state));
}

// `live` = this alert just happened (speak it). Synced history is not live.
function ingest(alert, { live }) {
  if (!alert || seen.has(alert.id)) return false;
  seen.add(alert.id);
  const alerts = [alert, ...state.alerts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_HISTORY);
  saveHistory(alerts);
  setState({ alerts });
  if (live) liveListeners.forEach((fn) => fn(alert));
  return true;
}

function clearLocal() {
  seen.clear();
  saveHistory([]);
  setState({ alerts: [] });
}

// ---- Layer 2: BroadcastChannel (same browser, cross-tab) --------------------
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('transitalert') : null;
channel?.addEventListener('message', ({ data }) => {
  if (data?.type === 'alert') ingest(data.alert, { live: true });
  if (data?.type === 'clear') clearLocal();
});

// ---- Layer 3a: WebSocket relay (cross-device, local) -------------------------
let ws = null;
let retryMs = 1000;

function connect() {
  setState({ relay: 'connecting' });
  try {
    ws = new WebSocket(RELAY_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.addEventListener('open', () => {
    retryMs = 1000;
    setState({ relay: 'online' });
    // Hand the relay anything it may have missed (e.g. sent while it was down).
    // Sent as backfill so other devices log it quietly instead of announcing it.
    if (state.alerts.length) ws.send(JSON.stringify({ type: 'backfill', alerts: state.alerts }));
  });
  ws.addEventListener('message', ({ data }) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === 'sync') msg.alerts.forEach((a) => ingest(a, { live: false }));
    if (msg.type === 'alert') {
      // Relay alerts are new by definition; forward to our other tabs too.
      if (ingest(msg.alert, { live: true })) channel?.postMessage(msg);
    }
    if (msg.type === 'clear') {
      clearLocal();
      channel?.postMessage({ type: 'clear' });
    }
    if (msg.type === 'presence') setState({ devices: msg.count });
    if (msg.type === 'config') setState({ tts: Boolean(msg.tts) });
  });
  ws.addEventListener('close', () => {
    setState({ relay: 'offline', devices: 0, tts: false });
    scheduleReconnect();
  });
  ws.addEventListener('error', () => ws?.close());
}

function scheduleReconnect() {
  setTimeout(connect, retryMs);
  retryMs = Math.min(retryMs * 2, 15000);
}

// ---- Layer 3b: HTTP API (cross-device, Vercel) --------------------------------
// The server's list is the source of truth. Any id we haven't seen before is a
// new alert and gets announced (except on the very first load, which is history).
let synced = false;
let pollTimer = null;
let polling = false;
const pending = new Map(); // alerts sent from here that the server hasn't returned yet

async function poll() {
  if (polling) return;
  polling = true;
  clearTimeout(pollTimer);
  try {
    const res = await fetch('/api/alerts', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.configured) throw new Error(data.error || `HTTP ${res.status}`);

    const server = data.alerts;
    const fresh = server.filter((a) => !seen.has(a.id));
    server.forEach((a) => {
      seen.add(a.id);
      pending.delete(a.id);
    });

    // Keep alerts we just sent that haven't shown up on the server yet.
    for (const [id, a] of pending) if (Date.now() - a.createdAt > 30000) pending.delete(id);
    const alerts = [...server, ...pending.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY);
    saveHistory(alerts);
    setState({ alerts, relay: 'online', tts: Boolean(data.tts) });

    if (synced) fresh.forEach((a) => liveListeners.forEach((fn) => fn(a)));
    synced = true;
  } catch (err) {
    if (state.relay !== 'offline') console.warn('[TransitAlert] Alerts API unavailable:', err.message);
    setState({ relay: 'offline', tts: false });
  } finally {
    polling = false;
    pollTimer = setTimeout(poll, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
  }
}

// Check right away when the phone comes back to the tab.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && USE_API) poll();
});

async function apiSend(method, body) {
  const res = await fetch('/api/alerts', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

if (USE_API) poll();
else connect();

// The relay serves AI voice audio over plain HTTP on the same port.
const HTTP_BASE = RELAY_URL.replace(/^ws/, 'http');

// ---- Public API -------------------------------------------------------------
export const bus = {
  getState: () => state,
  mode: USE_API ? 'api' : 'relay',
  ttsUrl: (alertId) =>
    USE_API ? `/api/tts?id=${encodeURIComponent(alertId)}` : `${HTTP_BASE}/tts/${encodeURIComponent(alertId)}`,
  phraseUrl: (key) =>
    USE_API ? `/api/tts?phrase=${encodeURIComponent(key)}` : `${HTTP_BASE}/tts/phrase/${encodeURIComponent(key)}`,

  subscribe(fn) {
    stateListeners.add(fn);
    return () => stateListeners.delete(fn);
  },

  onLiveAlert(fn) {
    liveListeners.add(fn);
    return () => liveListeners.delete(fn);
  },

  broadcast({ stationId, message, priority, source = 'Station agent' }) {
    const alert = {
      id: makeId(),
      stationId,
      message: message.trim().slice(0, 500),
      priority,
      source,
      createdAt: Date.now(),
    };
    ingest(alert, { live: true });
    channel?.postMessage({ type: 'alert', alert });
    if (USE_API) {
      pending.set(alert.id, alert);
      apiSend('POST', { alert }).catch((err) => console.warn('[TransitAlert] Broadcast failed:', err.message));
    } else if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'alert', alert }));
    }
    return alert;
  },

  clear() {
    clearLocal();
    channel?.postMessage({ type: 'clear' });
    if (USE_API) {
      pending.clear();
      apiSend('DELETE').catch((err) => console.warn('[TransitAlert] Clear failed:', err.message));
    } else if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'clear' }));
    }
  },
};
