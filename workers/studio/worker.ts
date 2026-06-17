export interface StudioWorkerEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  ORACLE_URL?: string;
  ORACLE_MCP_URL?: string;
}

const WORKER = 'oracle-studio-worker';
const HASHED_ASSET = /\/(?:assets\/|[^/]+-)[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i;
const API_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key, x-correlation-id, x-oracle-tenant, x-tenant-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'x-oracle-studio-worker',
  'Cache-Control': 'no-store',
  'X-Oracle-Studio-Worker': WORKER,
};
const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Oracle-Studio-Worker': WORKER,
};

function normalizedBase(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function proxyTarget(request: Request, base: string): URL {
  const source = new URL(request.url);
  return new URL(source.pathname + source.search, base);
}

async function proxy(request: Request, base: string): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set('x-oracle-studio-worker', WORKER);
  headers.delete('host');
  try {
    const upstream = await fetch(proxyTarget(request, base), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(API_HEADERS)) responseHeaders.set(key, value);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'studio proxy failed' }, { status: 502, headers: API_HEADERS });
  }
}

function configError(kind: 'api' | 'mcp'): Response {
  return Response.json({ error: `${kind} upstream not configured` }, { status: 502, headers: API_HEADERS });
}

async function asset(request: Request, env: StudioWorkerEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;
  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  const cache = HASHED_ASSET.test(url.pathname)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600, stale-while-revalidate=86400';
  headers.set('Cache-Control', cache);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleStudioRequest(request: Request, env: StudioWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if ((url.pathname === '/api' || url.pathname.startsWith('/api/')) && request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_HEADERS });
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const base = normalizedBase(env.ORACLE_URL);
    return base ? proxy(request, base) : configError('api');
  }
  if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
    const base = normalizedBase(env.ORACLE_MCP_URL);
    return base ? proxy(request, base) : configError('mcp');
  }
  return asset(request, env);
}

export default { fetch: handleStudioRequest };
