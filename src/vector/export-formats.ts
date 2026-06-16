import type { VectorStoreAdapter } from './types.ts';

export type EmbeddingDump = Awaited<ReturnType<NonNullable<VectorStoreAdapter['getAllEmbeddings']>>>;
export type ExportFormatName = string;
export type ExportRow = Record<string, unknown>;

export interface ExportFormatterInput {
  value?: unknown;
  rows?: ExportRow[];
  columns?: string[];
  pretty?: boolean;
  dump?: EmbeddingDump;
}

export type ExportFormatter = ((dump: EmbeddingDump) => ReadableStream<Uint8Array>) & {
  format?: string;
  contentType?: string;
  mimeType?: string;
  extension?: string;
  stream?: (input: ExportFormatterInput) => ReadableStream<Uint8Array>;
};

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

function jsonlValues(input: ExportFormatterInput): unknown[] {
  if (input.rows) return input.rows;
  if (Array.isArray(input.value)) return input.value;
  return 'value' in input ? [input.value] : [];
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

function markdownBlocks(rows: ExportRow[]): string {
  const files = new Map<string, string[]>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const path = text(row.source_file ?? row.sourceFile ?? row.id) || `document-${i + 1}`;
    const blocks = files.get(path) ?? [];
    const document = text(row.document ?? row.content ?? row.text).trim();
    if (document) blocks.push(document);
    files.set(path, blocks);
  }
  return [...files.entries()]
    .map(([path, blocks]) => [`<!-- source: ${path} -->`, ...blocks].join('\n\n'))
    .join('\n\n---\n\n');
}

function normalizeName(name: string, strict = true): string {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    if (strict) throw new Error(`invalid export format: ${name}`);
    return '';
  }
  return normalized;
}

function defineFormatter(name: string, meta: { contentType: string; extension: string }, stream: ExportFormatter['stream']): ExportFormatter {
  const formatter = ((dump: EmbeddingDump) => stream!({ rows: rowsFromEmbeddingDump(dump), columns: VECTOR_EXPORT_COLUMNS, dump })) as ExportFormatter;
  return Object.assign(formatter, { format: name, mimeType: meta.contentType, ...meta, stream });
}

export function rowsFromEmbeddingDump(dump: EmbeddingDump): ExportRow[] {
  return dump.ids.map((_, index) => rowAt(dump, index));
}

export const jsonExportFormatter = defineFormatter('json', {
  contentType: 'application/json; charset=utf-8',
  extension: 'json',
}, (input) => {
  const spacing = input.pretty ? 2 : undefined;
  return streamText(`${JSON.stringify(jsonValue(input), null, spacing)}\n`);
});

export const jsonlExportFormatter = defineFormatter('jsonl', {
  contentType: 'application/x-ndjson; charset=utf-8',
  extension: 'jsonl',
}, (input) => {
  const lines = jsonlValues(input).map((value) => JSON.stringify(value));
  return streamText(lines.length ? `${lines.join('\n')}\n` : '');
});

export const csvExportFormatter = defineFormatter('csv', {
  contentType: 'text/csv; charset=utf-8',
  extension: 'csv',
}, (input) => {
  const rows = input.rows ?? [];
  const columns = columnsFor(rows, input.columns);
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
  return streamText(`${lines.join('\n')}\n`);
});

export const markdownExportFormatter = defineFormatter('markdown', {
  contentType: 'text/markdown; charset=utf-8',
  extension: 'md',
}, (input) => streamText(markdownBlocks(input.rows ?? [])));

export const exportFormatters: Record<string, ExportFormatter> = {};

export function registerExportFormat(name: string, formatter: ExportFormatter): void {
  if (typeof formatter !== 'function') throw new Error(`formatter for ${name} must be a function`);
  exportFormatters[normalizeName(name)] = formatter;
}

export function getExportFormat(name: string): ExportFormatter | undefined {
  return exportFormatters[normalizeName(name, false)];
}

export function exportFormatterFor(format: string): ExportFormatter | undefined {
  return getExportFormat(format);
}

export function listExportFormats(): string[] {
  return Object.keys(exportFormatters).sort();
}

export function supportedExportFormats(): string[] {
  return listExportFormats();
}

export async function exportText(formatter: ExportFormatter, input: ExportFormatterInput): Promise<string> {
  if (!formatter.stream) throw new Error(`export format ${formatter.format ?? 'unknown'} does not support row input`);
  return await new Response(formatter.stream(input)).text();
}

registerExportFormat('json', jsonExportFormatter);
registerExportFormat('jsonl', jsonlExportFormatter);
registerExportFormat('csv', csvExportFormatter);
registerExportFormat('markdown', markdownExportFormatter);
