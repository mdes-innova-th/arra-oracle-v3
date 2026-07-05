import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const savedDataDir = process.env.ORACLE_DATA_DIR;
const root = mkdtempSync(join(tmpdir(), 'arra-sleep-consolidation-'));
process.env.ORACLE_DATA_DIR = root;

const dbModule = await import('../../src/db/index.ts');
const workerModule = await import('../../src/workers/sleep-consolidation.ts');
const queueModule = await import('../../src/workers/consolidation-queue.ts');
const { createDatabase, oracleDocuments, resetDefaultDatabaseForTests } = dbModule;
const { createSleepConsolidationWorker, runSleepConsolidationSweep, sleepConsolidationStatus } = workerModule;
const { clearConsolidationQueueForTests, listQueuedConsolidationPlans } = queueModule;

type Connection = ReturnType<typeof createDatabase>;

const now = Date.parse('2026-07-05T00:00:00.000Z');
const content = 'Oracle memory consolidation uses vector similarity, human approval, supersede-not-delete, and no LLM.';
const models = () => ({ bge: { collection: 'oracle_docs_bge', model: 'bge-m3' } });

function connection(name: string): Connection {
  return createDatabase(join(root, `${name}.db`));
}

function addDoc(conn: Connection, id: string, updatedAt: number, tenantId = 'tenant-a') {
  conn.db.insert(oracleDocuments).values({
    id,
    tenantId,
    type: 'memory',
    sourceFile: `docs/${id}.md`,
    concepts: '["memory","consolidation"]',
    createdAt: updatedAt - 1000,
    updatedAt,
    indexedAt: updatedAt,
    usageCount: id.startsWith('new') ? 4 : 0,
  }).run();
  conn.sqlite.prepare('INSERT INTO oracle_fts (id, content, concepts) VALUES (?, ?, ?)')
    .run(id, content, 'memory consolidation');
}

function addPair(conn: Connection) {
  addDoc(conn, 'old-doc', now - 86_400_000);
  addDoc(conn, 'new-doc', now);
}

function connectWith(distance: number) {
  return async () => ({
    queryById: async (id: string) => ({
      ids: id === 'old-doc' ? ['new-doc'] : id === 'new-doc' ? ['old-doc'] : [],
      documents: [content],
      distances: [distance],
      metadatas: [{}],
    }),
  });
}

function supersededBy(conn: Connection, id: string) {
  return conn.db.select({ supersededBy: oracleDocuments.supersededBy })
    .from(oracleDocuments)
    .where(eq(oracleDocuments.id, id))
    .get()?.supersededBy;
}

beforeEach(() => clearConsolidationQueueForTests());

afterAll(() => {
  if (savedDataDir === undefined) delete process.env.ORACLE_DATA_DIR;
  else process.env.ORACLE_DATA_DIR = savedDataDir;
  resetDefaultDatabaseForTests(':memory:');
  if (existsSync(root)) rmSync(root, { recursive: true });
});

describe('sleep-time consolidation worker', () => {
  test('stays disabled by default and does not query vectors', async () => {
    const conn = connection('disabled');
    addPair(conn);
    let called = false;

    try {
      const worker = createSleepConsolidationWorker(conn.sqlite, { env: {}, connect: async () => { called = true; throw new Error('disabled'); } });
      worker.start();
      const result = await runSleepConsolidationSweep(conn.sqlite, { env: {}, models, connect: async () => { called = true; throw new Error('disabled'); } });

      expect(worker.isRunning()).toBe(false);
      expect(result).toMatchObject({ enabled: false, scanned: 0, planned: 0, suggestionsEmitted: 0, deleted: 0 });
      expect(called).toBe(false);
      expect(listQueuedConsolidationPlans('tenant-a')).toEqual([]);
      expect(supersededBy(conn, 'old-doc')).toBeNull();
    } finally {
      conn.storage.close();
    }
  });

  test('queues a near-duplicate vector suggestion without mutating docs', async () => {
    const conn = connection('suggest');
    addPair(conn);

    try {
      const result = await runSleepConsolidationSweep(conn.sqlite, {
        env: { ORACLE_CONSOLIDATION_WORKER: '1', ORACLE_CONSOLIDATION_SIMILARITY_THRESHOLD: '0.95' },
        now, models, connect: connectWith(0.02),
      });
      const queued = listQueuedConsolidationPlans('tenant-a');

      expect(result).toMatchObject({ enabled: true, scanned: 2, planned: 1, suggestionsEmitted: 1, deleted: 0 });
      expect(queued[0]).toMatchObject({ oldId: 'old-doc', newId: 'new-doc', tenantId: 'tenant-a', cosine: 0.98 });
      expect(queued[0].reason).toContain('sleep-time vector duplicate');
      expect(supersededBy(conn, 'old-doc')).toBeNull();
      expect(sleepConsolidationStatus({ ORACLE_CONSOLIDATION_WORKER: '1' }).suggestionsEmitted).toBeGreaterThanOrEqual(1);
    } finally {
      conn.storage.close();
    }
  });

  test('honors strict similarity threshold before queuing suggestions', async () => {
    const conn = connection('threshold');
    addPair(conn);

    try {
      const result = await runSleepConsolidationSweep(conn.sqlite, {
        env: { ORACLE_CONSOLIDATION_WORKER: '1', ORACLE_CONSOLIDATION_SIMILARITY_THRESHOLD: '0.99' },
        now, models, connect: connectWith(0.02),
      });

      expect(result).toMatchObject({ enabled: true, scanned: 2, planned: 0, suggestionsEmitted: 0 });
      expect(listQueuedConsolidationPlans('tenant-a')).toEqual([]);
      expect(supersededBy(conn, 'old-doc')).toBeNull();
    } finally {
      conn.storage.close();
    }
  });
});
