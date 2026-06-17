import { afterEach, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import {
  activeTenantId,
  currentTenantId,
  createTenantMiddleware,
  ORG_HEADER,
  TENANT_API_KEY_HEADER,
  TENANT_HEADER,
} from '../../../src/middleware/tenant.ts';

const savedApiKeys = process.env.ORACLE_TENANT_API_KEYS;
const savedTokens = process.env.ORACLE_TENANT_TOKENS;
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const tenantA = `tenant-a-${stamp}`;
const tenantB = `tenant-b-${stamp}`;
const orgTenant = `org-${stamp}`;

const app = new Elysia()
  .use(createTenantMiddleware())
  .get('/whoami', async ({ request, tenantId }) => {
    const delay = Number(new URL(request.url).searchParams.get('delay') ?? '0');
    if (delay > 0) await Bun.sleep(delay);
    return {
      tenantId: tenantId ?? null,
      currentTenantId: currentTenantId() ?? null,
      activeTenantId: activeTenantId(),
    };
  })
  .get('/required', ({ tenantId, set }) => {
    if (!tenantId) {
      set.status = 400;
      return { error: 'tenant required', currentTenantId: currentTenantId() ?? null };
    }
    return { tenantId, currentTenantId: currentTenantId() };
  });

afterEach(() => {
  restoreEnv('ORACLE_TENANT_API_KEYS', savedApiKeys);
  restoreEnv('ORACLE_TENANT_TOKENS', savedTokens);
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function request(path: string, headers: Record<string, string> = {}) {
  return app.handle(new Request(`http://local${path}`, { headers }));
}

async function json(path: string, headers: Record<string, string> = {}) {
  const res = await request(path, headers);
  return { res, body: await res.json() as Record<string, unknown> };
}

test('resolves X-Oracle-Tenant before X-Org-Id and exposes it in AsyncLocalStorage', async () => {
  const primary = await json('/whoami', { [TENANT_HEADER]: tenantA, [ORG_HEADER]: orgTenant });
  expect(primary.res.status).toBe(200);
  expect(primary.res.headers.get(TENANT_HEADER)).toBe(tenantA);
  expect(primary.body).toEqual({ tenantId: tenantA, currentTenantId: tenantA, activeTenantId: tenantA });

  const org = await json('/whoami', { [ORG_HEADER]: orgTenant });
  expect(org.res.status).toBe(200);
  expect(org.res.headers.get(TENANT_HEADER)).toBe(orgTenant);
  expect(org.body).toEqual({ tenantId: orgTenant, currentTenantId: orgTenant, activeTenantId: orgTenant });
});

test('resolves configured X-API-Key tenants and rejects unknown tenant keys', async () => {
  process.env.ORACLE_TENANT_API_KEYS = `${tenantA}=tenant-a-key,${tenantB}=tenant-b-key`;

  const allowed = await json('/whoami', { [TENANT_API_KEY_HEADER]: 'tenant-b-key' });
  expect(allowed.res.status).toBe(200);
  expect(allowed.res.headers.get(TENANT_HEADER)).toBe(tenantB);
  expect(allowed.body).toEqual({ tenantId: tenantB, currentTenantId: tenantB, activeTenantId: tenantB });

  const denied = await json('/whoami', { [TENANT_API_KEY_HEADER]: 'not-a-tenant-key' });
  expect(denied.res.status).toBe(400);
  expect(denied.body).toEqual({ error: 'invalid tenant api key' });
});

test('missing tenant does not inherit a previous AsyncLocalStorage context', async () => {
  expect((await json('/whoami', { [TENANT_HEADER]: tenantA })).body.currentTenantId).toBe(tenantA);

  const optional = await json('/whoami');
  expect(optional.res.status).toBe(200);
  expect(optional.body).toEqual({ tenantId: null, currentTenantId: null, activeTenantId: 'default' });

  const required = await json('/required');
  expect(required.res.status).toBe(400);
  expect(required.body).toEqual({ error: 'tenant required', currentTenantId: null });
});

test('invalid tenant clears context and does not leak into following requests', async () => {
  expect((await json('/whoami', { [TENANT_HEADER]: tenantA })).body.currentTenantId).toBe(tenantA);

  const invalid = await json('/whoami', { [TENANT_HEADER]: 'bad/tenant' });
  expect(invalid.res.status).toBe(400);
  expect(invalid.body).toEqual({ error: 'invalid tenant id' });

  const afterInvalid = await json('/whoami');
  expect(afterInvalid.body).toEqual({ tenantId: null, currentTenantId: null, activeTenantId: 'default' });
});

test('parallel requests keep independent tenant AsyncLocalStorage contexts', async () => {
  const [slowA, fastB] = await Promise.all([
    json('/whoami?delay=15', { [TENANT_HEADER]: tenantA }),
    json('/whoami', { [TENANT_HEADER]: tenantB }),
  ]);

  expect(slowA.body).toEqual({ tenantId: tenantA, currentTenantId: tenantA, activeTenantId: tenantA });
  expect(fastB.body).toEqual({ tenantId: tenantB, currentTenantId: tenantB, activeTenantId: tenantB });
});
