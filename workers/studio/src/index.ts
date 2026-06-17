type AssetBinding = { fetch: (request: Request) => Promise<Response> };

export type StudioEnv = {
  ASSETS: AssetBinding;
  ORACLE_URL?: string;
  ORACLE_HTTP_URL?: string;
  ORACLE_API?: string;
  ORACLE_MCP_URL?: string;
  ARRA_API_TOKEN?: string;
  ARRA_API_KEY?: string;
};

const HASHED_ASSET = /\/(?:assets\/|[^/]+-)[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i;
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function trim(value: string | undefined): string {
  return value?.trim() ?? '';
}

export function resolveOracleUrl(env: Pick<StudioEnv, 'ORACLE_URL' | 'ORACLE_HTTP_URL' | 'ORACLE_API'>): string | null {
  const raw = trim(env.ORACLE_URL) || trim(env.ORACLE_HTTP_URL) || trim(env.ORACLE_API);
  if (!raw) return null;
  const url = new URL(raw);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

export function buildProxyUrl(baseUrl: string, requestUrl: string): string {
  const incoming = new URL(requestUrl);
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  base.pathname = `${basePath}${incoming.pathname}`;
  base.search = incoming.search;
  return base.toString();
}

function apiHeaders(request: Request, env: StudioEnv): Headers {
  const headers = new Headers(request.headers);
  for (const key of HOP_BY_HOP) headers.delete(key);
  headers.set('accept', headers.get('accept') || 'application/json');
  headers.set('x-oracle-studio-worker', 'cloudflare-workers');
  const token = trim(env.ARRA_API_TOKEN) || trim(env.ARRA_API_KEY);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-oracle-studio-worker', 'cloudflare-workers');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonError(message: string, status = 502): Response {
  return Response.json({ error: 'Oracle backend unavailable', message }, {
    status,
    headers: { 'cache-control': 'no-store', 'x-oracle-studio-worker': 'cloudflare-workers' },
  });
}

export async function proxyApiRequest(request: Request, env: StudioEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const baseUrl = resolveOracleUrl(env);
  if (!baseUrl) return jsonError('Set ORACLE_URL to the Arra Oracle HTTP backend before deploying Studio.');
  const upstream = new Request(buildProxyUrl(baseUrl, request.url), {
    method: request.method,
    headers: apiHeaders(request, env),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });
  return noStore(await fetcher(upstream));
}

async function serveAssets(request: Request, env: StudioEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;
  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  headers.set('x-oracle-studio-worker', 'cloudflare-workers');
  headers.set('cache-control', HASHED_ASSET.test(url.pathname)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600, stale-while-revalidate=86400');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleStudioRequest(request: Request, env: StudioEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/__health') {
    return Response.json({ ok: true, app: 'arra-oracle-studio', assets: true }, {
      headers: { 'cache-control': 'no-store', 'x-oracle-studio-worker': 'cloudflare-workers' },
    });
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxyApiRequest(request, env, fetcher);
  return serveAssets(request, env);
}

export default {
  fetch: handleStudioRequest,
};
