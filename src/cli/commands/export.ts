import { writeFile } from "fs/promises";
import { createDatabase, oracleDocuments, type DatabaseConnection } from "../../db/index.ts";
import {
  exportFormatterFor,
  exportText,
  supportedExportFormats,
  type ExportFormatName,
  type ExportRow,
} from "../../vector/export-formats.ts";

export interface DataExportOptions {
  format: ExportFormatName;
  outFile?: string;
}

type OracleDocumentRow = typeof oracleDocuments.$inferSelect;

export interface VaultJsonExport {
  format: "json";
  version: 1;
  exportedAt: string;
  tables: {
    oracleDocuments: OracleDocumentRow[];
  };
}

const VAULT_CSV_COLUMNS = [
  'id', 'type', 'sourceFile', 'concepts', 'createdAt', 'updatedAt', 'indexedAt',
  'supersededBy', 'supersededAt', 'supersededReason', 'origin', 'project', 'createdBy',
];

function printHelp(): void {
  const formats = supportedExportFormats().join("|");
  console.log(`arra-cli export --format ${formats} [--out file]\n`);
  console.log("Exports vault data to stdout, or to --out when provided.");
  console.log("\nFlags:");
  console.log(`  --format ${formats}       output format (default: json)`);
  console.log("  --out <file>        write export to a file instead of stdout");
  console.log("  --help, -h          show this help");
}

function readValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index >= 0) return args[index + 1];
  const prefix = `${flag}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseFormat(value: string): ExportFormatName {
  const formatter = exportFormatterFor(value);
  if (!formatter) throw new Error(`unsupported format: ${value}`);
  return formatter.format;
}

export function parseExportOptions(args: string[]): DataExportOptions {
  const format = parseFormat(readValue(args, "--format") ?? "json");
  const outFile = readValue(args, "--out");
  return outFile ? { format, outFile } : { format };
}

export function buildVaultJsonExport(connection: DatabaseConnection): VaultJsonExport {
  return {
    format: "json",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      oracleDocuments: connection.db.select().from(oracleDocuments).all(),
    },
  };
}

export function buildVaultCsvRows(connection: DatabaseConnection): ExportRow[] {
  return connection.db.select().from(oracleDocuments).all().map((row) => ({ ...row }));
}

async function formatVaultExport(connection: DatabaseConnection, format: ExportFormatName): Promise<string> {
  const formatter = exportFormatterFor(format);
  if (!formatter) throw new Error(`unsupported format: ${format}`);
  if (format === 'json') return exportText(formatter, { value: buildVaultJsonExport(connection), pretty: true });
  return exportText(formatter, { rows: buildVaultCsvRows(connection), columns: VAULT_CSV_COLUMNS });
}

export async function exportCommand(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }

  let connection: DatabaseConnection | undefined;
  try {
    const options = parseExportOptions(args);
    connection = createDatabase();
    const payload = await formatVaultExport(connection, options.format);
    if (options.outFile) await writeFile(options.outFile, payload, "utf8");
    else process.stdout.write(payload);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    connection?.storage.close();
  }
}
