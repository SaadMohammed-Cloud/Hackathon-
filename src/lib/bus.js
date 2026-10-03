// Real-time alert bus.
//
// Three layers, so the demo works in every setup:
//   1. In-memory listeners  → Dispatcher + Commuter in the SAME tab (split view)
//   2. BroadcastChannel     → other tabs/windows in the SAME browser, no server needed
//   3. WebSocket relay      → other DEVICES (e.g. phones) on the network, via server/relay.js
//
// Alerts are de-duplicated by id, so an alert arriving over several layers is
// only shown and spoken once. History persists in localStorage.

const STORAGE_KEY = 'transitalert:history';
const MAX_HISTORY = 100;

const RELAY_URL =
  import.meta.env.VITE_RELAY_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`;

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
  devices: 0,
  tts: false, // relay has an AI voice (ElevenLabs) configured
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

// ---- Layer 3: WebSocket relay (cross-device) --------------------------------
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

connect();

// The relay also serves AI voice audio over plain HTTP on the same port.
const HTTP_BASE = RELAY_URL.replace(/^ws/, 'http');

// ---- Public API -------------------------------------------------------------
export const bus = {
  getState: () => state,
  relayUrl: RELAY_URL,
  ttsUrl: (alertId) => `${HTTP_BASE}/tts/${encodeURIComponent(alertId)}`,
  phraseUrl: (key) => `${HTTP_BASE}/tts/phrase/${encodeURIComponent(key)}`,

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
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'alert', alert }));
    return alert;
  },

  clear() {
    clearLocal();
    channel?.postMessage({ type: 'clear' });
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'clear' }));
  },
};
