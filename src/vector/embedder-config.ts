/** Env/config resolver for the optional embedder capability. */
import { createEmbeddingProvider } from './embeddings.ts';
import type { EmbedderConfig, EmbeddingProvider, EmbeddingProviderType } from './types.ts';

const VALID = new Set<EmbeddingProviderType>([
  'none',
  'local',
  'remote',
  'chromadb-internal',
  'ollama',
  'openai',
  'gemini',
  'cloudflare-ai',
]);

export function resolveEmbeddingProviderType(
  configured?: EmbeddingProviderType,
): EmbeddingProviderType {
  return resolveEmbeddingProviderSelection(configured).provider;
}

export type EmbeddingProviderSelection = {
  provider: EmbeddingProviderType;
  source: 'configured' | 'legacy-env' | 'env' | 'auto-default';
  explicit: boolean;
};

export type EmbedderRuntimeStatus = {
  status: 'unknown' | 'connected' | 'degraded';
  provider: EmbeddingProviderType;
  source: EmbeddingProviderSelection['source'];
  explicit: boolean;
  checkedAt?: string;
  reason?: string;
};

type ProbePreset = { provider?: string; model?: string; endpoint?: string; embedder?: EmbedderConfig };
type ProbeOptions = { timeoutMs?: number; text?: string };

let runtimeStatus: EmbedderRuntimeStatus | null = null;

export function resolveEmbeddingProviderSelection(
  configured?: EmbeddingProviderType,
): EmbeddingProviderSelection {
  if (configured) return selection(normalizeProvider(configured), 'configured', true);

  const legacy = process.env.ORACLE_EMBEDDING_PROVIDER as EmbeddingProviderType | undefined;
  if (legacy?.trim()) return selection(normalizeProvider(legacy), 'legacy-env', true);

  const raw = firstFilled(process.env.ORACLE_EMBEDDER, process.env.ORACLE_EMBEDDER_BACKEND, process.env.EMBEDDER_TYPE);
  if (raw) return selection(normalizeProvider(raw), 'env', true);

  return selection('ollama', 'auto-default', false);
}

export function resolveEmbeddingModel(configured?: string): string | undefined {
  return configured || process.env.ORACLE_EMBEDDING_MODEL;
}

export function resolveEmbeddingFallbackChain(configured?: EmbeddingProviderType[]): EmbeddingProviderType[] {
  if (configured?.length) return configured.map(normalizeProvider);
  const raw = process.env.ORACLE_EMBEDDER_CHAIN || process.env.ORACLE_EMBEDDING_FALLBACK_CHAIN;
  if (!raw) return [];
  return raw.split(',').map((item) => normalizeProvider(item)).filter((item) => item !== 'none');
}

export function getEmbedderRuntimeStatus(): EmbedderRuntimeStatus {
  if (runtimeStatus) return runtimeStatus;
  const selected = resolveEmbeddingProviderSelection();
  return { status: 'unknown', ...selected };
}

export function setEmbedderRuntimeStatus(status: EmbedderRuntimeStatus): EmbedderRuntimeStatus {
  runtimeStatus = status;
  return status;
}

export function clearEmbedderRuntimeStatusForTests(): void {
  runtimeStatus = null;
}

export function formatEmbedderDegradedWarning(provider: string, reason: string): string {
  return `[Oracle] embedder ${provider} unreachable (${reason}) → degraded to FTS5-only`;
}

export async function probeConfiguredEmbedder(
  preset?: ProbePreset,
  options: ProbeOptions = {},
): Promise<EmbedderRuntimeStatus> {
  const embedder = preset?.embedder;
  const selection = resolveEmbeddingProviderSelection(
    (preset?.provider as EmbeddingProviderType | undefined) ?? embedder?.backend,
  );
  try {
    if (selection.provider === 'chromadb-internal') {
      return setEmbedderRuntimeStatus({ status: 'connected', ...selection, checkedAt: new Date().toISOString() });
    }
    const provider = createEmbeddingProvider(selection.provider, resolveEmbeddingModel(embedder?.model ?? preset?.model), {
      url: embedder?.url ?? preset?.endpoint,
      dimensions: embedder?.dimensions,
      fallbackChain: resolveEmbeddingFallbackChain(embedder?.fallbackChain ?? (embedder?.fallback ? [embedder.fallback] : undefined)),
    });
    return await probeEmbeddingProvider(provider, selection, options);
  } catch (error) {
    return setEmbedderRuntimeStatus(degraded(selection, reasonOf(error)));
  }
}

export async function probeEmbeddingProvider(
  provider: EmbeddingProvider,
  selection: EmbeddingProviderSelection,
  options: ProbeOptions = {},
): Promise<EmbedderRuntimeStatus> {
  const timeoutMs = positiveInt(process.env.ORACLE_EMBEDDER_PROBE_TIMEOUT_MS, options.timeoutMs ?? 2_000);
  try {
    const pending = provider.embed([options.text ?? 'oracle embedder boot probe'], 'query');
    pending.catch(() => undefined);
    const vectors = await timeout(pending, timeoutMs);
    if (!vectors[0]?.length) throw new Error('probe returned no embedding');
    return setEmbedderRuntimeStatus({ status: 'connected', ...selection, checkedAt: new Date().toISOString() });
  } catch (error) {
    return setEmbedderRuntimeStatus(degraded(selection, reasonOf(error)));
  }
}

function normalizeProvider(raw?: string): EmbeddingProviderType {
  const value = (raw || 'none').trim().toLowerCase();
  if (value === 'disabled' || value === 'off' || value === 'zero') return 'none';
  if (value === 'http' || value === 'external') return 'remote';
  if (value === 'ollama-local') return 'local';
  if (VALID.has(value as EmbeddingProviderType)) return value as EmbeddingProviderType;

  console.warn(`[Embedder] Unknown provider '${raw}', falling back to none/FTS5.`);
  return 'none';
}

function firstFilled(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

function selection(
  provider: EmbeddingProviderType,
  source: EmbeddingProviderSelection['source'],
  explicit: boolean,
): EmbeddingProviderSelection {
  return { provider, source, explicit };
}

function degraded(selection: EmbeddingProviderSelection, reason: string): EmbedderRuntimeStatus {
  return { status: 'degraded', ...selection, reason, checkedAt: new Date().toISOString() };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim() || 'unknown';
}
