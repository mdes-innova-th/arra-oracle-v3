import { afterEach, expect, test } from 'bun:test';

const previousWindow = globalThis.window;
const previousFetch = globalThis.fetch;

afterEach(() => {
  if (previousWindow === undefined) delete (globalThis as { window?: Window }).window;
  else globalThis.window = previousWindow;
  globalThis.fetch = previousFetch;
});

function installBrowser(url: string, storedHost?: string) {
  const storage = new Map<string, string>();
  const assigned: string[] = [];
  const replaced: string[] = [];
  if (storedHost) storage.set('oracle.host', storedHost);
  globalThis.window = {
    location: { href: url, assign: (next: string) => assigned.push(next) },
    history: { replaceState: (_state: unknown, _title: string, next: string) => replaced.push(next) },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  } as unknown as Window & typeof globalThis;
  return { assigned, replaced, storage };
}

async function importOracleApi() {
  return import(`../../frontend/src/api/oracle.ts?smoke=${Date.now()}-${Math.random()}`);
}

test('host query persists local Oracle host and uses Private Network Access fetches', async () => {
  const browser = installBrowser('https://studio.example/?host=127.0.0.1:47778&view=menu#/status');
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit & { targetAddressSpace?: string } }> = [];
  globalThis.fetch = ((input, init) => {
    calls.push({ input, init });
    return Promise.resolve(Response.json({ status: 'ok' }));
  }) as typeof fetch;

  const oracle = await importOracleApi();
  await oracle.apiFetch('/api/health', { headers: { accept: 'application/json' } });

  expect(oracle.API_BASE).toBe('http://127.0.0.1:47778');
  expect(oracle.TARGET_ADDRESS_SPACE).toBe('loopback');
  expect(browser.storage.get('oracle.host')).toBe('127.0.0.1:47778');
  expect(browser.replaced).toEqual(['/?view=menu#/status']);
  expect(String(calls[0]?.input)).toBe('http://127.0.0.1:47778/api/health');
  expect(calls[0]?.init?.targetAddressSpace).toBe('loopback');
});

test('connectToApiHost normalizes host input and reloads through the host query', async () => {
  const browser = installBrowser('https://studio.example/vector?plugin=wave#docs', 'localhost:47778');
  const oracle = await importOracleApi();

  oracle.connectToApiHost('oracle.local:47778/path');

  expect(browser.storage.get('oracle.host')).toBe('oracle.local:47778');
  expect(browser.assigned).toEqual(['/vector?plugin=wave&host=oracle.local%3A47778#docs']);
});
