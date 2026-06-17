import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const REPO_URL = 'https://github.com/Soul-Brews-Studio/arra-oracle-v3';
const BUTTON_IMAGE = 'https://deploy.workers.cloudflare.com/button';
const BUTTON_URL = `https://deploy.workers.cloudflare.com/?url=${REPO_URL}`;
const BUTTON_MARKDOWN = `[![Deploy to Cloudflare](${BUTTON_IMAGE})](${BUTTON_URL})`;
const STUDIO_BUTTON_LABEL = 'Deploy Studio Worker to Cloudflare';
const STUDIO_BUTTON_URL = `${BUTTON_URL}/tree/alpha/workers/studio`;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

function parseJsonc<T>(source: string): T {
  return JSON.parse(stripTrailingCommas(stripComments(source))) as T;
}

function stripComments(source: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += char;
  }
  return out;
}

function stripTrailingCommas(source: string): string {
  return source.replace(/,\s*([}\]])/g, '$1');
}

describe('Cloudflare deploy metadata', () => {
  test('root wrangler.jsonc stays parseable and points at the remote MCP worker', () => {
    const cfg = parseJsonc<Record<string, any>>(read('wrangler.jsonc'));

    expect(cfg.name).toBe('arra-oracle-remote-mcp');
    expect(cfg.main).toBe('./src/workers/oracle-mcp.ts');
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cfg.compatibility_flags).toContain('nodejs_compat');
    expect(cfg.workers_dev).toBe(true);
    expect(cfg.observability).toMatchObject({ enabled: true });
    expect(cfg.vars).toMatchObject({
      ORACLE_MCP_PATH: '/mcp',
      ORACLE_STORAGE_BACKEND: 'd1',
      ORACLE_VECTOR_BACKEND: 'cloudflare-vectorize',
    });
  });

  test('package metadata describes each root Wrangler deploy var', () => {
    const cfg = parseJsonc<Record<string, any>>(read('wrangler.jsonc'));
    const pkg = readJson<Record<string, any>>('package.json');
    const bindings = pkg.cloudflare?.bindings ?? {};

    for (const key of Object.keys(cfg.vars ?? {})) {
      expect(typeof bindings[key]?.description).toBe('string');
      expect(bindings[key].description.trim().length).toBeGreaterThan(20);
    }
  });

  test('workers/mcp package has explicit build and deploy scripts', () => {
    const pkg = readJson<Record<string, any>>('workers/mcp/package.json');

    expect(pkg.scripts).toMatchObject({
      build: 'tsc --noEmit',
      dev: 'wrangler dev --config wrangler.jsonc',
      deploy: 'tsc --noEmit && wrangler deploy --config wrangler.jsonc',
      typecheck: 'tsc --noEmit',
    });
  });

  test('workers/mcp Wrangler config keeps the backend proxy var', () => {
    const cfg = parseJsonc<Record<string, any>>(read('workers/mcp/wrangler.jsonc'));

    expect(cfg.main).toBe('src/index.ts');
    expect(cfg.compatibility_flags).toContain('nodejs_compat');
    expect(cfg.durable_objects.bindings).toContainEqual({ name: 'MCP_OBJECT', class_name: 'OracleMCP' });
    expect(cfg.vars).toEqual({ ORACLE_URL: 'https://replace-with-your-oracle-backend.example.com' });
  });

  test('studio wrangler config serves frontend dist through Workers Static Assets', () => {
    const cfg = parseJsonc<Record<string, any>>(read('workers/studio/wrangler.jsonc'));

    expect(cfg.name).toBe('arra-oracle-studio');
    expect(cfg.main).toBe('src/index.ts');
    expect(cfg.workers_dev).toBe(true);
    expect(cfg.assets).toMatchObject({
      directory: '../../frontend/dist',
      binding: 'ASSETS',
      not_found_handling: 'single-page-application',
      run_worker_first: true,
    });
    expect(cfg.vars).toMatchObject({ ORACLE_URL: expect.stringContaining('replace-with-your-oracle-backend') });
  });

  test('README deploy buttons use canonical Cloudflare Workers URLs', () => {
    const readme = read('README.md');
    const buttons = [...readme.matchAll(/\[!\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)/g)]
      .filter(([, , image]) => image === BUTTON_IMAGE);

    expect(buttons.map(([, label, , url]) => [label, url])).toEqual([
      ['Deploy to Cloudflare', BUTTON_URL],
      [STUDIO_BUTTON_LABEL, STUDIO_BUTTON_URL],
    ]);

    for (const [, , , url] of buttons) {
      const target = new URL(url);
      expect(target.origin).toBe('https://deploy.workers.cloudflare.com');
      expect(target.searchParams.get('url')?.startsWith(REPO_URL)).toBe(true);
    }
    expect(readme).toContain(BUTTON_MARKDOWN);
  });
});
