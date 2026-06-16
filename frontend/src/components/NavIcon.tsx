export type IconKey =
  | 'menu' | 'plugins' | 'search' | 'vector' | 'documents'
  | 'vsearch' | 'export' | 'learn' | 'metrics' | 'mcp' | 'settings';

const PATHS: Record<IconKey, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  plugins: 'M10 3v4M14 3v4M5 7h14v5a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V7Z M12 17v4',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16ZM21 21l-4.3-4.3',
  vector: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  documents: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6',
  vsearch: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5M11 8v6M8 11h6',
  export: 'M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  learn: 'M4 5a2 2 0 0 1 2-2h10l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9 8h6M9 12h6M9 16h4',
  metrics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  mcp: 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.07-.33.1-.66.1-1Z',
};

export function NavIcon({ icon, className }: { icon: IconKey; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className={className ?? 'h-5 w-5'} aria-hidden="true">
      <path d={PATHS[icon]} />
    </svg>
  );
}
