import { mineFolder } from '../../indexer/mine.ts';

export interface MineCliOptions { dir?: string; dbPath?: string; dryRun: boolean; help: boolean }

export function parseMineArgs(args: string[]): MineCliOptions {
  const options: MineCliOptions = { dryRun: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--db-path') {
      const value = args[++i]?.trim();
      if (!value) throw new Error('--db-path requires a path');
      options.dbPath = value;
    } else if (arg?.startsWith('--db-path=')) {
      const value = arg.slice('--db-path='.length).trim();
      if (!value) throw new Error('--db-path requires a path');
      options.dbPath = value;
    } else if (arg?.startsWith('-')) {
      throw new Error(`unknown mine option: ${arg}`);
    } else if (!options.dir) options.dir = arg;
    else throw new Error(`unexpected mine argument: ${arg}`);
  }
  return options;
}

export function mineHelp(): string {
  return [
    'Usage: arra mine <dir> [--db-path <file>] [--dry-run]',
    'Ingest a folder into Oracle memory with deterministic IDs and safe re-runs.',
    '',
    'Defaults: indexes .md, .mdx, and .txt files; skips unchanged content.',
  ].join('\n');
}

export async function mineCommand(args: string[]): Promise<number> {
  let options: MineCliOptions;
  try { options = parseMineArgs(args); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); console.error(mineHelp()); return 1; }
  if (options.help) { console.log(mineHelp()); return 0; }
  if (!options.dir) { console.error('mine requires a directory'); console.error(mineHelp()); return 1; }
  try {
    const result = await mineFolder(options as { dir: string; dbPath?: string; dryRun?: boolean });
    console.log(`Mined ${result.stored} document${result.stored === 1 ? '' : 's'} from ${result.scanned} file${result.scanned === 1 ? '' : 's'} (${result.skipped} skipped) into project "${result.project}".`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
