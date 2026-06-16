import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { resolveBaseUrl, runArra } from '../../maw-plugin/index.ts';
import type { Runner } from '../../maw-plugin/serve.ts';

function tempEnv(port?: string) {
  const home = mkdtempSync('/tmp/arra-maw-serve-int-');
  return { HOME: home, ORACLE_ROOT: '/repo/arra-oracle-v3', ...(port ? { ORACLE_PORT: port } : {}) };
}

const unusedRunner: Runner = async () => ({ code: 1, stdout: '', stderr: 'ghq should not be called when ORACLE_ROOT is set' });

describe('maw arra serve integration', () => {
  test('start/status/stop lifecycle persists the port and proxies health', async () => {
    const env = tempEnv();
    const pidFile = join(env.HOME, '.arra-oracle-v2', 'server.pid');
    const healthUrls: string[] = [];
    const started: Array<{ cwd: string; port?: string }> = [];
    let alive = false;

    const start = await runArra(['serve', 'start', '--port', '48888'], async () => ({}), () => {}, env, unusedRunner, {
      start: (cwd, startEnv) => {
        alive = true;
        started.push({ cwd, port: startEnv.ORACLE_PORT });
        return 488880;
      },
      isAlive: () => alive,
    });

    expect(start.ok).toBe(true);
    expect(start.output).toContain('started pid=488880 port=48888');
    expect(started).toEqual([{ cwd: '/repo/arra-oracle-v3', port: '48888' }]);
    expect(existsSync(pidFile)).toBe(true);
    expect(resolveBaseUrl(env)).toBe('http://localhost:48888');
    expect(resolveBaseUrl({ ...env, ORACLE_API: 'http://localhost:49999/' })).toBe('http://localhost:49999');

    const status = await runArra(['serve', 'status'], async () => ({}), () => {}, env, unusedRunner, {
      isAlive: () => alive,
      fetch: async (input) => {
        healthUrls.push(String(input));
        return new Response('{"status":"ok","version":"test"}', { status: 200 });
      },
    });

    expect(status.ok).toBe(true);
    expect(status.output).toContain('alive pid=488880');
    expect(status.output).toContain('port: 48888');
    expect(status.output).toContain('health: ok 200');
    expect(healthUrls).toEqual(['http://127.0.0.1:48888/api/health']);

    const stop = await runArra(['serve', 'stop'], async () => ({}), () => {}, env, unusedRunner, {
      isAlive: () => alive,
      kill: () => { alive = false; },
      sleep: async () => {},
    });

    expect(stop.ok).toBe(true);
    expect(stop.output).toContain('stopped pid=488880');
    expect(existsSync(pidFile)).toBe(false);
    expect(resolveBaseUrl(env)).toBe('http://localhost:47778');
  });

  test('status prefers explicit --port but otherwise reuses persisted ORACLE_PORT', async () => {
    const env = tempEnv('48889');
    const seen: string[] = [];
    await runArra(['serve'], async () => ({}), () => {}, env, unusedRunner, {
      start: () => 488890,
      isAlive: () => false,
    });

    const status = await runArra(['serve', '--status', '--port', '48890'], async () => ({}), () => {}, env, unusedRunner, {
      isAlive: () => true,
      fetch: async (input) => {
        seen.push(String(input));
        return new Response('', { status: 204 });
      },
    });

    expect(status.ok).toBe(true);
    expect(status.output).toContain('port: 48890');
    expect(seen).toEqual(['http://127.0.0.1:48890/api/health']);
    expect(resolveBaseUrl(env)).toBe('http://localhost:48889');
  });
});
