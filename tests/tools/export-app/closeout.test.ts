import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const savedDataDir = process.env.ORACLE_DATA_DIR;
const savedDbPath = process.env.ORACLE_DB_PATH;
const root = mkdtempSync(join(tmpdir(), 'arra-export-closeout-'));
const dbPath = join(root, 'oracle.db');

process.env.ORACLE_DATA_DIR = root;
process.env.ORACLE_DB_PATH = dbPath;

const dbModule = await import('../../../src/db/index.ts');
const { runExportApp } = await import('../../../tools/export-app/index.ts');
const { writeSqliteBackup } = await import('../../../src/cli/commands/backup.ts');
const { createDatabase, oracleDocuments, resetDefaultDatabaseForTests } = dbModule;

function seed(connection: ReturnType<typeof createDatabase>) {
  const now = 1_766_000_000_000;
  connection.db.insert(oracleDocuments).values({
    id: 'closeout-doc',
    type: 'learning',
    sourceFile: 'ψ/closeout/export.md',
    concepts: JSON.stringify(['export', 'backup']),
    createdAt: now,
    updatedAt: now + 1,
    indexedAt: now + 2,
    createdBy: 'test',
  }).run();
  connection.sqlite.prepare('INSERT INTO oracle_fts (id, content, concepts) VALUES (?, ?, ?)').run(
    'closeout-doc',
    'Closeout export body for Markdown and JSON backups.',
    'export backup',
  );
}

afterAll(() => {
  if (savedDataDir === undefined) delete process.env.ORACLE_DATA_DIR;
  else process.env.ORACLE_DATA_DIR = savedDataDir;
  if (savedDbPath === undefined) delete process.env.ORACLE_DB_PATH;
  else process.env.ORACLE_DB_PATH = savedDbPath;
  resetDefaultDatabaseForTests(':memory:');
  rmSync(root, { recursive: true });
});

describe('#1783 export app closeout', () => {
  test('shows dry-run counts, writes Markdown/JSON dumps, and creates SQL backup', async () => {
    const setup = createDatabase(dbPath);
    seed(setup);
    setup.storage.close();

    const previewOut: string[] = [];
    const previewDir = join(root, 'preview-only');
    const previewCode = await runExportApp(
      ['--output', previewDir, '--db', dbPath, '--dry-run'],
      (message) => previewOut.push(message),
      () => {},
    );
    const preview = JSON.parse(previewOut.join('')) as Record<string, number | boolean>;

    expect(previewCode).toBe(0);
    expect(preview).toMatchObject({ success: true, dryRun: true, documentCount: 1 });
    expect(preview.rowCount).toBeGreaterThan(0);
    expect(existsSync(previewDir)).toBe(false);

    const dumpOut: string[] = [];
    const outputDir = join(root, 'bundle');
    const dumpCode = await runExportApp(
      ['--output', outputDir, '--db', dbPath, '--progress', 'silent'],
      (message) => dumpOut.push(message),
      () => {},
    );
    const dump = JSON.parse(dumpOut.join('')) as { documentCount: number; rowCount: number };

    expect(dumpCode).toBe(0);
    expect(dump.documentCount).toBe(1);
    expect(dump.rowCount).toBeGreaterThan(0);
    expect(readFileSync(join(outputDir, 'documents', 'markdown', 'closeout_export.md'), 'utf8'))
      .toContain('Closeout export body');
    const docJson = JSON.parse(readFileSync(join(outputDir, 'documents', 'json', 'closeout_export.json'), 'utf8'));
    expect(docJson).toMatchObject({ id: 'closeout-doc', concepts: ['export', 'backup'] });
    const collectionJson = JSON.parse(readFileSync(join(outputDir, 'collections', 'oracle_documents.json'), 'utf8'));
    expect(collectionJson).toMatchObject({ collection: 'oracle_documents', rowCount: 1 });

    const backupConnection = createDatabase(dbPath);
    try {
      const backup = await writeSqliteBackup({ connection: backupConnection, outDir: join(root, 'sql-backups') });
      const sql = readFileSync(backup.path, 'utf8');
      expect(backup.rowCount).toBeGreaterThan(0);
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "oracle_documents"');
      expect(sql).toContain('closeout-doc');
    } finally {
      backupConnection.storage.close();
    }
  });
});
