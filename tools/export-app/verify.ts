import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;
type Writer = (message: string) => void;

export interface VerifyResult {
  outputDir: string;
  collectionCount: number;
  documentCount: number;
  relationshipFileCount: number;
  checkedFiles: number;
}

interface VerifyState {
  checkedFiles: number;
}

function readValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index >= 0) {
    const value = args[index + 1];
    if (!value || value.startsWith('-')) throw new Error(`missing value for ${flag}`);
    return value;
  }
  const prefix = `${flag}=`;
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value === '') throw new Error(`missing value for ${flag}`);
  return value;
}

function parseArgs(args: string[]): string {
  const outputDir = readValue(args, '--output') ?? readValue(args, '-o');
  if (!outputDir) throw new Error('missing required --output <dir>');
  return outputDir;
}

async function readJson<T>(file: string, state: VerifyState): Promise<T> {
  await requireFile(file, state);
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function requireFile(file: string, state: VerifyState): Promise<void> {
  await access(file);
  state.checkedFiles += 1;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

function ext(format: string): string {
  return format === 'markdown' ? 'md' : format;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'row';
}

async function verifyCollections(
  outputDir: string,
  collections: JsonRecord,
  formats: string[],
  state: VerifyState,
): Promise<void> {
  for (const name of Object.keys(collections)) {
    for (const format of formats) {
      await requireFile(path.join(outputDir, 'collections', `${safeName(name)}.${ext(format)}`), state);
    }
  }
}

async function verifyRelationships(outputDir: string, formats: string[], state: VerifyState): Promise<number> {
  let count = 0;
  for (const format of formats) {
    await requireFile(path.join(outputDir, `relationships.${ext(format)}`), state);
    count += 1;
  }
  return count;
}

async function verifyDocuments(outputDir: string, state: VerifyState): Promise<number> {
  const indexPath = path.join(outputDir, 'documents', 'index.json');
  const index = record(await readJson<JsonRecord>(indexPath, state), 'documents/index.json');
  const docs = Array.isArray(index.documents) ? index.documents : [];
  await requireFile(path.join(outputDir, 'documents', 'documents.csv'), state);
  for (const item of docs) {
    const doc = record(item, 'document index entry');
    for (const key of ['markdown', 'json']) {
      if (typeof doc[key] !== 'string') throw new Error(`document index entry missing ${key}`);
      await requireFile(path.join(outputDir, doc[key]), state);
    }
  }
  return docs.length;
}

export async function verifyExportBundle(outputDirInput: string): Promise<VerifyResult> {
  const outputDir = path.resolve(outputDirInput);
  const state = { checkedFiles: 0 };
  const manifest = record(await readJson<JsonRecord>(path.join(outputDir, 'manifest.json'), state), 'manifest');
  const all = record(await readJson<JsonRecord>(path.join(outputDir, 'all-collections.json'), state), 'all-collections');
  const collections = record(all.collections, 'all-collections.collections');
  const formats = stringArray(manifest.formats, 'manifest.formats');
  const collectionNames = Object.keys(collections);

  if (typeof manifest.collectionCount === 'number' && manifest.collectionCount !== collectionNames.length) {
    throw new Error(`manifest collectionCount ${manifest.collectionCount} does not match ${collectionNames.length}`);
  }

  await verifyCollections(outputDir, collections, formats, state);
  const relationshipFileCount = await verifyRelationships(outputDir, formats, state);
  const documentCount = await verifyDocuments(outputDir, state);
  return {
    outputDir,
    collectionCount: collectionNames.length,
    documentCount,
    relationshipFileCount,
    checkedFiles: state.checkedFiles,
  };
}

function printHelp(write: Writer): void {
  write([
    'bun run tools/export-app/verify.ts --output ./backup/export-app',
    '',
    'Verifies an export app backup bundle has its manifest, collection files,',
    'relationship files, and document markdown/json/csv artifacts.',
    '',
    'Flags:',
    '  --output, -o <dir>   export bundle directory',
    '  --help, -h           show this help',
    '',
  ].join('\n'));
}

export async function runVerifyApp(
  args: string[],
  stdout: Writer = process.stdout.write.bind(process.stdout),
  stderr: Writer = process.stderr.write.bind(process.stderr),
): Promise<number> {
  try {
    if (args.includes('--help') || args.includes('-h')) {
      printHelp(stdout);
      return 0;
    }
    const result = await verifyExportBundle(parseArgs(args));
    stdout(`${JSON.stringify({ success: true, ...result }, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await runVerifyApp(Bun.argv.slice(2)));
}
