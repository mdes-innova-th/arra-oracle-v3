import { describe, expect, test } from 'bun:test';
import { buildProxyUrl, handleStudioRequest, proxyApiRequest, resolveOracleUrl, type StudioEnv } from '../../workers/studio/src/index.ts';

function assets(body = '<html>studio</html>') {
  return { fetch: async () => new Response(body, { headers: { 'content-type': 'text/html' } }) };
}

function env(overrides: Partial<StudioEnv> = {}): StudioEnv {
  return { ASSETS: assets(), ORACLE_URL: 'https://oracle.example.test/root/', ...overrides };
}

describe('Studio Cloudflare Worker', () => {
  test('resolves backend URLs and preserves API path/query under base paths', () => {
    expect(resolveOracleUrl({ ORACLE_URL: ' https://oracle.example.test/root/?x=1#hash ' })).toBe('https://oracle.example.test/root');
    expect(resolveOracleUrl({ ORACLE_HTTP_URL: 'https://legacy.example.test/' })).toBe('https://legacy.example.test');
    expect(resolveOracleUrl({})).toBeNull();
    expect(buildProxyUrl('https://oracle.example.test/root', 'https://studio.example/api/search?q=oracle')).toBe('https://oracle.example.test/root/api/search?q=oracle');
  });

  test('proxies API method, body, token, and no-store cache headers', async () => {
    const seen: Array<{ url: string; method: string; auth: string | null; worker: string | null; body: string }> = [];
    const response = await proxyApiRequest(new Request('https://studio.example/api/learn?draft=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pattern: 'deploy studio' }),
    }), env({ ARRA_API_TOKEN: 'secret-token' }), async (request) => {
      seen.push({
        url: request.url,
        method: request.method,
        auth: request.headers.get('authorization'),
        worker: request.headers.get('x-oracle-studio-worker'),
        body: await request.text(),
      });
      return Response.json({ ok: true });
    });

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-oracle-studio-worker')).toBe('cloudflare-workers');
    expect(await response.json()).toEqual({ ok: true });
    expect(seen).toEqual([{
      url: 'https://oracle.example.test/root/api/learn?draft=1',
      method: 'POST',
      auth: 'Bearer secret-token',
      worker: 'cloudflare-workers',
      body: '{"pattern":"deploy studio"}',
    }]);
  });

  test('returns a structured API error when ORACLE_URL is missing', async () => {
    const response = await proxyApiRequest(new Request('https://studio.example/api/health'), env({ ORACLE_URL: undefined }));
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: 'Oracle backend unavailable' });
  });

  test('serves health and cached static assets through ASSETS', async () => {
    const health = await handleStudioRequest(new Request('https://studio.example/__health'), env());
    const html = await handleStudioRequest(new Request('https://studio.example/vector/results'), env());
    const hashed = await handleStudioRequest(new Request('https://studio.example/assets/app-abc123def456.js'), {
      ...env(),
      ASSETS: assets('console.log("studio")'),
    });

    expect(await health.json()).toMatchObject({ ok: true, app: 'arra-oracle-studio' });
    expect(html.headers.get('cache-control')).toContain('stale-while-revalidate');
    expect(await html.text()).toContain('studio');
    expect(hashed.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });
});
