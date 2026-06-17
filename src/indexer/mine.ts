import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { createDatabase } from '../db/index.ts';
import { detectProject } from '../server/project-detect.ts';
import type { OracleDocument } from '../types.ts';
import { deriveConceptsFromPath, extractConcepts, mergeConceptsWithTags } from './concepts.ts';
import { storeDocuments } from './storage.ts';

const DEFAULT_EXTENSIONS = new Set(['.md', '.mdx', '.txt']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo']);
const MAX_MINE_FILE_BYTES = 2 * 1024 * 1024;
const MINE_CHUNK_CHARS = 12_000;
const BINARY_SAMPLE_BYTES = 4096;

export interface MineOptions { dir: string; dbPath?: string; dryRun?: boolean }
export interface MineResult { scanned: number; stored: number; skipped: number; project: string; root: string }
export interface MineWatchOptions extends MineOptions { signal?: AbortSignal; debounceMs?: number }

export function stableMineDocId(root: string, filePath: string): string {
  const rel = relativeSource(root, filePath);
  return `mine_${createHash('sha256').update(rel).digest('hex').slice(0, 24)}`;
}

export function contentVersion(content: string): number {
  return parseInt(createHash('sha256').update(content).digest('hex').slice(0, 12), 16);
}

export function chunkMineContent(content: string, maxChars = MINE_CHUNK_CHARS): string[] {
  const text = content.trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    const chunk = current.trim();
    if (chunk) chunks.push(chunk);
    current = '';
  };
  for (const raw of text.split(/\n{2,}/g)) {
    const part = raw.trim();
    if (!part) continue;
    if (part.length > maxChars) {
      flush();
      for (let i = 0; i < part.length; i += maxChars) {
        const chunk = part.slice(i, i + maxChars).trim();
        if (chunk) chunks.push(chunk);
      }
    } else if (current && current.length + part.length + 2 > maxChars) {
      flush();
      current = part;
    } else {
      current = current ? `${current}\n\n${part}` : part;
    }
  }
  flush();
  return chunks;
}

export function collectMineFiles(root: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.notes') continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && DEFAULT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  }
  walk(root);
  return files.sort();
}

export async function mineFolder(options: MineOptions): Promise<MineResult> {
  const root = path.resolve(options.dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`mine target must be a directory: ${options.dir}`);
  }
  const files = collectMineFiles(root);
  const project = detectProject(root) || path.basename(root).toLowerCase();
  const { sqlite, db, storage } = createDatabase(options.dbPath);
  try {
    const docs: OracleDocument[] = [];
    let skipped = 0;
    for (const file of files) {
      const source = relativeSource(root, file);
      const existing = existingMineRows(sqlite, source);
      const content = readMineContent(file);
      if (!content) {
        skipped++;
        if (!options.dryRun) deleteStaleMineRows(sqlite, existing, new Set());
        continue;
      }
      const chunks = chunkMineContent(content);
      const ids = chunks.map((_, index) => mineDocId(root, file, index, chunks.length));
      if (!options.dryRun) deleteStaleMineRows(sqlite, existing, new Set(ids));
      const existingVersions = new Map(existing.map((row) => [row.id, row.updatedAt]));
      let changed = 0;
      chunks.forEach((chunk, index) => {
        const id = ids[index];
        const updatedAt = contentVersion(chunk);
        if (existingVersions.get(id) === updatedAt) return;
        changed++;
        docs.push(toMineDocument(root, file, chunk, id, updatedAt, project, index, chunks.length));
      });
      if (changed === 0) skipped++;
    }
    if (!options.dryRun && docs.length > 0) {
      await storeDocuments(sqlite, db, null, project, docs, { createdBy: 'mine' });
    }
    return { scanned: files.length, stored: options.dryRun ? docs.length : docs.length, skipped, project, root };
  } finally {
    storage.close();
  }
}

interface ExistingMineRow { id: string; updatedAt: number }

export async function watchMineFolder(
  options: MineWatchOptions,
  onResult: (result: MineResult) => void = () => {},
): Promise<void> {
  const root = path.resolve(options.dir);
  const signal = options.signal;
  const debounceMs = options.debounceMs ?? 300;
  const watchers: fs.FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = Promise.resolve();

  const run = () => {
    running = running.then(async () => onResult(await mineFolder(options)));
    return running;
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void run(); }, debounceMs);
  };
  const close = () => {
    if (timer) clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };

  for (const dir of collectMineDirs(root)) watchers.push(fs.watch(dir, schedule));
  await run();
  if (signal?.aborted) return close();
  await new Promise<void>((resolve) => {
    signal?.addEventListener('abort', () => { close(); resolve(); }, { once: true });
  });
  await running;
}

function collectMineDirs(root: string): string[] {
  const dirs = [root];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    dirs.push(...collectMineDirs(path.join(root, entry.name)));
  }
  return dirs;
}

function readMineContent(file: string): string | null {
  const stat = fs.statSync(file);
  if (stat.size === 0 || stat.size > MAX_MINE_FILE_BYTES) return null;
  const buffer = fs.readFileSync(file);
  if (isLikelyBinary(buffer)) return null;
  const content = buffer.toString('utf8').trim();
  return content || null;
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, BINARY_SAMPLE_BYTES));
  if (sample.length === 0) return false;
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 13 && byte < 32)) control++;
  }
  return control / sample.length > 0.3;
}

function existingMineRows(sqlite: ReturnType<typeof createDatabase>['sqlite'], source: string): ExistingMineRow[] {
  return sqlite.prepare(`
    SELECT id, updated_at AS updatedAt
    FROM oracle_documents
    WHERE source_file = ? AND created_by = 'mine'
  `).all(source) as ExistingMineRow[];
}

function deleteStaleMineRows(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  rows: ExistingMineRow[],
  keep: Set<string>,
): void {
  const stale = rows.filter((row) => !keep.has(row.id));
  if (stale.length === 0) return;
  const deleteDoc = sqlite.prepare(`DELETE FROM oracle_documents WHERE id = ? AND created_by = 'mine'`);
  const deleteFts = sqlite.prepare(`DELETE FROM oracle_fts WHERE id = ?`);
  sqlite.exec('BEGIN');
  try {
    for (const row of stale) {
      deleteDoc.run(row.id);
      deleteFts.run(row.id);
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

function toMineDocument(
  root: string,
  file: string,
  content: string,
  id: string,
  version: number,
  project: string,
  chunkIndex: number,
  chunkTotal: number,
): OracleDocument {
  const source = relativeSource(root, file);
  const title = path.basename(file, path.extname(file));
  const chunkTag = chunkTotal > 1 ? [`chunk-${chunkIndex + 1}`] : [];
  const concepts = mergeConceptsWithTags(
    extractConcepts(title, content),
    [project, ...deriveConceptsFromPath(source), ...chunkTag],
  );
  return {
    id, type: 'learning', source_file: source, content,
    concepts, created_at: fs.statSync(file).birthtimeMs || version,
    updated_at: version, project,
  };
}

function mineDocId(root: string, filePath: string, chunkIndex: number, chunkTotal: number): string {
  const base = stableMineDocId(root, filePath);
  return chunkTotal === 1 ? base : `${base}_chunk_${String(chunkIndex + 1).padStart(4, '0')}`;
}

function relativeSource(root: string, filePath: string): string {
  return `mine/${path.basename(root)}/${path.relative(root, filePath).split(path.sep).join('/')}`;
}
