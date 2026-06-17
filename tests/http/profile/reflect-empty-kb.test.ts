import { afterAll, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const savedDataDir = process.env.ORACLE_DATA_DIR;
const savedDbPath = process.env.ORACLE_DB_PATH;
const root = mkdtempSync(join(tmpdir(), 'profile-reflect-empty-'));
process.env.ORACLE_DATA_DIR = root;
process.env.ORACLE_DB_PATH = join(root, 'oracle.db');

const dbMod = await import('../../../src/db/index.ts');
dbMod.resetDefaultDatabaseForTests(process.env.ORACLE_DB_PATH);
const { searchRoutes } = await import('../../../src/routes/search/index.ts');

afterAll(() => {
  if (savedDataDir === undefined) delete process.env.ORACLE_DATA_DIR;
  else process.env.ORACLE_DATA_DIR = savedDataDir;
  if (savedDbPath === undefined) delete process.env.ORACLE_DB_PATH;
  else process.env.ORACLE_DB_PATH = savedDbPath;
  dbMod.resetDefaultDatabaseForTests(':memory:');
  if (existsSync(root)) rmSync(root, { recursive: true });
});

test('/api/reflect falls back to a code-backed profile principle when the KB is empty', async () => {
  const res = await searchRoutes.handle(new Request('http://local/api/reflect'));
  const body = await res.json() as {
    error: string;
    fallback: string;
    fts_status: string;
    content: string;
    source_file: string;
    profile: { slug: string };
    concepts: string[];
  };

  expect(res.status).toBe(200);
  expect(body).toMatchObject({ error: 'No documents found', fallback: 'oracle_profile', fts_status: 'empty' });
  expect(body.content.length).toBeGreaterThan(10);
  expect(body.source_file).toBe('oracle-profile://thor');
  expect(body.profile.slug).toBe('thor');
  expect(body.concepts).toContain('thor-oracle');
});
