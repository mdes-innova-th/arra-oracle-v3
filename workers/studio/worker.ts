type AssetFetcher = { fetch(request: Request): Promise<Response> };

export interface StudioEnv {
  ASSETS: AssetFetcher;
  ORACLE_URL?: string;
  ORACLE_HTTP_URL?: string;
  ORACLE_API?: string;
}

const WORKER_HEADER = 'oracle-studio-worker';
const API_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';

export default {
  fetch: handleStudioRequest,
};

export async function handleStudioRequest(request: Request, env: StudioEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/__health') return healthResponse();
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') return apiPreflight();
    return proxyApiRequest(request, env);
  }
  return serveAsset(request, env);
}

async function proxyApiRequest(request: Request, env: StudioEnv): Promise<Response> {
  try {
    const upstream = await fetch(proxyTarget(request, env), {
      method: request.method,
      headers: proxyHeaders(request.headers),
      body: hasBody(request.method) ? request.body : undefined,
      redirect: 'manual',
    });
    return withHeaders(upstream, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'x-oracle-studio-worker',
      'Cache-Control': 'no-store',
      'X-Oracle-Studio-Worker': WORKER_HEADER,
    });
  } catch (error) {
    return json({ error: 'api proxy failed', message: message(error) }, 502);
  }
}

function proxyTarget(request: Request, env: StudioEnv): string {
  const source = new URL(request.url);
  const target = new URL(`${apiBase(env)}${source.pathname}`);
  target.search = source.search;
  return target.toString();
}

function apiBase(env: StudioEnv): string {
  const raw = env.ORACLE_URL ?? env.ORACLE_HTTP_URL ?? env.ORACLE_API;
  const value = raw?.trim();
  if (!value) throw new Error('Set ORACLE_URL to the Oracle backend.');
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('ORACLE_URL must be http(s).');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

function proxyHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  headers.delete('host');
  headers.set('X-Oracle-Studio-Worker', WORKER_HEADER);
  return headers;
}

async function serveAsset(request: Request, env: StudioEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const cache = cacheControl(new URL(request.url).pathname, response.headers.get('content-type'));
  return withHeaders(response, {
    ...(cache ? { 'Cache-Control': cache } : {}),
    'X-Oracle-Studio-Worker': WORKER_HEADER,
  });
}

function cacheControl(pathname: string, contentType: string | null): string | undefined {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (contentType?.includes('text/html') || !pathname.split('/').pop()?.includes('.')) {
    return 'public, max-age=3600, stale-while-revalidate=86400';
  }
  return undefined;
}

function withHeaders(response: Response, values: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(values)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function apiPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'authorization, content-type, x-oracle-tenant, x-tenant-id',
      'Access-Control-Allow-Methods': API_METHODS,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'x-oracle-studio-worker',
      'Allow': API_METHODS,
      'Cache-Control': 'no-store',
      'X-Oracle-Studio-Worker': WORKER_HEADER,
    },
  });
}

function healthResponse(): Response {
  return json({ ok: true, app: 'arra-oracle-studio-worker' }, 200);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Oracle-Studio-Worker': WORKER_HEADER,
    },
  });
}

function hasBody(method: string): boolean {
  return !['GET', 'HEAD'].includes(method.toUpperCase());
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
