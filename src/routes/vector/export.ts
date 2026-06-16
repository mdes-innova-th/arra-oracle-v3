/**
 * GET /api/vector/export — stream a vector collection as JSON, JSONL, CSV, or Markdown.
 */

import { Elysia, t } from 'elysia';
import {
  exportFormatterFor,
  rowsFromEmbeddingDump,
  supportedExportFormats,
  VECTOR_EXPORT_COLUMNS,
} from '../../vector/export-formats.ts';
import { getVectorStoreByModel } from '../../vector/factory.ts';
import type { VectorStoreAdapter } from '../../vector/types.ts';

interface VectorExportDeps {
  getStore?: (collection?: string) => VectorStoreAdapter;
}

const DEFAULT_COLLECTION = 'bge-m3';
const DEFAULT_EXPORT_LIMIT = 50_000;

function invalidFormat(format: string) {
  return { error: `Invalid format: expected ${supportedExportFormats().join(' or ')}`, format };
}

export function createVectorExportEndpoint(deps: VectorExportDeps = {}) {
  const getStore = deps.getStore ?? getVectorStoreByModel;

  return new Elysia().get(
    '/vector/export',
    async ({ query, set }) => {
      const format = query.format || 'json';
      const formatter = exportFormatterFor(format);
      if (!formatter) {
        set.status = 400;
        return invalidFormat(format);
      }

      const collection = query.collection || DEFAULT_COLLECTION;
      try {
        const store = getStore(collection);
        await store.connect();
        await store.ensureCollection();
        if (!store.getAllEmbeddings) {
          set.status = 501;
          return { error: 'Vector collection export is not supported by this adapter' };
        }

        const stats = await store.getStats().catch(() => ({ count: 0 }));
        const limit = stats.count > 0 ? stats.count : DEFAULT_EXPORT_LIMIT;
        const dump = await store.getAllEmbeddings(limit);
        const rows = rowsFromEmbeddingDump(dump);

        return new Response(formatter.stream({ rows, columns: VECTOR_EXPORT_COLUMNS }), {
          headers: {
            'Content-Type': formatter.mimeType,
            'Content-Disposition': `attachment; filename="${collection}.${formatter.extension}"`,
          },
        });
      } catch (error) {
        set.status = 500;
        const message = error instanceof Error ? error.message : String(error);
        return { error: 'Vector export failed', message };
      }
    },
    {
      query: t.Object({
        collection: t.Optional(t.String()),
        format: t.Optional(t.String()),
      }),
      detail: {
        tags: ['vector'],
        menu: { group: 'tools', order: 57 },
        summary: 'Export a vector collection as JSON, JSONL, CSV, or Markdown',
      },
    },
  );
}

export const vectorExportEndpoint = createVectorExportEndpoint();
