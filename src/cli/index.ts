#!/usr/bin/env bun

import { exportCommand } from './commands/export.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: bun run src/cli/index.ts export [--format json|markdown] [--out <file>]');
    process.exit(1);
  }

  if (args[0] !== 'export') {
    console.error(`unknown command: ${args[0]}`);
    console.error('usage: bun run src/cli/index.ts export [--format json|markdown] [--out <file>]');
    process.exit(1);
  }

  process.exit(await exportCommand(args));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
