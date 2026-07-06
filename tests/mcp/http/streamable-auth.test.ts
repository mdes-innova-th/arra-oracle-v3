import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { createApp } from '../../../src/server.ts';
import { createMcpStreamableRoutes } from '../../../src/routes/mcp/index.ts';
import type { UnifiedRuntime } from '../../../src/plugins/unified-loader.ts';

const originalEnv = {
  ORACLE_HTTP_URL: process.env.ORACLE_HTTP_URL,
  ORACLE_MCP_HTTP_TOKEN: process.env.ORACLE_MCP_HTTP_TOKEN,
  ARRA_API_TOKEN: process.env.ARRA_API_TOKEN,
};

beforeEach(() => {
  process.env.ORACLE_HTTP_URL = 'http://127.0.0.1:1';
  delete process.env.ORACLE_MCP_HTTP_TOKEN;
  delete process.env.ARRA_API_TOKEN;
});

afterEach(() => {
  restoreEnv('ORACLE_HTTP_URL', originalEnv.ORACLE_HTTP_URL);
  restoreEnv('ORACLE_MCP_HTTP_TOKEN', originalEnv.ORACLE_MCP_HTTP_TOKEN);
  restoreEnv('ARRA_API_TOKEN', originalEnv.ARRA_API_TOKEN);
});

describe('Streamable HTTP MCP bearer auth', () => {
  test('does not require a token for existing /api/health route', async () => {
    process.env.ORACLE_MCP_HTTP_TOKEN = 'mcp-secret';
    const app = createApp({ unifiedPlugins: runtime() });

    const res = await app.handle(new Request('http://local/api/health'));

    expect(res.status).toBe(200);
  });

  test('rejects unauthenticated /mcp requests', async () => {
    const app = mcpApp({ ORACLE_MCP_HTTP_TOKEN: 'mcp-secret' });
    const res = await postMcp(app, initializeRequest());

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
  });

  test('accepts ORACLE_MCP_HTTP_TOKEN and exposes only remoteable tools', async () => {
    const app = mcpApp({ ORACLE_MCP_HTTP_TOKEN: 'mcp-secret' });
    const sessionId = await initialize(app, 'mcp-secret');
    await notifyInitialized(app, sessionId, 'mcp-secret');

    const res = await postMcp(app, toolsListRequest(), 'mcp-secret', sessionId);
    const body = await res.json() as any;
    const names = body.result.tools.map((tool: { name: string }) => tool.name);

    expect(res.status).toBe(200);
    expect(names).toContain('oracle_search');
    expect(names).not.toContain('____IMPORTANT');
    expect(names).not.toContain('oracle_recap');
    expect(names).not.toContain('oracle_mcp_call');
  });

  test('falls back to ARRA_API_TOKEN and deletes sessions', async () => {
    const app = mcpApp({ ARRA_API_TOKEN: 'fallback-secret' });
    const sessionId = await initialize(app, 'fallback-secret');

    const deleted = await app.handle(new Request('http://local/mcp', {
      method: 'DELETE',
      headers: authedHeaders('fallback-secret', sessionId),
    }));
    const afterDelete = await postMcp(app, toolsListRequest(), 'fallback-secret', sessionId);

    expect(deleted.status).toBe(200);
    expect(afterDelete.status).toBe(404);
  });
});

function mcpApp(env: Record<string, string>) {
  return new Elysia().use(createMcpStreamableRoutes({ env, enableJsonResponse: true }));
}

async function initialize(app: Elysia, token: string): Promise<string> {
  const res = await postMcp(app, initializeRequest(), token);
  expect(res.status).toBe(200);
  const sessionId = res.headers.get('mcp-session-id');
  expect(sessionId).toBeTruthy();
  return sessionId!;
}

async function notifyInitialized(app: Elysia, sessionId: string, token: string) {
  const res = await postMcp(app, { jsonrpc: '2.0', method: 'notifications/initialized' }, token, sessionId);
  expect(res.status).toBe(202);
}

function postMcp(app: Elysia, body: unknown, token?: string, sessionId?: string) {
  return app.handle(new Request('http://local/mcp', {
    method: 'POST',
    headers: token ? authedHeaders(token, sessionId) : { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  }));
}

function authedHeaders(token: string, sessionId?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
    ...(sessionId ? { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-11-25' } : {}),
  };
}

function initializeRequest() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } },
  };
}

function toolsListRequest() {
  return { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
}

function runtime(): UnifiedRuntime {
  return {
    pluginCount: 0,
    routes: [],
    mcpTools: [],
    menu: [],
    cliSubcommands: [],
    servers: [],
    callMcpTool: async () => ({}),
    pluginStatuses: () => [],
    pluginRegistry: () => [],
    init: async () => {},
    reload: async () => {},
    stop: async () => {},
  };
}

function restoreEnv(name: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
