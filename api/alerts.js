// GET    /api/alerts  → recent alerts (newest first) + whether the AI voice is on
// POST   /api/alerts  → { alert } broadcast a new alert
// DELETE /api/alerts  → clear history everywhere

import { KEYS, MAX_HISTORY, cleanAlert, isValidAlert, listAlerts, readJson, redis, redisConfigured, send, ttsConfigured } from './_lib.js';

export default async function handler(req, res) {
  const noStore = { 'Cache-Control': 'no-store' };

  if (!redisConfigured) {
    return send(res, 503, { configured: false, error: 'Add an Upstash Redis database to this Vercel project.' }, noStore);
  }

  try {
    if (req.method === 'GET') {
      return send(res, 200, { configured: true, tts: ttsConfigured, alerts: await listAlerts() }, noStore);
    }

    if (req.method === 'POST') {
      const { alert } = await readJson(req);
      if (!isValidAlert(alert)) return send(res, 400, { error: 'Invalid alert' }, noStore);
      const clean = cleanAlert(alert);
      // SADD returns 1 only the first time we see this id, so retries don't duplicate.
      const [isNew] = await redis([['SADD', KEYS.ids, clean.id]]);
      if (isNew) {
        await redis([
          ['LPUSH', KEYS.list, JSON.stringify(clean)],
          ['LTRIM', KEYS.list, 0, MAX_HISTORY - 1],
        ]);
      }
      return send(res, 201, { ok: true }, noStore);
    }

    if (req.method === 'DELETE') {
      await redis([['DEL', KEYS.list, KEYS.ids]]);
      return send(res, 200, { ok: true }, noStore);
    }

    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST, DELETE' });
  } catch (err) {
    console.error('[alerts]', err);
    return send(res, 502, { error: err.message }, noStore);
  }
}
