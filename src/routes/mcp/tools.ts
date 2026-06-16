import { Elysia } from 'elysia';
import type { UnifiedRuntime } from '../../plugins/unified-loader.ts';
import { mcpTools, toMcpToolDefinition, type RuntimeMcpToolManifest } from '../../tools/mcp-manifest.ts';
import {
  currentTenantId,
  LEGACY_TENANT_HEADER,
  ORG_HEADER,
  TENANT_API_KEY_HEADER,
  TENANT_HEADER,
  TENANT_TOKEN_HEADER,
} from '../../middleware/tenant.ts';

type PluginTool = UnifiedRuntime['mcpTools'][number];

type PublicTool = ReturnType<typeof toMcpToolDefinition> & {
  group?: string;
  readOnly?: boolean;
  enabledByDefault?: boolean;
  source: 'core' | 'plugin';
  plugin?: string;
};

const TENANT_VARY_HEADERS = [
  TENANT_HEADER,
  LEGACY_TENANT_HEADER,
  ORG_HEADER,
  TENANT_TOKEN_HEADER,
  TENANT_API_KEY_HEADER,
  'Authorization',
].join(', ');

function coreTool(tool: RuntimeMcpToolManifest): PublicTool {
  return {
    ...toMcpToolDefinition(tool),
    group: tool.group,
    readOnly: tool.readOnly,
    enabledByDefault: tool.enabledByDefault,
    source: 'core',
  };
}

function pluginTool(tool: PluginTool): PublicTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    group: tool.group ?? `plugin:${tool.plugin}`,
    readOnly: tool.readOnly,
    enabledByDefault: tool.enabledByDefault,
    source: 'plugin',
    plugin: tool.plugin,
  };
}

export function createMcpRoutes(pluginTools: PluginTool[] = []) {
  return new Elysia({ prefix: '/api' }).get('/mcp/tools', ({ set }) => {
    const tools = [...mcpTools.map(coreTool), ...pluginTools.map(pluginTool)];
    const tenantId = currentTenantId();
    if (!tenantId) return { tools, total: tools.length };
    set.headers[TENANT_HEADER] = tenantId;
    set.headers.Vary = TENANT_VARY_HEADERS;
    return { tools, total: tools.length, tenant: { id: tenantId, scope: 'tenant_id' } };
  }, {
    detail: {
      tags: ['mcp'],
      menu: { group: 'hidden' },
      summary: 'List MCP tool definitions for frontend browsers',
    },
  });
}
