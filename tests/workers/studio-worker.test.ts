import { afterEach, describe, expect, test } from 'bun:test';
import { handleStudioRequest, type StudioWorkerEnv } from '../../workers/studio/worker.ts';

const originalFetch = globalThis.fetch;

function env(overrides: Partial<StudioWorkerEnv> = {}): StudioWorkerEnv {
  return {
    ASSETS: {
      fetch: async (request) => new Response(new URL(request.url).pathname, {
        headers: { 'content-type': 'text/html' },
      }),
    },
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Studio Cloudflare Worker', () => {
  test('serves Vite assets through the ASSETS binding with ui-oracle cache headers', async () => {
    const response = await handleStudioRequest(
      new Request('https://studio.example.test/assets/app-abcdef123.js'),
      env({
        ASSETS: {
          fetch: async () => new Response('console.log("ok")', { headers: { 'content-type': 'text/javascript' } }),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-oracle-studio-worker')).toBe('arra-oracle-studio');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toContain('console.log');
  });

  test('proxies /api requests to ORACLE_URL while preserving method, body, and auth', async () => {
    const seen: Array<{ url: string; method: string; auth: string | null; body: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const upstream = new Request(input, init);
      seen.push({
        url: String(input),
        method: upstream.method,
        auth: upstream.headers.get('authorization'),
        body: await upstream.text(),
      });
      return Response.json({ ok: true }, { status: 201 });
    }) as typeof fetch;

    const response = await handleStudioRequest(
      new Request('https://studio.example.test/api/learn?source=studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pattern: 'Workers frontend deploy' }),
      }),
      env({ ORACLE_URL: 'https://oracle.example.test/root/', ARRA_API_TOKEN: 'secret' }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(seen).toEqual([{
      url: 'https://oracle.example.test/root/api/learn?source=studio',
      method: 'POST',
      auth: 'Bearer secret',
      body: '{"pattern":"Workers frontend deploy"}',
    }]);
  });

  test('proxies /mcp to the configured remote MCP endpoint', async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response('event: message\ndata: {}\n', { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;

    const response = await handleStudioRequest(
      new Request('https://studio.example.test/mcp?session=1', { headers: { accept: 'text/event-stream' } }),
      env({ ORACLE_MCP_URL: 'https://arra-oracle-mcp.laris.workers.dev/mcp' }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-oracle-studio-worker')).toBe('arra-oracle-studio');
    expect(seen).toEqual(['https://arra-oracle-mcp.laris.workers.dev/mcp?session=1']);
  });

  test('returns health and config errors without calling upstream services', async () => {
    globalThis.fetch = (async () => { throw new Error('should not proxy'); }) as typeof fetch;

    const health = await handleStudioRequest(new Request('https://studio.example.test/__health'), env());
    const missing = await handleStudioRequest(new Request('https://studio.example.test/api/search'), env());

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, app: 'arra-oracle-studio' });
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({ error: 'Set ORACLE_URL to the Arra Oracle backend.' });
  });
});
