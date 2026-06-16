import { expect, test } from 'bun:test';
import { createMcpRoutes } from '../../../src/routes/mcp/index.ts';
import { createTenantFetch, TENANT_HEADER } from '../../../src/middleware/tenant.ts';

test('GET /api/mcp/tools returns core and plugin tool metadata', async () => {
  const app = createMcpRoutes([{
    name: 'oracle_canvas_inspect',
    description: 'Inspect the canvas plugin.',
    inputSchema: { type: 'object' },
    handler: 'inspectCanvas',
    plugin: 'canvas-inspector',
    readOnly: true,
  }]);

  const res = await app.handle(new Request('http://local/api/mcp/tools'));
  expect(res.status).toBe(200);
  const body = await res.json() as { tools: Array<Record<string, unknown>>; total: number };
  expect(body.total).toBe(body.tools.length);
  expect(body.tools).toContainEqual(expect.objectContaining({ name: 'oracle_search', source: 'core', group: 'search' }));
  expect(body.tools).toContainEqual(expect.objectContaining({
    name: 'oracle_canvas_inspect',
    source: 'plugin',
    plugin: 'canvas-inspector',
    readOnly: true,
  }));
  expect(body.tools.some((tool) => 'handler' in tool)).toBe(false);
  expect(body).not.toHaveProperty('tenant');
});

test('GET /api/mcp/tools reports the active tenant scope when tenant context is set', async () => {
  const tenantId = `mcp-tenant-${Date.now()}`;
  const app = createMcpRoutes();
  const fetcher = createTenantFetch((request) => app.handle(request));

  const res = await fetcher(new Request('http://local/api/mcp/tools', {
    headers: { [TENANT_HEADER]: tenantId },
  }));
  expect(res.status).toBe(200);
  expect(res.headers.get(TENANT_HEADER)).toBe(tenantId);
  expect(res.headers.get('vary')).toContain(TENANT_HEADER);

  const body = await res.json() as { tenant?: { id: string; scope: string }; tools: unknown[]; total: number };
  expect(body.tenant).toEqual({ id: tenantId, scope: 'tenant_id' });
  expect(body.total).toBe(body.tools.length);
});
