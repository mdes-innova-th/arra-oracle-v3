import { afterEach, describe, expect, test } from 'bun:test';
import { handleStudioRequest, type StudioWorkerEnv } from '../../workers/studio/worker.ts';

const originalFetch = globalThis.fetch;
const assetFetch = async (request: Request) => new Response('<!doctype html><div id="root"></div>', {
  headers: { 'content-type': 'text/html' },
});

function env(overrides: Partial<StudioWorkerEnv> = {}): StudioWorkerEnv {
  return {
    ASSETS: { fetch: assetFetch },
    ORACLE_URL: 'https://oracle.example.test/root/',
    ORACLE_MCP_URL: 'https://mcp.example.test',
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Studio Worker', () => {
  test('serves frontend assets through the ASSETS binding with ui-oracle cache headers', async () => {
    const response = await handleStudioRequest(new Request('https://studio.example.test/app'), env());

    expect(response.status).toBe(200);
    expect(response.headers.get('x-oracle-studio-worker')).toBe('oracle-studio-worker');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400');
    expect(await response.text()).toContain('root');
  });

  test('caches Vite hashed assets as immutable', async () => {
    const response = await handleStudioRequest(new Request('https://studio.example.test/assets/app-abc12345.js'), env({
      ASSETS: { fetch: async () => new Response('console.log(1)', { headers: { 'content-type': 'text/javascript' } }) },
    }));

    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  test('proxies /api requests to the configured Oracle backend', async () => {
    const seen: Array<{ url: string; method: string; marker: string | null; body: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const upstream = new Request(input, init);
      seen.push({
        url: String(input),
        method: upstream.method,
        marker: upstream.headers.get('x-oracle-studio-worker'),
        body: await upstream.text(),
      });
      return Response.json({ ok: true });
    }) as typeof fetch;

    const response = await handleStudioRequest(new Request('https://studio.example.test/api/search?q=oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'spoofed.example' },
      body: JSON.stringify({ limit: 3 }),
    }), env());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(seen).toEqual([{ url: 'https://oracle.example.test/api/search?q=oracle', method: 'POST', marker: 'oracle-studio-worker', body: '{"limit":3}' }]);
  });

  test('proxies /mcp requests to the MCP worker URL', async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response('event: message\n\n', { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;

    const response = await handleStudioRequest(new Request('https://studio.example.test/mcp?session=1'), env());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(seen).toEqual(['https://mcp.example.test/mcp?session=1']);
  });

  test('returns a marked 502 when API upstream is not configured', async () => {
    const response = await handleStudioRequest(new Request('https://studio.example.test/api/health'), env({ ORACLE_URL: 'file:///tmp/oracle.sock' }));

    expect(response.status).toBe(502);
    expect(response.headers.get('x-oracle-studio-worker')).toBe('oracle-studio-worker');
    expect(await response.json()).toEqual({ error: 'api upstream not configured' });
  });
});
