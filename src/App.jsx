import { useState } from 'react';
import Commuter from './components/Commuter.jsx';
import Dispatcher from './components/Dispatcher.jsx';
import { ConnectionStatus, OverlayHost } from './components/shared.jsx';
import { useHashRoute } from './lib/hooks.js';

const TABS = [
  { route: 'client', label: 'Rider app' },
  { route: 'dispatch', label: 'Dispatcher' },
  { route: 'demo', label: 'Side by side', wideOnly: true },
];

export default function App() {
  const route = useHashRoute('client');

  return (
    <div className="min-h-dvh bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-black focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 h-[57px] border-b border-rule bg-paper">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <a href="#/client" className="flex shrink-0 items-center gap-2" aria-label="TransitAlert home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
                <path d="M12 3.5 21.5 20h-19z" fill="#FFD200" />
                <rect x="11" y="9.5" width="2" height="5.5" rx="0.9" fill="#000" />
                <circle cx="12" cy="17.3" r="1.2" fill="#000" />
              </svg>
            </span>
            <span className="hidden text-lg font-bold sm:inline">TransitAlert</span>
          </a>
          <nav aria-label="Mode" className="flex h-full gap-5">
            {TABS.map((t) => (
              <a
                key={t.route}
                href={`#/${t.route}`}
                aria-current={route === t.route ? 'page' : undefined}
                className={`flex h-full items-center border-b-2 pt-0.5 font-bold ${
                  route === t.route ? 'border-black text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                } ${t.wideOnly ? 'hidden md:flex' : ''}`}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden sm:block">
            <ConnectionStatus />
          </div>
        </div>
      </header>

      <main id="main">
        {route === 'dispatch' && <Dispatcher />}
        {route === 'demo' && <SideBySide />}
        {route !== 'dispatch' && route !== 'demo' && <Commuter />}
      </main>
    </div>
  );
}

// For presenting: the dispatcher console next to a rider's phone.
function SideBySide() {
  // Layer on top of the phone screen that the rider app's pop-ups render into.
  const [phoneLayer, setPhoneLayer] = useState(null);
  return (
    <div className="min-h-[calc(100dvh-57px)] bg-mist">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-2xl border border-rule bg-paper">
          <Dispatcher embedded />
        </div>
        <div className="md:sticky md:top-[81px] md:self-start">
          <div className="relative mx-auto h-[760px] max-h-[calc(100dvh-120px)] w-full max-w-[380px] overflow-hidden rounded-[2.5rem] border-[10px] border-black bg-paper shadow-xl">
            <div className="h-full overflow-y-auto overscroll-contain">
              <OverlayHost.Provider value={{ el: phoneLayer }}>
                <Commuter embedded />
              </OverlayHost.Provider>
            </div>
            <div ref={setPhoneLayer} className="pointer-events-none absolute inset-0 z-40 [&>*]:pointer-events-auto" />
          </div>
          <p className="mt-3 text-center text-sm text-ink-3">Rider’s phone</p>
        </div>
      </div>
    </div>
  );
}
