import { Elysia } from 'elysia';

export interface PeerConfig {
  name: string;
  url: string;
}

function parsePeersEnv(raw: string | undefined): PeerConfig[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const atIdx = entry.lastIndexOf('@');
      if (atIdx > 0) {
        return { name: entry.slice(0, atIdx), url: entry.slice(atIdx + 1) };
      }
      try {
        const url = new URL(entry);
        return { name: url.hostname, url: entry };
      } catch {
        return null;
      }
    })
    .filter((p): p is PeerConfig => p !== null);
}

let cachedPeers: PeerConfig[] | null = null;

export function getConfiguredPeers(): PeerConfig[] {
  if (cachedPeers) return cachedPeers;
  cachedPeers = parsePeersEnv(process.env.ORACLE_PEERS ?? process.env.ARRA_PEERS);
  return cachedPeers;
}

export function resetPeersCache(): void {
  cachedPeers = null;
}

export const peersRoute = new Elysia().get('/api/peers', () => {
  return { peers: getConfiguredPeers() };
}, {
  detail: {
    tags: ['peer'],
    summary: 'List configured federation peers',
    description: 'Returns the peer list from ORACLE_PEERS env. Format: name@http://host:port,name2@http://host2:port',
  },
});
