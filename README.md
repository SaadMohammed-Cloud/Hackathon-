# TransitAlert 🚨

**Station PA announcements, delivered to every rider.**
TransitAlert turns live public-address announcements into high-priority alerts on commuters' phones — a flashing high-contrast banner for deaf and hard-of-hearing riders, automatic text-to-speech for blind and low-vision riders, and vibration for everyone. Think "Amber Alert", but for your train platform.

Built with **React 18 + Vite + Tailwind CSS**, plus a ~100-line **Node WebSocket relay** for real-time cross-device delivery.

---

## Quick start

Requires **Node.js 18+**.

```bash
npm install
npm start          # runs the relay (port 8787) + the web app (port 5173) together
```

Then open:

| View | URL |
|---|---|
| Commuter app | http://localhost:5173/#/client |
| Dispatcher console | http://localhost:5173/#/dispatch |
| Split demo (both side by side — best for judging) | http://localhost:5173/#/demo |

Prefer separate terminals? `npm run relay` in one, `npm run dev` in the other.

### Demo on a real phone (the "wow" moment)

1. Put your laptop and phone on the same Wi-Fi (a phone hotspot works great at hackathon venues).
2. `npm start` — Vite prints a **Network** URL like `http://192.168.1.23:5173`.
3. On the phone, open `http://192.168.1.23:5173/#/client` and tap **Turn on alerts with sound**.
4. On the laptop, open `/#/dispatch`, pick a quick alert, hit **Broadcast alert**.
5. The phone chimes, vibrates (Android), flashes, and reads the announcement aloud.

The pill in the top-right shows **Live · N devices** when the relay is connected. If your laptop firewall blocks port 8787, allow Node through it.

---

## How it works

```
Dispatcher ──broadcast()──► bus ──┬─► same tab        (in-memory listeners)
                                   ├─► other tabs      (BroadcastChannel, no server)
                                   └─► other devices   (WebSocket relay → server/relay.js)
                                                         │
Commuter ◄──────── onLiveAlert() ◄───────────────────────┘
   └─► banner + aria-live + chime + vibrate + speechSynthesis
```

- **Three delivery layers** so the demo never breaks: it works in one tab (split view), across tabs with no server, and across devices with the relay. Alerts are de-duplicated by ID, so nothing is shown or spoken twice.
- **Late joiners get history.** The relay sends the last 100 alerts on connect; they go into the log *quietly* — only genuinely new alerts are spoken.
- **Self-healing.** The client reconnects with backoff; a reconnecting client backfills anything the relay missed (again, quietly).
- **History persists** in `localStorage`, so a page reload doesn't wipe the log.
- **"All stations"** broadcasts reach every commuter regardless of the station they selected.

## Accessibility features

| Need | Feature |
|---|---|
| Blind / low vision | Automatic text-to-speech (`window.speechSynthesis`) with configurable repeat (1–3×) and speed; attention chime first so the rider knows to listen; full keyboard and screen-reader support |
| Screen-reader users | `aria-live="assertive"` region announces new alerts — automatically muted while the app's own voice is on, so the two don't talk over each other |
| Deaf / hard of hearing | High-contrast emergency banner with a pulsing border, timestamped text log, vibration patterns by priority |
| Low vision | Atkinson Hyperlegible font (designed by the Braille Institute), A / A+ / A++ text sizes, 48px+ touch targets, WCAG-contrast colour pairs |
| Photosensitivity | Flash rate is 1 Hz (WCAG 2.3.1 allows up to 3); honours the OS *reduce motion* setting plus an in-app **Reduce flashing** toggle |

**Priority levels:** *Notice* (blue, single chime), *Service Alert* (yellow, standard), *Urgent* (red, triple chime, longer vibration, flashing banner).

## Project structure

```
server/relay.js              WebSocket fan-out relay with validation, history and heartbeat
src/lib/bus.js               Real-time alert bus (memory + BroadcastChannel + WebSocket)
src/lib/announcer.js         Chime (Web Audio), text-to-speech, vibration
src/lib/stations.js          Stations, priority styles, quick-alert templates
src/lib/hooks.js             useBus, usePersistentState, hash routing, time formatting
src/components/Dispatcher.jsx   Operator console
src/components/Commuter.jsx     Rider app: activation, settings, banner, log
src/components/AlertBanner.jsx  The emergency-style banner
src/App.jsx                  Header, tabs, split demo
```

Add stations or quick alerts by editing `src/lib/stations.js`.

## AI voice (ElevenLabs, free plan)

For a genuinely human-sounding announcer on every phone:

1. Sign up free at [elevenlabs.io](https://elevenlabs.io), click your profile icon → **API Keys** → **Create API Key**, and copy it.
2. In the project folder, duplicate `.env.example`, rename the copy to `.env`, and paste the key after `ELEVENLABS_API_KEY=`.
3. Restart with `npm start`. The terminal should say `[voice] AI voice ON`.

How it works: when an alert is broadcast, the relay asks ElevenLabs for the audio **once**, saves it in `server/.tts-cache/`, and every phone downloads that same file from the relay. Replays and repeated quick alerts are free, so the ~10k monthly free credits go a long way. The commuter's Voice setting shows **✨ AI voice** (default when available). If ElevenLabs fails for any reason (bad key, credits used up, no internet), phones automatically fall back to the device voice, so an announcement is never lost. Check `http://localhost:8787/health` for the voice status and last error.

Change the voice with `ELEVENLABS_VOICE_ID` in `.env` (use a default voice; the free plan can't use Voice Library voices through the API).

## Device voices

When the AI voice is off, the app uses your device's built-in voices and automatically picks the most natural one installed (it skips macOS's robotic novelty voices). For the best sound on a Mac, download a free Premium voice:

**System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → English** → download **Ava (Premium)**, **Zoe (Premium)** or **Evan (Enhanced)**. Restart the browser and the app will pick it up. You can also choose a voice and hit **Test** in the commuter app's settings (sliders icon).

## Known browser limits (good to mention to judges)

- **Browsers won't play audio until the user taps the page.** That's why the commuter app opens with a one-tap "Turn on alerts" screen — it unlocks speech and the chime.
- **iOS:** speech is muted when the ring/silent switch is on, and Safari doesn't support the Vibration API. The visual banner always works.
- **Background tabs:** browsers throttle hidden tabs, so a phone with the screen locked won't speak. A production version would use Web Push + a service worker (or a native app) for lock-screen alerts.

## Deploying

The web app is static: `npm run build` → upload `dist/` to Vercel/Netlify. Host the relay anywhere that runs Node with WebSockets (Render, Railway, Fly.io), then build the frontend with its address:

```bash
VITE_RELAY_URL=wss://your-relay.onrender.com npm run build
```

(HTTPS pages must use a `wss://` relay.)

## Where this could go next

- Speech-to-text from the actual PA microphone (dispatcher speaks, riders read)
- Web Push for lock-screen alerts
- Auto-translate announcements into the rider's language
- Pull real service alerts from the CTA Customer Alerts API / GTFS-realtime
- Per-station presence counts and delivery receipts for dispatchers
