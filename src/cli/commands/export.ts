/**
 * Standalone data export CLI command.
 *
 * Supports:
 *  - `--format json` (legacy behavior): exports all vector collections + all SQLite tables
 *  - `--format markdown`: same dataset, rendered as markdown sections
 *  - `--out <file>`: optional output file, defaults to stdout
 */

import { createWriteStream } from 'fs';
import fs from 'fs';
import path from 'path';
import { Database } from 'bun:sqlite';
import { createDatabase } from '../../db/index.ts';
import { getEmbeddingModels, createVectorStoreForModel } from '../../vector/factory.ts';
import { EXPORT_FORMATS, ExportCollection } from '../../vector/export-formats.ts';
import { buildCollectionName, coerceRecordsForExport, ensureMarkdownFinalSectionOrder } from './export-markdown.ts';

type ExportOptions = {
  format: keyof typeof EXPORT_FORMATS;
  out?: string;
};

type ExportSink = {
  write: (text: string) => void;
  close: () => Promise<void>;
};

export async function exportCommand(argv: string[]): Promise<number> {
  if (argv[0] !== 'export') {
    console.log('Usage: bun run src/cli/index.ts export --format markdown [--out <path>]');
    return 1;
  }

  const options = parseExportArgs(argv.slice(1));
  const format = options.format;

  const collections: ExportCollection[] = [];
  const { sqlite } = createDatabase();
  try {
    collections.push(...await collectVectorCollections(format));
    collections.push(...collectAllSqliteCollections(sqlite));
  } catch (err) {
    console.error(`export failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    sqlite.close();
  }

  const finalCollections = applyCollectionOrdering(collections, format);
  const formatter = EXPORT_FORMATS[format];

  const sink = createSink(options.out);
  try {
    await formatter(sink.write, finalCollections);
    await sink.close();
    return 0;
  } catch (err) {
    console.error(`write failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function parseExportArgs(argv: string[]): ExportOptions {
  const options: ExportOptions = { format: 'json' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[i + 1];
    if (arg === '--format') {
      const fmt = next();
      if (!fmt || !(fmt in EXPORT_FORMATS)) {
        console.error('--format supports: json, markdown');
        process.exit(1);
      }
      options.format = fmt as keyof typeof EXPORT_FORMATS;
      i += 1;
    } else if (arg === '--out') {
      const out = next();
      if (!out) {
        console.error('--out requires a file path');
        process.exit(1);
      }
      options.out = out;
      i += 1;
    }
  }
  return options;
}

function quoteName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function collectAllSqliteCollections(sqlite: Database): ExportCollection[] {
  const rows = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
  ).all() as Array<{ name: string }>;
  const names = rows.map((r) => r.name).sort();

  const out: ExportCollection[] = [];
  for (const name of names) {
    try {
      const tableRows = sqlite.prepare(`SELECT * FROM ${quoteName(name)}`).all() as Array<Record<string, unknown>>;
      const collectionName = buildCollectionName(name, 'sqlite');
      out.push({
        name: collectionName,
        source: 'sqlite',
        count: tableRows.length,
        records: coerceRecordsForExport(tableRows),
      });
    } catch (err) {
      out.push({
        name: buildCollectionName(name, 'sqlite'),
        source: 'sqlite',
        count: 0,
        records: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}

async function collectVectorCollections(format: string): Promise<ExportCollection[]> {
  const models = getEmbeddingModels();
  const byCollection = new Map<string, { key: string }>();

  for (const [key, preset] of Object.entries(models)) {
    if (!byCollection.has(preset.collection)) {
      byCollection.set(preset.collection, { key });
    }
  }

  const collections: ExportCollection[] = [];
  for (const [name, { key }] of byCollection) {
    const preset = models[key];
    if (!preset) continue;

    const store = createVectorStoreForModel(preset);
    try {
      await store.connect();
      await store.ensureCollection();

      const info = await store.getCollectionInfo().catch(() => ({ count: 0, name }));

      if (!store.getAllEmbeddings) {
        collections.push({
          name: buildCollectionName(name, 'vector'),
          source: 'vector',
          count: info.count,
          records: [],
          error: `getAllEmbeddings not implemented by ${store.name}`,
        });
        continue;
      }

      const result = await store.getAllEmbeddings(Math.max(100, info.count || 5000));
      const records = [] as ExportRecordPair[];
      for (let i = 0; i < result.ids.length; i++) {
        const meta = result.metadatas?.[i] ?? {};
        const record: Record<string, unknown> = {
          id: result.ids[i],
          metadata: meta,
          embedding: result.embeddings?.[i],
        };

        if (format === 'json') {
          record.embedding = result.embeddings?.[i];
        }
        records.push(record);
      }

      collections.push({
        name: buildCollectionName(name, 'vector'),
        source: 'vector',
        count: records.length,
        records: coerceRecordsForExport(records as Record<string, unknown>[]),
      });
    } catch (err) {
      collections.push({
        name: buildCollectionName(name, 'vector'),
        source: 'vector',
        count: 0,
        records: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await store.close().catch(() => {});
    }
  }

  return collections;
}

function applyCollectionOrdering(collections: ExportCollection[], format: string): ExportCollection[] {
  const ordered = [...collections];
  const sqliteDocsName = buildCollectionName('oracle_documents', 'sqlite');

  ordered.sort((a, b) => {
    // Vector first, SQLite last
    if (a.source === 'vector' && b.source === 'sqlite') return -1;
    if (a.source === 'sqlite' && b.source === 'vector') return 1;

    // Make SQLite documents explicitly final, as requested.
    if (a.name === sqliteDocsName) return 1;
    if (b.name === sqliteDocsName) return -1;

    return a.name.localeCompare(b.name);
  });

  return format === 'markdown' ? ensureMarkdownFinalSectionOrder(ordered) : ordered;
}

function createSink(outFile?: string): ExportSink {
  if (!outFile) {
    return {
      write: (chunk: string) => process.stdout.write(chunk),
      close: async () => {},
    };
  }

  const dir = path.dirname(outFile);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stream = createWriteStream(outFile, { encoding: 'utf8' });
  return {
    write: (chunk: string) => stream.write(chunk),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        stream.end();
        stream.on('finish', () => resolve());
        stream.on('error', (err) => reject(err));
      });
    },
  };
}

type ExportRecordPair = Record<string, unknown>;
