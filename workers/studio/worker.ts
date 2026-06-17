export interface StudioAssets {
  fetch(request: Request): Promise<Response>;
}

export interface StudioWorkerEnv {
  ASSETS: StudioAssets;
  ORACLE_URL?: string;
  ORACLE_HTTP_URL?: string;
  ORACLE_API?: string;
  ORACLE_MCP_URL?: string;
  ARRA_API_TOKEN?: string;
  ARRA_API_KEY?: string;
}

const DEFAULT_MCP_URL = 'https://arra-oracle-mcp.laris.workers.dev/mcp';
const HASHED_ASSET = /\/(?:assets\/|[^/]+-)[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i;
const MARKER = { 'X-Oracle-Studio-Worker': 'arra-oracle-studio' };
const API_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key, x-correlation-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'x-oracle-studio-worker',
  'Cache-Control': 'no-store',
  ...MARKER,
};

function trim(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function cleanBase(raw: unknown): string | undefined {
  const value = trim(raw);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    url.username = '';
    url.password = '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function apiBase(env: StudioWorkerEnv): string | undefined {
  return cleanBase(env.ORACLE_URL ?? env.ORACLE_HTTP_URL ?? env.ORACLE_API);
}

function mcpBase(env: StudioWorkerEnv): string {
  return cleanBase(env.ORACLE_MCP_URL) ?? DEFAULT_MCP_URL;
}

function appendPath(base: string, requestUrl: URL, prefix = ''): string {
  const path = prefix ? requestUrl.pathname.slice(prefix.length) || '' : requestUrl.pathname;
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `${base}${suffix}${requestUrl.search}`;
}

function proxyHeaders(request: Request, env: StudioWorkerEnv): Headers {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-oracle-studio-worker', 'arra-oracle-studio');
  const token = trim(env.ARRA_API_TOKEN) ?? trim(env.ARRA_API_KEY);
  if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

async function proxy(request: Request, env: StudioWorkerEnv, target: string): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: proxyHeaders(request, env),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
  } catch {
    return Response.json({ error: 'upstream proxy failed' }, { status: 502, headers: API_HEADERS });
  }
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(API_HEADERS)) headers.set(key, value);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

function health(env: StudioWorkerEnv): Response {
  return Response.json({
    ok: true,
    app: 'arra-oracle-studio',
    apiBase: apiBase(env) ?? null,
    mcpUrl: mcpBase(env),
  }, { headers: API_HEADERS });
}

async function assets(request: Request, env: StudioWorkerEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  headers.set('x-oracle-studio-worker', 'arra-oracle-studio');
  headers.set(
    'cache-control',
    HASHED_ASSET.test(url.pathname)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600, stale-while-revalidate=86400',
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleStudioRequest(request: Request, env: StudioWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/__health' || url.pathname === '/health') return health(env);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: API_HEADERS });
    const base = apiBase(env);
    if (!base) return Response.json({ error: 'Set ORACLE_URL to the Arra Oracle backend.' }, { status: 503, headers: API_HEADERS });
    return proxy(request, env, appendPath(base, url));
  }
  if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: API_HEADERS });
    return proxy(request, env, appendPath(mcpBase(env), url, '/mcp'));
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', ...MARKER } });
  }
  return assets(request, env);
}

export default { fetch: handleStudioRequest };
