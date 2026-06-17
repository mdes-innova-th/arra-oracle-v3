import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { oracleDocuments } from '../db/schema.ts';
import { database, insertTestDoc, simulateSmartDeletion, sqliteDb } from './preservation-harness.test-helper.ts';

export function registerExtraPreservationTests() {
  describe('Indexer Preservation - legacy docs (null createdBy)', () => {
    it('should treat legacy docs (null createdBy) as indexer-created', () => {
      insertTestDoc({
        id: 'legacy-doc',
        type: 'learning',
        sourceFile: 'ψ/memory/learnings/legacy.md',
        createdBy: null,
        project: 'github.com/current/repo',
      });
      const deleted = simulateSmartDeletion('github.com/current/repo');
      const doc = database().select().from(oracleDocuments)
        .where(eq(oracleDocuments.id, 'legacy-doc')).get();
      expect(doc).toBeUndefined();
      expect(deleted).toContain('legacy-doc');
    });
  });

  describe('Indexer Preservation - FTS sync', () => {
    it('should delete from FTS table when deleting from oracle_documents', () => {
      insertTestDoc({
        id: 'fts-test-doc',
        type: 'learning',
        sourceFile: 'ψ/memory/learnings/fts.md',
        createdBy: 'indexer',
        project: 'github.com/current/repo',
        content: 'Searchable content for FTS test',
      });
      const before = sqliteDb().prepare('SELECT id FROM oracle_fts WHERE id = ?').get('fts-test-doc');
      expect(before).toBeDefined();
      simulateSmartDeletion('github.com/current/repo');
      const after = sqliteDb().prepare('SELECT id FROM oracle_fts WHERE id = ?').get('fts-test-doc');
      expect(after).toBeFalsy();
    });

    it('should preserve FTS entries for preserved documents', () => {
      insertTestDoc({
        id: 'fts-preserved-doc',
        type: 'learning',
        sourceFile: 'ψ/memory/learnings/preserved.md',
        createdBy: 'oracle_learn',
        project: 'github.com/other/repo',
        content: 'This content should remain searchable',
      });
      simulateSmartDeletion('github.com/current/repo');
      const fts = sqliteDb().prepare('SELECT content FROM oracle_fts WHERE id = ?')
        .get('fts-preserved-doc') as { content: string } | undefined;
      expect(fts).toBeDefined();
      expect(fts?.content).toBe('This content should remain searchable');
    });
  });

  describe('Indexer Preservation - edge cases', () => {
    it('should handle empty database gracefully', () => {
      expect(simulateSmartDeletion('github.com/any/repo')).toEqual([]);
    });

    it('should handle database with only oracle_learn docs', () => {
      insertTestDoc({ id: 'only-learn-1', type: 'learning', sourceFile: 'ψ/memory/learnings/1.md', createdBy: 'oracle_learn', project: 'github.com/repo/1' });
      insertTestDoc({ id: 'only-learn-2', type: 'learning', sourceFile: 'ψ/memory/learnings/2.md', createdBy: 'oracle_learn', project: 'github.com/repo/2' });
      expect(simulateSmartDeletion('github.com/any/repo')).toEqual([]);
      expect(database().select().from(oracleDocuments).all().length).toBe(2);
    });

    it('should handle mixed createdBy values correctly', () => {
      insertTestDoc({ id: 'indexer-doc', type: 'learning', sourceFile: 'ψ/memory/learnings/indexer.md', createdBy: 'indexer', project: 'github.com/current/repo' });
      insertTestDoc({ id: 'oracle-learn-doc', type: 'learning', sourceFile: 'ψ/memory/learnings/learn.md', createdBy: 'oracle_learn', project: 'github.com/current/repo' });
      insertTestDoc({ id: 'manual-doc', type: 'learning', sourceFile: 'ψ/memory/learnings/manual.md', createdBy: 'manual', project: 'github.com/current/repo' });
      insertTestDoc({ id: 'legacy-doc', type: 'learning', sourceFile: 'ψ/memory/learnings/legacy.md', createdBy: null, project: 'github.com/current/repo' });
      const deleted = simulateSmartDeletion('github.com/current/repo');
      expect(deleted).toContain('indexer-doc');
      expect(deleted).toContain('legacy-doc');
      expect(deleted).not.toContain('oracle-learn-doc');
      expect(deleted).not.toContain('manual-doc');
      const remainingIds = database().select({ id: oracleDocuments.id })
        .from(oracleDocuments).all().map((doc) => doc.id);
      expect(remainingIds).toContain('oracle-learn-doc');
      expect(remainingIds).toContain('manual-doc');
    });
  });
}
