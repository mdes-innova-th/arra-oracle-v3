import { afterAll, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const savedDataDir = process.env.ORACLE_DATA_DIR;
const savedDbPath = process.env.ORACLE_DB_PATH;
const root = mkdtempSync(join(tmpdir(), 'arra-export-verify-'));
const dbPath = join(root, 'oracle.db');
const outputDir = join(root, 'bundle');

const dbModule = await import('../../db/index.ts');
const exporterModule = await import('../../../tools/export-app/exporter.ts');
const verifyModule = await import('../../../tools/export-app/verify.ts');

const { createDatabase, oracleDocuments } = dbModule;
const { exportOracleData } = exporterModule;
const { runVerifyApp, verifyExportBundle } = verifyModule;

function seed(connection: ReturnType<typeof createDatabase>): void {
  const now = 1_766_000_000_000;
  connection.db.insert(oracleDocuments).values({
    id: 'verify-doc',
    type: 'learning',
    sourceFile: 'psi/export/verify.md',
    concepts: '["verify","backup"]',
    createdAt: now,
    updatedAt: now,
    indexedAt: now,
    createdBy: 'test',
  }).run();
  connection.sqlite.prepare('INSERT INTO oracle_fts (id, content, concepts) VALUES (?, ?, ?)').run(
    'verify-doc',
    'Verifier export body.',
    'verify backup',
  );
}

afterAll(() => {
  if (savedDataDir === undefined) delete process.env.ORACLE_DATA_DIR;
  else process.env.ORACLE_DATA_DIR = savedDataDir;
  if (savedDbPath === undefined) delete process.env.ORACLE_DB_PATH;
  else process.env.ORACLE_DB_PATH = savedDbPath;
  rmSync(root, { recursive: true, force: true });
});

test('export app verifier checks manifest, relationships, and document artifacts', async () => {
  const connection = createDatabase(dbPath);
  try {
    seed(connection);
    await exportOracleData({ connection, outputDir, progress: () => {} });
  } finally {
    connection.storage.close();
  }

  const result = await verifyExportBundle(outputDir);
  expect(result.collectionCount).toBeGreaterThan(5);
  expect(result.documentCount).toBe(1);
  expect(result.relationshipFileCount).toBe(3);
  expect(result.checkedFiles).toBeGreaterThan(result.collectionCount);
  expect(existsSync(join(outputDir, 'documents', 'markdown', 'psi_export_verify.md'))).toBe(true);

  const stdout: string[] = [];
  const stderr: string[] = [];
  expect(await runVerifyApp(['--output', outputDir], (msg) => stdout.push(msg), (msg) => stderr.push(msg))).toBe(0);
  expect(JSON.parse(stdout.join(''))).toMatchObject({ success: true, documentCount: 1 });
  expect(stderr).toEqual([]);

  unlinkSync(join(outputDir, 'relationships.json'));
  await expect(verifyExportBundle(outputDir)).rejects.toThrow('relationships.json');
});
