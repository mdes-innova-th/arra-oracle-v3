import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function parseJsonc<T>(source: string): T {
  return JSON.parse(source.replace(/,\s*([}\]])/g, '$1')) as T;
}

describe('Studio Worker deploy config', () => {
  test('serves the Vite frontend with Workers Static Assets before fallback', () => {
    const cfg = parseJsonc<Record<string, any>>(read('workers/studio/wrangler.jsonc'));

    expect(cfg.name).toBe('arra-oracle-studio');
    expect(cfg.main).toBe('worker.ts');
    expect(cfg.workers_dev).toBe(true);
    expect(cfg.assets).toEqual({
      directory: '../../frontend/dist',
      binding: 'ASSETS',
      not_found_handling: 'single-page-application',
      run_worker_first: true,
    });
  });

  test('keeps frontend API proxy URLs configurable', () => {
    const cfg = parseJsonc<Record<string, any>>(read('workers/studio/wrangler.jsonc'));

    expect(cfg.vars.ORACLE_URL).toContain('replace-with-your-oracle-backend');
    expect(cfg.vars.ORACLE_MCP_URL).toBe('https://arra-oracle-mcp.laris.workers.dev/mcp');
  });

  test('package scripts build the frontend before deploy and dry-run', () => {
    const pkg = JSON.parse(read('workers/studio/package.json')) as Record<string, any>;

    expect(pkg.scripts.build).toBe('cd ../../frontend && bun run build');
    expect(pkg.scripts.deploy).toBe('bun run build && wrangler deploy');
    expect(pkg.scripts['deploy:dry-run']).toBe('bun run build && wrangler deploy --dry-run');
    expect(pkg.devDependencies.wrangler).toEqual(expect.any(String));
  });
});
