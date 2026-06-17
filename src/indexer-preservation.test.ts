import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { oracleDocuments } from './db/schema.ts';
import { database, insertTestDoc, resetPreservationDb, simulateSmartDeletion } from './indexer/preservation-harness.test-helper.ts';
import { registerExtraPreservationTests } from './indexer/preservation-extra.test-helper.ts';

beforeEach(resetPreservationDb);

describe('Indexer Preservation - oracle_learn documents', () => {
  it('should preserve oracle_learn documents during re-index', () => {
    insertTestDoc({ id: 'test-oracle-learn-1', type: 'learning', sourceFile: 'ψ/memory/learnings/test.md', createdBy: 'oracle_learn', project: 'github.com/other/repo' });
    insertTestDoc({ id: 'test-indexer-1', type: 'learning', sourceFile: 'ψ/memory/learnings/local.md', createdBy: 'indexer', project: 'github.com/current/repo' });
    const deleted = simulateSmartDeletion('github.com/current/repo');
    const preserved = database().select().from(oracleDocuments)
      .where(eq(oracleDocuments.id, 'test-oracle-learn-1')).get();
    const notPreserved = database().select().from(oracleDocuments)
      .where(eq(oracleDocuments.id, 'test-indexer-1')).get();
    expect(preserved).toBeDefined();
    expect(preserved?.createdBy).toBe('oracle_learn');
    expect(notPreserved).toBeUndefined();
    expect(deleted).toContain('test-indexer-1');
    expect(deleted).not.toContain('test-oracle-learn-1');
  });

  it('should preserve oracle_learn docs from different projects', () => {
    insertTestDoc({ id: 'learn-repo-a', type: 'learning', sourceFile: 'ψ/memory/learnings/a.md', createdBy: 'oracle_learn', project: 'github.com/team/repo-a' });
    insertTestDoc({ id: 'learn-repo-b', type: 'learning', sourceFile: 'ψ/memory/learnings/b.md', createdBy: 'oracle_learn', project: 'github.com/team/repo-b' });
    simulateSmartDeletion('github.com/team/repo-a');
    const docA = database().select().from(oracleDocuments)
      .where(eq(oracleDocuments.id, 'learn-repo-a')).get();
    const docB = database().select().from(oracleDocuments)
      .where(eq(oracleDocuments.id, 'learn-repo-b')).get();
    expect(docA).toBeDefined();
    expect(docB).toBeDefined();
  });
});

describe('Indexer Preservation - project isolation', () => {
  it('should delete indexer docs from current project only', () => {
    insertTestDoc({ id: 'other-repo-doc', type: 'principle', sourceFile: 'ψ/memory/resonance/other.md', createdBy: 'indexer', project: 'github.com/other/repo' });
    insertTestDoc({ id: 'current-repo-doc', type: 'principle', sourceFile: 'ψ/memory/resonance/current.md', createdBy: 'indexer', project: 'github.com/current/repo' });
    const deleted = simulateSmartDeletion('github.com/current/repo');
    const otherDoc = database().select().from(oracleDocuments)
      .where(eq(oracleDocuments.id, 'other-repo-doc')).get();
    const currentDoc = database().select().from(oracleDocuments)
      .where(eq(oracleDocuments.id, 'current-repo-doc')).get();
    expect(otherDoc).toBeDefined();
    expect(currentDoc).toBeUndefined();
    expect(deleted).toContain('current-repo-doc');
    expect(deleted).not.toContain('other-repo-doc');
  });

  it('should delete universal (null project) indexer docs', () => {
    insertTestDoc({ id: 'universal-indexer-doc', type: 'principle', sourceFile: 'ψ/memory/resonance/universal.md', createdBy: 'indexer', project: null });
    insertTestDoc({ id: 'project-specific-doc', type: 'principle', sourceFile: 'ψ/memory/resonance/project.md', createdBy: 'indexer', project: 'github.com/current/repo' });
    const deleted = simulateSmartDeletion('github.com/current/repo');
    expect(deleted).toContain('universal-indexer-doc');
    expect(deleted).toContain('project-specific-doc');
  });

  it('should preserve universal oracle_learn docs', () => {
    insertTestDoc({ id: 'universal-learn-doc', type: 'learning', sourceFile: 'ψ/memory/learnings/universal.md', createdBy: 'oracle_learn', project: null });
    const deleted = simulateSmartDeletion('github.com/any/repo');
    const doc = database().select().from(oracleDocuments)
      .where(eq(oracleDocuments.id, 'universal-learn-doc')).get();
    expect(doc).toBeDefined();
    expect(deleted).not.toContain('universal-learn-doc');
  });
});

registerExtraPreservationTests();
