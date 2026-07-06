// mcp-bridge.cjs — Node.js bridge to spawn Bun MCP server (avoids Bun stdin pipe bug on Windows)
// Uses child_process.spawn with 'ignore' stdio[0] so MCP can use stdin/stdout
const { spawn } = require('child_process');
const path = require('path');

const oracleRoot = process.env.JIT_ROOT
  ? path.join(process.env.JIT_ROOT, 'workspaces', 'arra-oracle-v3')
  : path.resolve(__dirname, '..');

const bun = process.env.BUN_PATH || 'bun';
const entry = path.join(oracleRoot, 'src', 'index.ts');

const child = spawn(bun, ['run', entry], {
  cwd: oracleRoot,
  env: { ...process.env, ORACLE_PORT: process.env.ORACLE_PORT || '47778' },
  stdio: ['pipe', 'pipe', 'inherit'], // stdin pipe is OK for Node spawn (not Bun)
  windowsHide: true,
});

// Bridge stdin/stdout between MCP client (Claude Code) and Bun process
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

child.on('exit', (code) => {
  process.exit(code || 0);
});
