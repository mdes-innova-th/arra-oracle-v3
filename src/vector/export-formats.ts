import type { VectorStoreAdapter } from './types.ts';

export type EmbeddingDump = Awaited<ReturnType<NonNullable<VectorStoreAdapter['getAllEmbeddings']>>>;
export type ExportFormatName = 'json' | 'csv';
export type ExportRow = Record<string, unknown>;

export interface ExportFormatterInput {
  value?: unknown;
  rows?: ExportRow[];
  columns?: string[];
  pretty?: boolean;
}

export interface ExportFormatter {
  readonly format: ExportFormatName;
  readonly mimeType: string;
  readonly extension: string;
  stream(input: ExportFormatterInput): ReadableStream<Uint8Array>;
}

export const VECTOR_EXPORT_COLUMNS = ['id', 'document', 'type', 'source_file', 'concepts'];
const encoder = new TextEncoder();

function streamText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value);
}

function concepts(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  } catch { /* fall through to comma split */ }
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function csvCell(value: unknown): string {
  return `"${valueText(value).replaceAll('"', '""')}"`;
}

function columnsFor(rows: ExportRow[], requested?: string[]): string[] {
  if (requested?.length) return requested;
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen];
}

function jsonValue(input: ExportFormatterInput): unknown {
  if ('value' in input) return input.value;
  return input.rows ?? [];
}

function rowAt(dump: EmbeddingDump, index: number): ExportRow {
  const metadata = dump.metadatas[index] ?? {};
  const meta = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
  return {
    id: text(dump.ids[index]),
    document: text(dump.documents?.[index] ?? meta.document ?? meta.content ?? meta.text),
    type: text(meta.type),
    source_file: text(meta.source_file ?? meta.sourceFile),
    concepts: concepts(meta.concepts),
  };
}

export function rowsFromEmbeddingDump(dump: EmbeddingDump): ExportRow[] {
  return dump.ids.map((_, index) => rowAt(dump, index));
}

export const jsonExportFormatter: ExportFormatter = {
  format: 'json',
  mimeType: 'application/json; charset=utf-8',
  extension: 'json',
  stream(input) {
    const spacing = input.pretty ? 2 : undefined;
    return streamText(`${JSON.stringify(jsonValue(input), null, spacing)}\n`);
  },
};

export const csvExportFormatter: ExportFormatter = {
  format: 'csv',
  mimeType: 'text/csv; charset=utf-8',
  extension: 'csv',
  stream(input) {
    const rows = input.rows ?? [];
    const columns = columnsFor(rows, input.columns);
    const lines = [columns.join(',')];
    for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
    return streamText(`${lines.join('\n')}\n`);
  },
};

export const exportFormatters: Record<ExportFormatName, ExportFormatter> = {
  json: jsonExportFormatter,
  csv: csvExportFormatter,
};

export function exportFormatterFor(format: string): ExportFormatter | undefined {
  return exportFormatters[format as ExportFormatName];
}

export function supportedExportFormats(): ExportFormatName[] {
  return Object.keys(exportFormatters) as ExportFormatName[];
}

export async function exportText(formatter: ExportFormatter, input: ExportFormatterInput): Promise<string> {
  return await new Response(formatter.stream(input)).text();
}
