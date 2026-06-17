export const TAURI_API_BASE = 'http://localhost:47778';
export const DEFAULT_API_HOST = 'localhost:47778';
export const API_HOST_STORAGE_KEY = 'oracle.host';

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

type LocalNetworkAddressSpace = 'local' | 'loopback';
type PrivateNetworkRequestInit = RequestInit & { targetAddressSpace?: LocalNetworkAddressSpace };

function browserWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function storage(): Storage | null {
  try {
    return browserWindow()?.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeApiHost(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return DEFAULT_API_HOST;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    return new URL(withProtocol).host || DEFAULT_API_HOST;
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^\/+/, '').split('/')[0] || DEFAULT_API_HOST;
  }
}

function cleanHostParam(url: URL): void {
  if (!url.searchParams.has('host')) return;
  url.searchParams.delete('host');
  const clean = `${url.pathname}${url.search}${url.hash}`;
  browserWindow()?.history.replaceState({}, '', clean || '/');
}

function resolveBrowserApiHost(): string {
  const win = browserWindow();
  if (!win) return DEFAULT_API_HOST;
  const url = new URL(win.location.href);
  const queryHost = url.searchParams.get('host');
  const host = normalizeApiHost(queryHost || storage()?.getItem(API_HOST_STORAGE_KEY));
  if (queryHost) {
    storage()?.setItem(API_HOST_STORAGE_KEY, host);
    cleanHostParam(url);
  }
  return host;
}

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

function isLoopbackAddress(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  return host === 'localhost' || host === '::1' || host.endsWith('.localhost') || /^127(?:\.|$)/.test(host);
}

function isPrivateNetworkAddress(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  const firstTwo = host.split('.').slice(0, 2).map((part) => Number(part));
  const [first, second] = firstTwo;
  return host.endsWith('.local')
    || first === 10
    || first === 192 && second === 168
    || first === 172 && second >= 16 && second <= 31
    || first === 169 && second === 254
    || /^f[cd][0-9a-f]{2}:/i.test(host)
    || host.startsWith('fe80:');
}

function targetAddressSpace(hostname: string): LocalNetworkAddressSpace | null {
  if (isLoopbackAddress(hostname)) return 'loopback';
  if (isPrivateNetworkAddress(hostname)) return 'local';
  return null;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export const API_HOST = isTauri() ? 'localhost:47778' : resolveBrowserApiHost();
export const API_BASE = isTauri() ? TAURI_API_BASE : `http://${API_HOST}`;
export const TARGET_ADDRESS_SPACE = (() => {
  try {
    return isTauri() ? null : targetAddressSpace(new URL(API_BASE).hostname);
  } catch {
    return null;
  }
})();
export const USE_LOCAL_PNA = TARGET_ADDRESS_SPACE !== null;

export type VectorProvider = {
  type: string;
  available: boolean;
  configured?: boolean;
  status?: string;
  models?: string[];
  capabilities?: string[];
  error?: string;
};

export type VectorProviderTestConfig = {
  provider: string;
  model?: string;
  url?: string;
  dimensions?: number;
  text?: string;
};

export type VectorProviderTestResult = {
  success: boolean;
  provider: string;
  dimensions?: number;
  model?: string;
  error?: string;
};

export type VectorService = {
  name: string;
  type: 'builtin' | 'proxy';
  endpoint?: string;
  capabilities?: Record<string, unknown>;
  health?: VectorHealthStatus;
};

export type VectorHealthStatus = {
  status: string;
  checkedAt?: string;
  success?: boolean;
  error?: string;
};

export function hasStoredApiHost(): boolean {
  return Boolean(storage()?.getItem(API_HOST_STORAGE_KEY));
}

export function persistApiHost(host: string): string {
  const normalized = normalizeApiHost(host);
  storage()?.setItem(API_HOST_STORAGE_KEY, normalized);
  return normalized;
}

export function connectToApiHost(host: string): void {
  const normalized = persistApiHost(host);
  const url = new URL(browserWindow()?.location.href ?? 'http://localhost/');
  url.searchParams.delete('host');
  url.searchParams.set('host', normalized);
  browserWindow()?.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

export function apiUrl(path: string): string {
  return API_BASE ? new URL(path, API_BASE).toString() : path;
}

export function withLocalPna(init: RequestInit = {}): RequestInit {
  if (!USE_LOCAL_PNA) return init;
  return { ...init, targetAddressSpace: TARGET_ADDRESS_SPACE } as PrivateNetworkRequestInit;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), withLocalPna(init));
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: { accept: 'application/json', 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const error = typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : response.statusText;
    throw new Error(`${path} returned ${response.status}: ${error}`);
  }
  return payload as T;
}

export async function getVectorProviders(): Promise<VectorProvider[]> {
  const body = await fetchJson<{ providers?: VectorProvider[] }>('/api/v1/vector/providers');
  return body.providers ?? [];
}

export function testVectorProvider(config: VectorProviderTestConfig): Promise<VectorProviderTestResult> {
  return fetchJson('/api/v1/vector/providers/test', { method: 'POST', body: JSON.stringify(config) });
}

export async function getVectorServices(): Promise<VectorService[]> {
  const body = await fetchJson<{ services?: VectorService[] }>('/api/v1/vector/services');
  return body.services ?? [];
}

export async function registerVectorService(service: VectorService): Promise<void> {
  await fetchJson('/api/v1/vector/services/register', { method: 'POST', body: JSON.stringify(service) });
}

export async function unregisterVectorService(name: string): Promise<void> {
  await fetchJson(`/api/v1/vector/services/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export function testVectorService(name: string): Promise<VectorHealthStatus> {
  return fetchJson(`/api/v1/vector/services/${encodeURIComponent(name)}/test`, { method: 'POST' });
}
