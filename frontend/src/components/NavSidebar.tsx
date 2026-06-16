import { NavLink } from 'react-router-dom';
import { NavIcon, type IconKey } from './NavIcon';

export type NavItem = {
  to: string;
  label: string;
  description: string;
  icon: IconKey;
  badge?: string | number;
  end?: boolean;
};

function railClass({ isActive }: { isActive: boolean }) {
  const base =
    'group/navitem focus-ring relative flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200';
  if (isActive)
    return `${base} border-teal-400/40 bg-gradient-to-br from-teal-400/20 to-violet-500/15 text-teal-100 shadow-lg shadow-teal-950/40`;
  return `${base} border-transparent text-slate-500 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/[0.04] hover:text-teal-200`;
}

export function NavSidebar({ items }: { items: NavItem[] }) {
  return (
    <aside aria-label="Application navigation" className="sticky top-3 z-20 lg:top-6 lg:h-[calc(100vh-3rem)]">
      <div className="flex h-full flex-row items-center gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 p-2 shadow-2xl shadow-black/30 backdrop-blur lg:flex-col lg:overflow-visible">
        <NavLink to="/" end aria-label="Arra Oracle home" className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-400/25 to-violet-500/20 text-lg shadow-inner shadow-teal-500/10">
          <span aria-hidden="true">🔮</span>
        </NavLink>
        <div className="my-1 hidden h-px w-6 bg-white/10 lg:block" />
        <nav aria-label="Frontend sections" className="flex flex-row items-center gap-2 lg:flex-col">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} aria-label={`${item.label}: ${item.description}`} className={railClass} title={item.label}>
              <NavIcon icon={item.icon} />
              {item.badge !== undefined && item.badge !== 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-teal-400 px-1 text-[10px] font-bold text-slate-950">{item.badge}</span>
              ) : null}
              <span className="pointer-events-none absolute left-full z-30 ml-3 hidden whitespace-nowrap rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-100 opacity-0 shadow-xl transition-opacity duration-150 group-hover/navitem:opacity-100 lg:block">
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
