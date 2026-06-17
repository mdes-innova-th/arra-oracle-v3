export const healthStates = ['checking', 'ok', 'degraded', 'down', 'draining', 'unknown'] as const;
export type HealthState = typeof healthStates[number];

type HeroTone = {
  dot: string;
  headline: string;
  detail: string;
  cta: string;
};

const tones: Record<HealthState, HeroTone> = {
  checking: {
    dot: 'bg-blue-400',
    headline: 'Checking Oracle health',
    detail: 'Simple mode is contacting the backend health endpoint.',
    cta: 'Refresh now',
  },
  ok: {
    dot: 'bg-emerald-400',
    headline: 'Oracle is ready',
    detail: 'Core services are responding and simple mode can continue.',
    cta: 'Open dashboard',
  },
  degraded: {
    dot: 'bg-amber-400',
    headline: 'Oracle is degraded',
    detail: 'The backend is reachable, but at least one dependency needs attention.',
    cta: 'Review status',
  },
  down: {
    dot: 'bg-red-500',
    headline: 'Oracle is offline',
    detail: 'Simple mode cannot reach the backend health endpoint yet.',
    cta: 'Try again',
  },
  draining: {
    dot: 'bg-purple-400',
    headline: 'Oracle is draining',
    detail: 'The backend is shutting down or refusing new work temporarily.',
    cta: 'Check again',
  },
  unknown: {
    dot: 'bg-slate-400',
    headline: 'Oracle health is unknown',
    detail: 'The latest response did not map cleanly to a known state.',
    cta: 'Retry health check',
  },
};

export function healthState(value: unknown): HealthState {
  if (value === 'ok') return 'ok';
  if (value === 'degraded') return 'degraded';
  if (value === 'down') return 'down';
  if (value === 'draining') return 'draining';
  if (value === 'checking') return 'checking';
  return 'unknown';
}

export function checkedAgo(checkedAt: number | null, now = Date.now()): string {
  if (!checkedAt) return 'not checked yet';
  const seconds = Math.max(0, Math.floor((now - checkedAt) / 1000));
  return `checked ${seconds}s ago`;
}

export function HealthHero({
  state,
  checkedAt,
  onAction,
}: {
  state: HealthState;
  checkedAt: number | null;
  onAction: () => void;
}) {
  const tone = tones[state];
  return (
    <section
      aria-live="polite"
      className="rounded-3xl border border-border bg-surface p-8 shadow-2xl"
      role="status"
    >
      <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.25em] text-text-muted">
        <span aria-hidden="true" className={`h-3 w-3 rounded-full ${tone.dot}`} />
        Simple mode
      </div>
      <h1 className="mt-4 text-4xl font-bold text-text">{tone.headline}</h1>
      <p className="mt-3 max-w-2xl text-base text-text-muted">{tone.detail}</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          className="focus-ring rounded-full bg-accent-solid px-5 py-3 text-sm font-semibold text-on-accent hover:bg-accent-solid"
          type="button"
          onClick={onAction}
        >
          {tone.cta}
        </button>
        <span className="text-sm text-text-muted">{checkedAgo(checkedAt)}</span>
      </div>
    </section>
  );
}
