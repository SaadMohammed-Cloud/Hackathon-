import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AlertBanner from './AlertBanner.jsx';
import { PriorityMark, Sheet, StationList, StationSign, Toggle } from './shared.jsx';
import { bus } from '../lib/bus.js';
import { ALL_STATIONS_ID, PHRASES, PRIORITIES, getStation, spokenText } from '../lib/stations.js';
import { dayLabel, formatClock, useBus, useNow, usePersistentState } from '../lib/hooks.js';
import * as announcer from '../lib/announcer.js';

const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // an alert stays "active" for 15 minutes
const LIVE_GRACE_MS = 2 * 60 * 1000; // never auto-speak anything older than 2 minutes

const DEFAULT_SETTINGS = {
  voice: true,
  chime: true,
  vibrate: true,
  repeat: 2,
  rate: 1,
  voiceURI: '',
  scale: 1,
  reduceMotion: false,
};

const matchesStation = (alert, stationId) =>
  alert.stationId === stationId || alert.stationId === ALL_STATIONS_ID;

// Voice choice: '' = automatic (AI voice when the relay has one, else best device voice),
// AI_VOICE = always try the AI voice, anything else = a specific device voice.
const AI_VOICE = 'ai';
const wantsAI = (s) => bus.getState().tts && (!s.voiceURI || s.voiceURI === AI_VOICE);
const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms));

// Speak with the natural AI voice if possible; fall back to the device voice
// so an announcement is never lost (relay down, no key, quota used up, offline).
async function say({ text, aiUrl, settings: s, repeat = 1 }) {
  if (wantsAI(s)) {
    try {
      await Promise.race([announcer.loadRemote(aiUrl), timeout(6000)]);
      await announcer.playRemote(aiUrl, { repeat });
      return;
    } catch (err) {
      console.warn('[TransitAlert] AI voice unavailable, using device voice:', err.message);
    }
  }
  announcer.speak(text, { rate: s.rate, repeat, voiceURI: s.voiceURI === AI_VOICE ? '' : s.voiceURI });
}


