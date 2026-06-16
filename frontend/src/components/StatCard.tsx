import type { ReactNode } from 'react';

export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300/30 hover:shadow-2xl hover:shadow-teal-950/20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 bg-gradient-to-br from-teal-500 to-violet-500 bg-clip-text text-3xl font-bold text-transparent dark:from-teal-300 dark:to-violet-400">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
    </div>
  );
}
