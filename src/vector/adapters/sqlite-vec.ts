import { Database } from 'bun:sqlite';
import type { VectorStoreAdapter, VectorDocument, VectorQueryResult, EmbeddingProvider } from '../types.ts';

type SqliteVecRow = {
  id: string;
  distance: number;
  document: string;
  metadata: string;
};

function toBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

function fromBlob(blob: any): number[] {
  if (blob instanceof Buffer || blob instanceof Uint8Array) {
    return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
  }
  if (typeof blob === 'string') {
    try { return JSON.parse(blob); } catch { return []; }
  }
  return [];
}

function rowsToResult(rows: SqliteVecRow[]): VectorQueryResult {
  return {
    ids: rows.map(r => r.id),
    documents: rows.map(r => r.document),
    distances: rows.map(r => r.distance),
    metadatas: rows.map(r => JSON.parse(r.metadata)),
  };
}

export class SqliteVecAdapter implements VectorStoreAdapter {
  readonly name = 'sqlite-vec';
  private db: Database | null = null;
  private dbPath: string;
  private collectionName: string;
  private embedder: EmbeddingProvider;

  constructor(collectionName: string, dbPath: string, embedder: EmbeddingProvider) {
    this.collectionName = collectionName;
    this.dbPath = dbPath;
    this.embedder = embedder;
  }

  async connect(): Promise<void> {
    if (this.db) return;

    this.db = new Database(this.dbPath);
    let loaded = false;
    const tryPaths = ['vec0', '/usr/local/lib/sqlite-vec'];

    try {
      const sqliteVec = require('sqlite-vec');
      const extPath = sqliteVec.getLoadablePath();
      this.db.loadExtension(extPath);
      loaded = true;
    } catch {
      for (const p of tryPaths) {
        try {
          this.db.loadExtension(p);
          loaded = true;
          break;
        } catch { /* try next */ }
      }
    }

    if (!loaded) {
      throw new Error('Failed to load sqlite-vec extension. Install: bun add sqlite-vec');
    }

    console.log('[sqlite-vec] Connected');
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[sqlite-vec] Closed');
    }
  }

  async ensureCollection(): Promise<void> {
    if (!this.db) throw new Error('sqlite-vec not connected');

    const dims = this.embedder.dimensions;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.collectionName}_meta (
        id TEXT PRIMARY KEY,
        document TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.collectionName}_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${dims}]
      )
    `);

    console.log(`[sqlite-vec] Collection '${this.collectionName}' ready (${dims} dims)`);
  }

  async deleteCollection(): Promise<void> {
    if (!this.db) throw new Error('sqlite-vec not connected');

    try {
      this.db.exec(`DROP TABLE IF EXISTS ${this.collectionName}_meta`);
      this.db.exec(`DROP TABLE IF EXISTS ${this.collectionName}_vec`);
      console.log(`[sqlite-vec] Collection '${this.collectionName}' deleted`);
    } catch (e) {
      console.warn('[sqlite-vec] deleteCollection failed:', e instanceof Error ? e.message : String(e));
    }
  }

  async addDocuments(docs: VectorDocument[]): Promise<void> {
    if (docs.length === 0) return;
    if (!this.db) throw new Error('sqlite-vec not connected');

    await this.ensureCollection();

    const texts = docs.map(d => d.document);
    const embeddings = await this.embedder.embed(texts, 'passage');

    const insertMeta = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.collectionName}_meta (id, document, metadata)
      VALUES (?, ?, ?)
    `);

    const insertVec = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.collectionName}_vec (id, embedding)
      VALUES (?, ?)
    `);

    this.db.exec('BEGIN');
    try {
      for (let i = 0; i < docs.length; i++) {
        insertMeta.run(docs[i].id, docs[i].document, JSON.stringify(docs[i].metadata));
        insertVec.run(docs[i].id, toBlob(embeddings[i]));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }

    console.log(`[sqlite-vec] Added ${docs.length} documents`);
  }

  async query(text: string, limit: number = 10, where?: Record<string, any>): Promise<VectorQueryResult> {
    if (!this.db) throw new Error('sqlite-vec not connected');

    const [queryEmbedding] = await this.embedder.embed([text], 'query');
    const fetchLimit = where ? limit * 3 : limit;

    const rows = this.db.prepare(`
      SELECT v.id, v.distance, m.document, m.metadata
      FROM ${this.collectionName}_vec v
      JOIN ${this.collectionName}_meta m ON v.id = m.id
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `).all(toBlob(queryEmbedding), fetchLimit) as SqliteVecRow[];

    let filtered = rows;
    if (where) {
      filtered = rows.filter(row => {
        const meta = JSON.parse(row.metadata);
        return Object.entries(where).every(([k, v]) => meta[k] === v);
      }).slice(0, limit);
    }

    return rowsToResult(filtered);
  }

  async queryById(id: string, nResults: number = 5): Promise<VectorQueryResult> {
    if (!this.db) throw new Error('sqlite-vec not connected');

    const doc = this.db.prepare(`
      SELECT embedding FROM ${this.collectionName}_vec WHERE id = ?
    `).get(id) as { embedding: any } | null;

    if (!doc) {
      throw new Error(`No embedding found for document: ${id}`);
    }

    const rows = this.db.prepare(`
      SELECT v.id, v.distance, m.document, m.metadata
      FROM ${this.collectionName}_vec v
      JOIN ${this.collectionName}_meta m ON v.id = m.id
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `).all(doc.embedding, nResults + 1) as SqliteVecRow[];

    const filtered = rows.filter(r => r.id !== id).slice(0, nResults);
    return rowsToResult(filtered);
  }

  async queryByVector(vector: number[], nResults: number = 5): Promise<VectorQueryResult> {
    if (!this.db) throw new Error('sqlite-vec not connected');

    const rows = this.db.prepare(`
      SELECT v.id, vec_distance_L2(v.embedding, ?) AS distance, m.document, m.metadata
      FROM ${this.collectionName}_vec v
      JOIN ${this.collectionName}_meta m ON v.id = m.id
      ORDER BY distance
      LIMIT ?
    `).all(toBlob(vector), nResults) as SqliteVecRow[];

    return rowsToResult(rows);
  }

  async getStats(): Promise<{ count: number }> {
    if (!this.db) return { count: 0 };

    try {
      const result = this.db.prepare(
        `SELECT COUNT(*) as count FROM ${this.collectionName}_meta`
      ).get() as { count: number };
      return { count: result.count };
    } catch {
      return { count: 0 };
    }
  }

  async getCollectionInfo(): Promise<{ count: number; name: string }> {
    const stats = await this.getStats();
    return { count: stats.count, name: this.collectionName };
  }

  async getAllEmbeddings(limit: number = 5000): Promise<{ ids: string[]; embeddings: number[][]; metadatas: any[] }> {
    if (!this.db) return { ids: [], embeddings: [], metadatas: [] };

    const rows = this.db.prepare(`
      SELECT v.id, v.embedding, m.metadata
      FROM ${this.collectionName}_vec v
      JOIN ${this.collectionName}_meta m ON v.id = m.id
      LIMIT ?
    `).all(limit) as Array<{ id: string; embedding: any; metadata: string }>;

    return {
      ids: rows.map(r => r.id),
      embeddings: rows.map(r => fromBlob(r.embedding)),
      metadatas: rows.map(r => JSON.parse(r.metadata)),
    };
  }
}
