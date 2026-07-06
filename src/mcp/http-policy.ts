import type { ToolGroupConfig } from '../config/tool-groups.ts';
import type { UnifiedRuntime } from '../plugins/unified-loader.ts';
import { mcpTools } from '../tools/mcp-manifest.ts';
import { remoteableMcpRestMap } from '../tools/mcp-rest-map.ts';

const REMOTEABLE_TOOL_NAMES = new Set(remoteableMcpRestMap.map((entry) => entry.name));
const DISABLED_HTTP_TOOL_NAMES = mcpTools.map((tool) => tool.name).filter((name) => !REMOTEABLE_TOOL_NAMES.has(name));

export function remoteHttpToolGroups(): ToolGroupConfig {
  return {
    search: true,
    knowledge: true,
    session: true,
    forum: true,
    oracle: true,
    trace: true,
    standalone: true,
    disabled_tools: DISABLED_HTTP_TOOL_NAMES,
  };
}

export function emptyHttpPluginRuntime(): UnifiedRuntime {
  return {
    pluginCount: 0,
    routes: [],
    mcpTools: [],
    menu: [],
    cliSubcommands: [],
    servers: [],
    callMcpTool: async () => { throw new Error('Plugin MCP tools are not exposed over Streamable HTTP'); },
    pluginStatuses: () => [],
    pluginRegistry: () => [],
    init: async () => {},
    reload: async () => {},
    stop: async () => {},
  };
}