export default function Commuter({ embedded = false }) {
  const { alerts } = useBus();
  const now = useNow(10000);
  const [stationId, setStationId] = usePersistentState('transitalert:client:station', 'cta-red-howard');
  const [settings, setSettings] = usePersistentState('transitalert:client:settings', DEFAULT_SETTINGS);
  const [activated, setActivated] = useState(false);
  const [sheet, setSheet] = useState(null); // 'station' | 'settings' | null
  const [acknowledged, setAcknowledged] = useState(() => new Set());
  const [liveRegion, setLiveRegion] = useState('');

  // Refs so the live-alert listener always sees the latest values without re-subscribing.
  const latest = useRef({ stationId, settings, activated });
  latest.current = { stationId, settings, activated };

  const announce = useCallback(async (alert, { force = false } = {}) => {
    const { settings: s, activated: on } = latest.current;
    setLiveRegion(`${PRIORITIES[alert.priority]?.label ?? 'Alert'}: ${alert.message}`);
    if (!on) return; // audio is locked until the user taps "Turn on live alerts"
    const speakIt = s.voice || force;
    const aiUrl = bus.ttsUrl(alert.id);
    // Start downloading the AI voice while the chime plays, so there's no gap.
    if (speakIt && wantsAI(s)) announcer.loadRemote(aiUrl).catch(() => {});
    if (s.vibrate) announcer.vibrate(alert.priority);
    if (s.chime) await announcer.chime(alert.priority);
    if (speakIt) await say({ text: spokenText(alert), aiUrl, settings: s, repeat: force ? 1 : s.repeat });
  }, []);

  // React to brand-new alerts the instant they arrive.
  useEffect(
    () =>
      bus.onLiveAlert((alert) => {
        if (!matchesStation(alert, latest.current.stationId)) return;
        if (Date.now() - alert.createdAt > LIVE_GRACE_MS) return;
        setAcknowledged((prev) => {
          const next = new Set(prev);
          next.delete(alert.id);
          return next;
        });
        announce(alert);
      }),
    [announce],
  );

  // Stop talking if the user switches station or leaves the view.
  useEffect(() => announcer.stopSpeaking, []);
  useEffect(() => announcer.stopSpeaking(), [stationId]);

  const stationAlerts = useMemo(() => alerts.filter((a) => matchesStation(a, stationId)), [alerts, stationId]);
  const active = stationAlerts.find((a) => !acknowledged.has(a.id) && now - a.createdAt < ACTIVE_WINDOW_MS);
  const station = getStation(stationId);

  function activate(withAudio) {
    if (withAudio) {
      announcer.unlock();
      if (settings.voice) say({ text: PHRASES.greeting, aiUrl: bus.phraseUrl('greeting'), settings });
    } else {
      setSettings((s) => ({ ...s, voice: false, chime: false }));
    }
    setActivated(true);
  }

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const voices = useVoices();
  const { tts } = useBus();

  // Group the log by day: "Today", "Yesterday", ...
  const groups = useMemo(() => {
    const out = [];
    for (const a of stationAlerts) {
      const label = dayLabel(a.createdAt, now);
      if (out.at(-1)?.label !== label) out.push({ label, items: [] });
      out.at(-1).items.push(a);
    }
    return out;
  }, [stationAlerts, now]);

  const play = (alert) => {
    if (!activated) activate(true);
    else say({ text: spokenText(alert), aiUrl: bus.ttsUrl(alert.id), settings });
  };

  return (
    <div className={`flex flex-col bg-paper ${embedded ? 'min-h-full' : 'relative min-h-[calc(100dvh-57px)]'}`}>
      {/* Screen-reader announcement. Silent when our own voice is on, to avoid talking over it. */}
      <div className="sr-only" aria-live={activated && settings.voice ? 'off' : 'assertive'} aria-atomic="true">
        {liveRegion}
      </div>

      {!activated && <ActivationGate station={station} onActivate={activate} contained={embedded} />}

      <StationSign stationId={stationId} onChange={() => setSheet('station')}>
        <button
          type="button"
          onClick={() => setSheet('settings')}
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"
        >
          <span className="sr-only">Alert settings</span>
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h9M17 7h3M4 17h3M11 17h9" strokeLinecap="round" />
            <circle cx="15" cy="7" r="2" />
            <circle cx="9" cy="17" r="2" />
          </svg>
        </button>
      </StationSign>

      <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-10">
        <div className="pt-4">
          {active ? (
            <AlertBanner
              key={active.id}
              alert={active}
              now={now}
              scale={settings.scale}
              reduceMotion={settings.reduceMotion}
              onReplay={() => play(active)}
              onAcknowledge={() => {
                announcer.stopSpeaking();
                setAcknowledged((prev) => new Set(prev).add(active.id));
              }}
            />
          ) : (
            <AllClear station={station} />
          )}
        </div>

        <SoundSummary
          settings={settings}
          activated={activated}
          voiceName={voiceLabel(settings, voices, tts)}
          onOpen={() => setSheet('settings')}
          onEnable={() => {
            update({ voice: true, chime: true });
            activate(true);
          }}
        />

        <section aria-labelledby="log-heading" className="mt-8">
          <h2 id="log-heading" className="text-xl font-bold">
            Announcements
          </h2>
          {groups.length === 0 ? (
            <p className="mt-2 text-ink-2">
              Nothing yet. When staff make an announcement at {station.name}, it appears here with the time it was made.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mt-4">
                <h3 className="border-b border-rule pb-2 text-sm font-bold text-ink-3">{g.label}</h3>
                <ol className="divide-y divide-rule">
                  {g.items.map((a) => (
                    <li key={a.id} className="flex gap-3 py-4">
                      <time
                        dateTime={new Date(a.createdAt).toISOString()}
                        className="w-[4.5rem] shrink-0 pt-0.5 text-sm font-bold text-ink-2"
                      >
                        {formatClock(a.createdAt)}
                      </time>
                      <div className="min-w-0 flex-1">
                        <PriorityMark priority={a.priority} />
                        {a.stationId === ALL_STATIONS_ID && <span className="text-sm text-ink-3"> to all stations</span>}
                        <p className="mt-1 leading-snug" style={{ fontSize: `${1.0625 * settings.scale}rem` }}>
                          {a.message}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => play(a)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule text-ink hover:bg-mist"
                      >
                        <span className="sr-only">Play announcement from {formatClock(a.createdAt)}</span>
                        <svg aria-hidden viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
                          <path d="M7 4.5v15l12-7.5z" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </section>
      </div>

      {sheet === 'station' && (
        <Sheet title="Your station" onClose={() => setSheet(null)} contained={embedded}>
          <StationList
            value={stationId}
            onPick={(id) => {
              setStationId(id);
              setSheet(null);
            }}
          />
        </Sheet>
      )}
      {sheet === 'settings' && (
        <Sheet title="Alert settings" onClose={() => setSheet(null)} contained={embedded}>
          <SettingsPanel settings={settings} update={update} voices={voices} tts={tts} />
        </Sheet>
      )}
    </div>
  );
}

function voiceLabel(settings, voices, tts) {
  const custom = voices.find((v) => v.voiceURI === settings.voiceURI);
  if (custom) return custom.name;
  if (tts) return 'AI voice';
  return voices[0]?.name ?? 'device voice';
}

function ActivationGate({ station, onActivate, contained }) {
  const btnRef = useRef(null);
  useEffect(() => btnRef.current?.focus(), []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gate-title"
      className={`${contained ? 'absolute inset-0' : 'fixed inset-x-0 bottom-0 top-[57px]'} z-30 flex flex-col justify-end bg-paper px-6 pb-8 pt-10 sm:justify-center`}
    >
      <div className="mx-auto w-full max-w-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black">
          <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8 text-alert-warning" fill="currentColor">
            <path d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.8V3.5a1.5 1.5 0 0 0-3 0v.7A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z" />
          </svg>
        </div>
        <h2 id="gate-title" className="mt-6 text-[1.75rem] font-bold leading-tight">
          Hear and see station announcements
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">
          When staff make an announcement at {station.name}, your phone shows it in large text, reads it out loud and
          vibrates.
        </p>
        <button
          ref={btnRef}
          type="button"
          onClick={() => onActivate(true)}
          className="mt-8 min-h-[56px] w-full rounded-xl bg-black text-lg font-bold text-white hover:bg-black/85"
        >
          Turn on alerts with sound
        </button>
        <button
          type="button"
          onClick={() => onActivate(false)}
          className="mt-3 min-h-[52px] w-full rounded-xl border-2 border-black text-lg font-bold hover:bg-mist"
        >
          Text and vibration only
        </button>
        <p className="mt-5 text-sm text-ink-3">You can change this anytime in alert settings.</p>
      </div>
    </div>
  );
}

function AllClear({ station }) {
  return (
    <div className="flex gap-3 rounded-xl border border-rule px-4 py-4">
      <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok text-white">
        <svg viewBox="0 0 20 20" className="h-4 w-4">
          <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </svg>
      </span>
      <div>
        <p className="text-lg font-bold">No active alerts</p>
        <p className="text-ink-2">Nothing has been announced at {station.name} in the last 15 minutes.</p>
      </div>
    </div>
  );
}

function SoundSummary({ settings, activated, voiceName, onOpen, onEnable }) {
  const soundOn = activated && settings.voice;
  const extras = [settings.chime && 'chime', settings.vibrate && announcer.vibrationSupported && 'vibration']
    .filter(Boolean)
    .join(' and ');
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-mist px-4 py-3">
      <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-ink-2" fill="currentColor">
        {soundOn ? (
          <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
        ) : (
          <path d="M3 9v6h4l5 4V5L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" />
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{soundOn ? 'Reading alerts out loud' : 'Sound is off'}</p>
        <p className="text-sm text-ink-2">
          {soundOn ? `${voiceName}${extras ? `, plus ${extras}` : ''}` : 'Alerts show on screen only'}
        </p>
      </div>
      {soundOn ? (
        <button type="button" onClick={onOpen} className="shrink-0 rounded-lg px-2 py-1.5 font-bold text-alert-info hover:bg-white">
          Change
        </button>
      ) : (
        <button type="button" onClick={onEnable} className="shrink-0 rounded-lg bg-black px-3 py-2 text-sm font-bold text-white">
          Turn on
        </button>
      )}
    </div>
  );
}

function Segmented({ label, options, value, onChange }) {
  const id = `seg-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id} className="px-5 py-3">
      <p id={id} className="mb-2">
        {label}
      </p>
      <div className="grid gap-1 rounded-lg bg-mist p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map(([v, text, style]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            style={style}
            className={`min-h-[40px] rounded-md font-bold ${value === v ? 'bg-white shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, update, voices, tts }) {
  return (
    <div className="pb-4">
      <h3 className="px-5 pb-1 pt-5 text-sm font-bold text-ink-3">Sound</h3>
      <div className="divide-y divide-rule border-y border-rule">
        <Toggle
          label="Read alerts out loud"
          checked={settings.voice}
          onChange={(v) => {
            if (v) announcer.unlock();
            update({ voice: v });
          }}
          disabled={!announcer.speechSupported && !tts}
        />
        <VoicePicker settings={settings} update={update} voices={voices} tts={tts} />
        <Segmented
          label="Repeat each alert"
          value={settings.repeat}
          onChange={(v) => update({ repeat: v })}
          options={[
            [1, 'Once'],
            [2, 'Twice'],
            [3, '3 times'],
          ]}
        />
        <label className="block px-5 py-3">
          <span className="mb-2 flex justify-between">
            Speaking speed
            <span className="text-ink-3">{settings.rate === 1 ? 'Normal' : `${settings.rate.toFixed(2)}×`}</span>
          </span>
          <input
            type="range"
            min="0.6"
            max="1.4"
            step="0.05"
            value={settings.rate}
            onChange={(e) => update({ rate: Number(e.target.value) })}
            className="w-full accent-black"
          />
          {tts && <span className="mt-1 block text-sm text-ink-3">Applies to device voices only.</span>}
        </label>
        <Toggle label="Play a chime first" checked={settings.chime} onChange={(v) => update({ chime: v })} />
      </div>

      <h3 className="px-5 pb-1 pt-6 text-sm font-bold text-ink-3">Vibration and display</h3>
      <div className="divide-y divide-rule border-y border-rule">
        <Toggle
          label="Vibrate"
          hint={announcer.vibrationSupported ? undefined : 'Your phone’s browser doesn’t support vibration'}
          checked={settings.vibrate}
          onChange={(v) => update({ vibrate: v })}
          disabled={!announcer.vibrationSupported}
        />
        <Toggle
          label="Reduce flashing"
          hint="Keeps the alert steady instead of pulsing"
          checked={settings.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
        />
        <Segmented
          label="Text size"
          value={settings.scale}
          onChange={(v) => update({ scale: v })}
          options={[
            [1, 'Aa', { fontSize: '1rem' }],
            [1.25, 'Aa', { fontSize: '1.25rem' }],
            [1.5, 'Aa', { fontSize: '1.5rem' }],
          ]}
        />
      </div>
    </div>
  );
}

function useVoices() {
  const [voices, setVoices] = useState(() => announcer.listVoices());
  useEffect(() => {
    const refresh = () => setVoices(announcer.listVoices());
    refresh();
    return announcer.onVoicesChanged(refresh);
  }, []);
  return voices;
}

function VoicePicker({ settings, update, voices, tts }) {
  if (!tts && (!announcer.speechSupported || voices.length === 0)) return null;

  const deviceDefault = voices[0]?.voiceURI ?? '';
  const selected =
    settings.voiceURI && settings.voiceURI !== AI_VOICE && voices.some((v) => v.voiceURI === settings.voiceURI)
      ? settings.voiceURI
      : tts
        ? AI_VOICE
        : deviceDefault;

  return (
    <div className="px-5 py-3">
      <label htmlFor="voice-select" className="mb-2 block">
        Voice
      </label>
      <div className="flex gap-2">
        <select
          id="voice-select"
          value={selected}
          onChange={(e) => update({ voiceURI: e.target.value })}
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 focus:border-black focus:outline-none"
        >
          {tts && <option value={AI_VOICE}>AI voice (most natural)</option>}
          {voices.length > 0 && (
            <optgroup label="Voices on this device">
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          onClick={() => {
            announcer.unlock();
            say({ text: PHRASES.sample, aiUrl: bus.phraseUrl('sample'), settings: { ...settings, voiceURI: selected } });
          }}
          className="min-h-[44px] shrink-0 rounded-lg border border-black px-4 font-bold hover:bg-mist"
        >
          Listen
        </button>
      </div>
    </div>
  );
}
