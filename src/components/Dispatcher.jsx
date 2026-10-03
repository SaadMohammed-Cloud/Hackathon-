import { useRef, useState } from 'react';
import { PriorityMark, RouteBullets, Sheet, StationList } from './shared.jsx';
import { bus } from '../lib/bus.js';
import { ALL_STATIONS_ID, PRIORITIES, QUICK_ALERTS, getStation } from '../lib/stations.js';
import { dayLabel, formatAgo, formatClock, useBus, useNow, usePersistentState } from '../lib/hooks.js';

const MAX_LEN = 500;

export default function Dispatcher({ embedded = false }) {
  const { alerts, relay } = useBus();
  const now = useNow(15000);
  const [stationId, setStationId] = usePersistentState('transitalert:dispatch:station', 'cta-red-howard');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('warning');
  const [sent, setSent] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pickingStation, setPickingStation] = useState(false);
  const textRef = useRef(null);

  const station = getStation(stationId);
  const canSend = message.trim().length > 0;
  const today = alerts.filter((a) => dayLabel(a.createdAt, now) === 'Today');

  function applyTemplate(t) {
    setMessage(t.message);
    setPriority(t.priority);
    textRef.current?.focus();
  }

  function send(e) {
    e?.preventDefault();
    if (!canSend) return;
    const alert = bus.broadcast({ stationId, message, priority });
    setMessage('');
    setSent(alert);
    setTimeout(() => setSent((c) => (c?.id === alert.id ? null : c)), 5000);
    textRef.current?.focus();
  }

  return (
    <div
      className={`mx-auto grid w-full gap-x-12 gap-y-10 px-5 py-6 ${
        embedded ? '' : 'max-w-6xl lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:py-10'
      }`}
    >
      <form onSubmit={send} aria-labelledby="dispatch-heading">
        <h1 id="dispatch-heading" className="text-2xl font-bold">
          New announcement
        </h1>
        <p className="mt-1 text-ink-2">Riders at the station see it on their phones and hear it read out loud.</p>

        {/* Station */}
        <div className="mt-6">
          <span id="station-label" className="mb-1.5 block font-bold">
            Station
          </span>
          <button
            type="button"
            aria-labelledby="station-label station-value"
            onClick={() => setPickingStation(true)}
            className="flex min-h-[52px] w-full items-center gap-3 rounded-lg border border-rule px-3 text-left hover:border-ink-3"
          >
            {station.lines.length ? (
              <RouteBullets lines={station.lines} size="sm" />
            ) : (
              <span className="h-5 w-5 rounded-full bg-black" aria-hidden />
            )}
            <span id="station-value" className="flex-1 font-bold">
              {station.name}
              <span className="ml-2 font-normal text-ink-3">{station.area}</span>
            </span>
            <span className="text-sm font-bold text-alert-info">Change</span>
          </button>
        </div>

        {/* Message */}
        <div className="mt-6">
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="dispatch-message" className="font-bold">
              Message
            </label>
            {message.length > MAX_LEN * 0.8 && (
              <span className="text-sm text-ink-3">{MAX_LEN - message.length} characters left</span>
            )}
          </div>
          <textarea
            id="dispatch-message"
            ref={textRef}
            rows={3}
            maxLength={MAX_LEN}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e);
            }}
            placeholder="Type what you’d say over the PA"
            className="w-full resize-y rounded-lg border border-rule px-3 py-2.5 text-lg leading-snug placeholder:text-ink-3 focus:border-black focus:outline-none"
          />
        </div>

        {/* Common announcements */}
        <div className="mt-4">
          <p className="mb-2 text-sm text-ink-2">Or start from a common announcement:</p>
          <ul className="flex flex-wrap gap-2">
            {QUICK_ALERTS.map((t) => (
              <li key={t.label}>
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  aria-pressed={message === t.message}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 text-sm font-bold ${
                    message === t.message ? 'border-black bg-black text-white' : 'border-rule hover:border-ink-3'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-sm ${PRIORITIES[t.priority].swatch} ${
                      t.priority === 'warning' && message !== t.message ? 'ring-1 ring-black/20' : ''
                    }`}
                  />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Priority */}
        <fieldset className="mt-6">
          <legend className="mb-1.5 font-bold">How urgent is it?</legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-mist p-1">
            {Object.entries(PRIORITIES).map(([key, p]) => (
              <label
                key={key}
                className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-alert-info ${
                  priority === key ? 'bg-white shadow-sm' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  value={key}
                  checked={priority === key}
                  onChange={() => setPriority(key)}
                  className="sr-only"
                />
                <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${p.swatch} ${key === 'warning' ? 'ring-1 ring-black/20' : ''}`} />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Preview + send */}
        <div className="mt-8 border-t border-rule pt-6">
          {canSend && (
            <div className="mb-5" aria-label="What riders will see">
              <p className="mb-2 text-sm text-ink-2">Riders will see:</p>
              <div className={`rounded-xl px-4 py-3 ${PRIORITIES[priority].bg} ${PRIORITIES[priority].text}`}>
                <p className="font-bold">
                  {PRIORITIES[priority].label}
                  {stationId === ALL_STATIONS_ID && <span className="font-normal">, all stations</span>}
                </p>
                <p className="mt-1 text-lg font-bold leading-snug">{message}</p>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={!canSend}
            className="min-h-[56px] w-full rounded-xl bg-black px-5 text-lg font-bold text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3"
          >
            {stationId === ALL_STATIONS_ID ? 'Broadcast to all stations' : `Broadcast to ${station.name}`}
          </button>
          <div aria-live="polite" className="mt-3 min-h-[24px] text-center">
            {sent && (
              <p className="animate-fade-in font-bold text-ok">
                Broadcast to {getStation(sent.stationId).name} at {formatClock(sent.createdAt)}
                {relay !== 'online' && (
                  <span className="block font-normal text-ink-3">
                    Only this browser received it. Start the relay to reach phones.
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </form>

      {/* History */}
      <section aria-labelledby="sent-heading">
        <div className="flex items-baseline justify-between border-b border-rule pb-3">
          <h2 id="sent-heading" className="text-lg font-bold">
            Sent today
            <span className="ml-2 font-normal text-ink-3">{today.length}</span>
          </h2>
          {alerts.length > 0 &&
            (confirmClear ? (
              <span className="flex items-center gap-3 text-sm">
                <span className="text-ink-2">Remove from every device?</span>
                <button
                  type="button"
                  className="font-bold text-alert-critical"
                  onClick={() => {
                    bus.clear();
                    setConfirmClear(false);
                  }}
                >
                  Clear all
                </button>
                <button type="button" className="font-bold text-ink-2" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="text-sm font-bold text-ink-2 hover:text-ink" onClick={() => setConfirmClear(true)}>
                Clear history
              </button>
            ))}
        </div>
        {alerts.length === 0 ? (
          <p className="py-6 text-ink-2">Announcements you send will be listed here.</p>
        ) : (
          <ol className="max-h-[70vh] divide-y divide-rule overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id} className="group flex gap-4 py-4">
                <time
                  className="w-[4.5rem] shrink-0 text-sm font-bold text-ink-2"
                  dateTime={new Date(a.createdAt).toISOString()}
                  title={formatAgo(a.createdAt, now)}
                >
                  {formatClock(a.createdAt)}
                  {dayLabel(a.createdAt, now) !== 'Today' && (
                    <span className="block font-normal text-ink-3">{dayLabel(a.createdAt, now)}</span>
                  )}
                </time>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <PriorityMark priority={a.priority} />
                    <span className="text-sm text-ink-3">{getStation(a.stationId).name}</span>
                  </div>
                  <p className="mt-1 leading-snug">{a.message}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStationId(a.stationId);
                      setPriority(a.priority);
                      setMessage(a.message);
                      textRef.current?.focus();
                    }}
                    className="mt-1 text-sm font-bold text-alert-info hover:underline"
                  >
                    Send again
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pickingStation && (
        <Sheet title="Send to" onClose={() => setPickingStation(false)}>
          <StationList
            value={stationId}
            includeAll
            onPick={(id) => {
              setStationId(id);
              setPickingStation(false);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
