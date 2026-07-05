export function isMissingTableError(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error).toLowerCase().includes('no such table:');
}
