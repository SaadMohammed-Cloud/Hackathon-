// Shared helpers for the Vercel functions in /api.
// Files starting with "_" are not deployed as routes.
//
// Alerts live in an Upstash Redis database (free), reached over its REST API.
// Add it in Vercel: Project → Storage → Upstash (Redis) → Create & connect.
// Vercel then sets KV_REST_API_URL / KV_REST_API_TOKEN automatically.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisConfigured = Boolean(REDIS_URL && REDIS_TOKEN);
export const ttsConfigured = Boolean(process.env.ELEVENLABS_API_KEY?.trim());

export const KEYS = { list: 'transitalert:alerts', ids: 'transitalert:ids' };
export const MAX_HISTORY = 100;

// Run several Redis commands in one round trip.
export async function redis(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const out = await res.json();
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Redis: ${failed.error}`);
  return out.map((r) => r.result);
}

export async function listAlerts() {
  const [rows] = await redis([['LRANGE', KEYS.list, 0, MAX_HISTORY - 1]]);
  return (rows || []).flatMap((r) => {
    try {
      return [JSON.parse(r)];
    } catch {
      return [];
    }
  });
}

const PRIORITIES = new Set(['info', 'warning', 'critical']);

export function isValidAlert(a) {
  return (
    a &&
    typeof a.id === 'string' &&
    /^[\w-]{1,64}$/.test(a.id) &&
    typeof a.stationId === 'string' &&
    a.stationId.length <= 64 &&
    typeof a.message === 'string' &&
    a.message.trim().length > 0 &&
    a.message.length <= 500 &&
    PRIORITIES.has(a.priority) &&
    Number.isFinite(a.createdAt)
  );
}

export function cleanAlert(a) {
  return {
    id: a.id,
    stationId: a.stationId,
    message: a.message.trim(),
    priority: a.priority,
    createdAt: a.createdAt,
    source: typeof a.source === 'string' ? a.source.slice(0, 60) : 'Dispatcher',
  };
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  if (Buffer.isBuffer(body)) return res.end(body);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
