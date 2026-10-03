import { useEffect, useRef } from 'react';
import { ALL_STATIONS_ID, LINES, PRIORITIES, STATIONS, getStation } from '../lib/stations.js';
import { useBus } from '../lib/hooks.js';

// Round route bullets, like the line markers on CTA maps and signs.
export function RouteBullets({ lines, size = 'md' }) {
  const dims = size === 'sm' ? 'h-5 min-w-5 text-[11px]' : 'h-7 min-w-7 text-[13px]';
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {lines.map((key) => {
        const l = LINES[key];
        return (
          <span
            key={key}
            className={`inline-flex items-center justify-center rounded-full px-1 font-sign font-bold ${dims}`}
            style={{ background: l.color, color: l.darkText ? '#000' : '#fff' }}
          >
            {l.short}
          </span>
        );
      })}
    </span>
  );
}

// "Red Line", "Red, Purple and Yellow Lines", "Metra", "Airport Transit"
export function lineNames(lines) {
  if (!lines.length) return '';
  if (lines.length === 1) {
    const l = LINES[lines[0]];
    return lines[0] === 'metra' || lines[0] === 'airport' ? l.name : `${l.name} Line`;
  }
  const names = lines.map((l) => LINES[l].name);
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} Lines`;
}

// Replica of a CTA platform sign: black bar, white Helvetica station name,
// route bullets, and a stripe in the station's line colors along the bottom.
export function StationSign({ stationId, onChange, children }) {
  const s = getStation(stationId);
  const stripe = s.lines.length ? s.lines.map((l) => LINES[l].color) : ['#FFD200'];
  return (
    <div className="overflow-hidden bg-black text-white">
      <div className="flex items-start gap-3 px-4 pb-4 pt-5">
        <button
          type="button"
          onClick={onChange}
          className="group min-w-0 flex-1 text-left"
          aria-label={`Station: ${s.name}. Change station`}
        >
          <span className="block truncate font-sign text-[2.1rem] font-bold leading-none tracking-tight">{s.name}</span>
          <span className="mt-2.5 flex items-center gap-2">
            <RouteBullets lines={s.lines} />
            <span className="sr-only">{lineNames(s.lines)}</span>
            <span aria-hidden className="truncate text-sm text-white/70 group-hover:text-white">
              {s.area}
            </span>
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-white/60 group-hover:text-white">
              <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </button>
        {children}
      </div>
      <div className="flex h-2" aria-hidden>
        {stripe.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

// Small icon badge for each priority, matching the alert banner icons:
// notice = "!" in a navy circle, service alert = wrench in a yellow circle,
// urgent = "!" in a red triangle.
export function PriorityBadge({ priority, className = 'h-4 w-4' }) {
  if (priority === 'warning') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`}>
        <circle cx="12" cy="12" r="11.5" fill="#FFD200" />
        <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
        <g transform="translate(5.6 5.6) scale(0.54)">
          <path
            fill="#000"
            d="M22.7 19.3 13.6 10.2c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6.3 6.3 9 2 4.7C.9 7.1 1.3 10.1 3.3 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2-2c.4-.4.4-1 0-1.4z"
          />
        </g>
      </svg>
    );
  }
  if (priority === 'critical') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`}>
        <path d="M12 1.5 23.5 21.8H.5z" fill="#C8102E" strokeLinejoin="round" />
        <rect x="10.8" y="8.5" width="2.4" height="7" rx="1" fill="#fff" />
        <circle cx="12" cy="18.2" r="1.4" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`}>
      <circle cx="12" cy="12" r="11.5" fill="#2B4C7E" />
      <rect x="10.8" y="5.5" width="2.4" height="8.5" rx="1" fill="#fff" />
      <circle cx="12" cy="17.6" r="1.5" fill="#fff" />
    </svg>
  );
}

export function PriorityMark({ priority, withLabel = true }) {
  const p = PRIORITIES[priority] ?? PRIORITIES.info;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-2">
      <PriorityBadge priority={priority} />
      {withLabel && p.label}
    </span>
  );
}

export function ConnectionStatus() {
  const { relay, devices } = useBus();
  const text =
    relay === 'online'
      ? `${devices} ${devices === 1 ? 'device' : 'devices'} connected`
      : relay === 'connecting'
        ? 'Connecting'
        : 'This browser only';
  const dot = relay === 'online' ? 'bg-ok' : relay === 'connecting' ? 'bg-alert-warning' : 'bg-ink-3';
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-ink-2"
      title={
        relay === 'online'
          ? 'Alerts reach every device connected to the relay.'
          : 'The relay isn’t running, so alerts only sync between tabs in this browser.'
      }
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}

// Bottom sheet that slides up over its container (the page, or the demo phone).
export function Sheet({ title, onClose, children, contained = false }) {
  const panelRef = useRef(null);
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`${contained ? 'absolute' : 'fixed'} inset-0 z-40 flex items-end justify-center`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/40" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[85%] w-full max-w-lg animate-sheet-up overflow-y-auto rounded-t-2xl bg-paper pb-[max(1rem,env(safe-area-inset-bottom))] focus:outline-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="-mr-2 rounded-lg px-3 py-1.5 font-bold text-alert-info hover:bg-mist">
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StationList({ value, onPick, includeAll = false }) {
  const options = includeAll ? [getStation(ALL_STATIONS_ID), ...STATIONS] : STATIONS;
  return (
    <ul className="divide-y divide-rule">
      {options.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onPick(s.id)}
            aria-current={s.id === value ? 'true' : undefined}
            className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-mist"
          >
            <span className="flex w-16 shrink-0 justify-start">
              {s.lines.length ? <RouteBullets lines={s.lines} size="sm" /> : <span className="h-5 w-5 rounded-full bg-black" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{s.name}</span>
              <span className="block truncate text-sm text-ink-3">{s.area}</span>
            </span>
            {s.id === value && (
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 text-alert-info">
                <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`flex min-h-[56px] items-center justify-between gap-4 px-5 py-2 ${disabled ? 'opacity-40' : ''}`}>
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-ink-3">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-[30px] w-[50px] shrink-0 rounded-full bg-rule transition-colors peer-checked:bg-ok peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-alert-info after:absolute after:left-[2px] after:top-[2px] after:h-[26px] after:w-[26px] after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}
