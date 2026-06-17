import type { SearchResult } from '../types';

export type ConfidenceLabel = 'high' | 'medium' | 'low' | string;

export type ProvenanceSearchResult = SearchResult & {
  confidence?: {
    score?: number;
    label?: ConfidenceLabel;
    freshness?: number;
    usageCount?: number;
    lastAccessedAgeDays?: number;
    components?: { match?: number; freshness?: number; provenance?: number; usage?: number };
    warnings?: string[];
    reasons?: string[];
  };
  memorySource?: string;
  memory_source?: string;
  usageCount?: number;
  lastAccessedAt?: string;
  rankingScore?: number;
  fusedScore?: number;
  confidenceWeight?: number;
  matches?: Array<{ collection?: string; rank?: number; score?: number }>;
  superseded_by?: string | null;
  superseded_at?: string | null;
  superseded_reason?: string | null;
  valid_time?: string | null;
  valid_until?: string | null;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export function titleFor(result: SearchResult): string {
  return result.title || result.source_file || result.id;
}

export function previewFor(result: SearchResult): string {
  const text = result.content || 'No preview returned.';
  return text.length > 320 ? `${text.slice(0, 320)}…` : text;
}

export function scoreLabel(score?: number): string | null {
  if (typeof score !== 'number') return null;
  return `${Math.round(score * 100)}%`;
}

export function percentLabel(value?: number): string | null {
  const percent = percentValue(value);
  return percent === null ? null : `${percent}%`;
}

export function percentValue(value?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function confidenceLabel(result: ProvenanceSearchResult): ConfidenceLabel {
  const explicit = result.confidence?.label;
  if (explicit) return explicit;
  const score = confidenceScore(result);
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

export function confidenceScore(result: ProvenanceSearchResult): number {
  const score = result.confidence?.score ?? result.rankingScore ?? result.score ?? 0;
  return Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
}

export function confidenceTone(result: ProvenanceSearchResult): 'success' | 'warning' | 'danger' | 'accent' {
  const label = confidenceLabel(result).toLowerCase();
  if (label === 'high') return 'success';
  if (label === 'medium') return 'warning';
  if (label === 'low') return 'danger';
  return 'accent';
}

export function sourceLabel(result: ProvenanceSearchResult): string {
  return result.memorySource || result.memory_source || result.source_file || result.source || result.model || 'unknown source';
}

export function sourceDetails(result: ProvenanceSearchResult): string[] {
  return [
    result.source ? `engine ${result.source}` : '',
    result.model ? `model ${result.model}` : '',
    result.matches?.length ? `${result.matches.length} collection${result.matches.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
}

export function heatScore(result: ProvenanceSearchResult): number {
  const component = result.confidence?.components?.usage;
  if (typeof component === 'number' && Number.isFinite(component)) return Math.max(0, Math.min(1, component));
  const usageCount = result.confidence?.usageCount ?? result.usageCount ?? 0;
  if (!usageCount) return 0;
  return Math.max(0, Math.min(1, Math.log1p(usageCount) / Math.log1p(20)));
}

export function heatDescription(result: ProvenanceSearchResult): string {
  const usageCount = result.confidence?.usageCount ?? result.usageCount ?? 0;
  if (usageCount > 0) return `${usageCount} retrieval${usageCount === 1 ? '' : 's'} reinforced this memory.`;
  return 'No retrieval heat recorded yet.';
}

export function provenanceDescription(result: ProvenanceSearchResult): string {
  const components = result.confidence?.components;
  const provenance = percentLabel(components?.provenance);
  const freshness = percentLabel(result.confidence?.freshness ?? components?.freshness);
  const match = percentLabel(components?.match);
  return [provenance ? `provenance ${provenance}` : '', freshness ? `freshness ${freshness}` : '', match ? `match ${match}` : ''].filter(Boolean).join(' · ');
}
