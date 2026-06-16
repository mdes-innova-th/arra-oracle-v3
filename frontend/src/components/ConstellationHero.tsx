import type { ReactNode } from 'react';

export type HeroVitals = {
  menu: number;
  plugins: number;
  surfaces: number;
  requests: ReactNode;
  latency: ReactNode;
  active: ReactNode;
  uptime: ReactNode;
  updatedAt: string;
  loading: boolean;
};

type Node = { cx: number; cy: number; r: number; label: string; value?: number; tone: 'teal' | 'violet' | 'sky' };

function nodes(v: HeroVitals): Node[] {
  return [
    { cx: 200, cy: 70, r: 7, label: 'Menu', value: v.menu, tone: 'teal' },
    { cx: 318, cy: 150, r: 6, label: 'Plugins', value: v.plugins, tone: 'violet' },
    { cx: 300, cy: 300, r: 5, label: 'Surfaces', value: v.surfaces, tone: 'sky' },
    { cx: 110, cy: 318, r: 6, label: 'Vector', tone: 'teal' },
    { cx: 70, cy: 150, r: 5, label: 'MCP', tone: 'violet' },
  ];
}

const TONE: Record<Node['tone'], string> = { teal: '#2dd4bf', violet: '#a855f7', sky: '#38bdf8' };

function Constellation({ v }: { v: HeroVitals }) {
  return (
    <div className="relative h-full min-h-[15rem] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-xl shadow-black/20">
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 animate-[spin_18s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(45,212,191,0.18)_40deg,transparent_90deg)]" />
      <p className="relative text-xs font-medium uppercase tracking-[0.2em] text-teal-300">Oracle vitals</p>
      <p className="relative mt-1 text-sm text-slate-400">Live knowledge surface · {v.updatedAt}</p>
      <svg viewBox="0 0 400 400" className="relative mx-auto mt-2 h-52 w-full max-w-[22rem]" aria-hidden="true">
        {[60, 110, 160].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
        ))}
        {nodes(v).map((n) => (
          <line key={`l-${n.label}`} x1="200" y1="200" x2={n.cx} y2={n.cy} stroke="rgba(45,212,191,0.12)" strokeWidth="1" />
        ))}
        <circle cx="200" cy="200" r="26" fill="url(#core)" className="animate-pulse" />
        <circle cx="200" cy="200" r="14" fill="#5eead4" />
        {nodes(v).map((n) => (
          <g key={n.label}>
            <circle cx={n.cx} cy={n.cy} r={n.r + 4} fill={TONE[n.tone]} opacity="0.18" />
            <circle cx={n.cx} cy={n.cy} r={n.r} fill={TONE[n.tone]} />
            <text x={n.cx} y={n.cy - n.r - 6} textAnchor="middle" className="fill-slate-300 text-[11px] font-medium">{n.label}</text>
            {n.value !== undefined ? (
              <text x={n.cx} y={n.cy + n.r + 14} textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">{n.value}</text>
            ) : null}
          </g>
        ))}
        <defs>
          <radialGradient id="core">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="60%" stopColor="#2dd4bf" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

function VitalTile({ label, value, detail, accent }: { label: string; value: ReactNode; detail: string; accent?: boolean }) {
  return (
    <div className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300/30 hover:shadow-2xl hover:shadow-teal-950/20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold ${accent ? 'bg-gradient-to-br from-teal-300 to-violet-400 bg-clip-text text-transparent' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function ConstellationHero({ v }: { v: HeroVitals }) {
  return (
    <section aria-label="Oracle overview" className="grid gap-3 sm:gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Constellation v={v} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <VitalTile label="Menu items" value={v.loading ? '…' : v.menu} detail="from /api/menu" accent />
        <VitalTile label="Avg response" value={v.latency} detail="real-time latency" accent />
        <VitalTile label="Requests" value={v.requests} detail={`${v.active} active`} />
        <VitalTile label="Uptime" value={v.uptime} detail="since boot" />
      </div>
    </section>
  );
}
