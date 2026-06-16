/**
 * Export format registry for standalone data dumps.
 *
 * The registry keeps formatting implementations tiny and composable:
 *   - streamJson() for machine-readable exports
 *   - streamMarkdown() for human-readable one-file dumps
 */

export type ExportRecord = Record<string, unknown>;

export interface ExportCollection {
  name: string;
  source: string;
  count: number;
  error?: string;
  records: ExportRecord[];
}

export type StreamWriter = (chunk: string) => void;
export type FormatStreamFn = (write: StreamWriter, collections: ExportCollection[]) => Promise<void> | void;

function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return val.toString();
    if (val instanceof Uint8Array) return Array.from(val);
    if (val instanceof Buffer) return val.toString('base64');
    return val;
  }, 2);
}

export function streamJson(write: StreamWriter, collections: ExportCollection[]): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    collections,
  };
  write(`${safeStringify(payload)}\n`);
}

function formatRecordMarkdown(record: ExportRecord): string {
  const title =
    (typeof record.id === 'string' && record.id)
      || (typeof record.source_file === 'string' && record.source_file)
      || (typeof record.sourceFile === 'string' && record.sourceFile)
      || JSON.stringify(record).slice(0, 80);

  return [
    `## ${title}`,
    '',
    '```json',
    safeStringify(record),
    '```',
    '',
  ].join('\n');
}

export function streamMarkdown(write: StreamWriter, collections: ExportCollection[]): void {
  for (const collection of collections) {
    write(`# Collection: ${collection.name}\n\n`);

    if (collection.error) {
      write(`⚠️ ${collection.error}\n\n`);
      continue;
    }

    write(`Count: ${collection.count}\nSource: ${collection.source}\n\n`);

    if (collection.records.length === 0) {
      write('(empty)\n\n');
      continue;
    }

    for (const record of collection.records) {
      write(formatRecordMarkdown(record));
    }
    write(`---\n\n`);
  }
}

export const EXPORT_FORMATS = {
  json: streamJson,
  markdown: streamMarkdown,
} as const;

export type ExportFormat = keyof typeof EXPORT_FORMATS;
