import { ALL_STATIONS_ID, PRIORITIES } from '../lib/stations.js';
import { formatAgo, formatClock } from '../lib/hooks.js';

// The live alert. Bold, full-color and impossible to miss, like a
// wireless emergency alert, but in transit-signage colors.
export default function AlertBanner({ alert, now, scale, reduceMotion, onReplay, onAcknowledge }) {
  const p = PRIORITIES[alert.priority] ?? PRIORITIES.info;
  const onYellow = alert.priority === 'warning';
  const motion = reduceMotion ? '' : 'motion-safe:animate-alert-pulse';
  const flash = !reduceMotion && alert.priority === 'critical' ? 'motion-safe:animate-alert-flash' : '';

  return (
    <section
      aria-labelledby="active-alert-heading"
      className={`rounded-xl ${p.bg} ${p.text} ${motion}`}
      style={{ '--pulse': p.ring }}
    >
      <div className={`rounded-xl px-5 pb-5 pt-4 ${flash}`}>
        <div className="flex items-center gap-2.5">
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 shrink-0">
            <path d="M12 2.8 22.6 21H1.4z" fill="currentColor" />
            <rect x="10.9" y="9" width="2.2" height="6.4" rx="1" fill={onYellow ? '#FFD200' : p.ring} />
            <circle cx="12" cy="18" r="1.3" fill={onYellow ? '#FFD200' : p.ring} />
          </svg>
          <h2 id="active-alert-heading" className="text-lg font-bold">
            {p.label}
            {alert.stationId === ALL_STATIONS_ID && <span className="font-normal">, all stations</span>}
          </h2>
          <time
            dateTime={new Date(alert.createdAt).toISOString()}
            title={formatAgo(alert.createdAt, now)}
            className={`ml-auto shrink-0 text-sm font-bold ${onYellow ? 'text-black/70' : 'text-white/80'}`}
          >
            {formatClock(alert.createdAt, { seconds: false })}
          </time>
        </div>

        <p className="mt-3 font-bold leading-snug" style={{ fontSize: `${1.5 * scale}rem` }}>
          {alert.message}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onReplay}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-lg font-bold ${
              onYellow ? 'bg-black text-white hover:bg-black/85' : 'bg-white text-black hover:bg-white/90'
            }`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
            </svg>
            Play again
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className={`min-h-[48px] rounded-lg border-2 font-bold ${
              onYellow ? 'border-black hover:bg-black/10' : 'border-white hover:bg-white/15'
            }`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
