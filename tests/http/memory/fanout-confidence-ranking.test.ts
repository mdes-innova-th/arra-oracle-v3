import { expect, test } from 'bun:test';
import { fuseRankedResults } from '../../../src/routes/memory/fanout.ts';
import type { SearchResult } from '../../../src/server/types.ts';

type FanoutHit = SearchResult & {
  title?: string;
  tags?: string[];
  memorySource?: string;
  createdAt?: string;
  updatedAt?: string;
};

const NOW = new Date('2026-06-17T00:00:00.000Z');
const RRF_K = 60;

function hit(id: string, score: number, extra: Partial<FanoutHit> = {}): FanoutHit {
  return {
    id,
    type: 'memory',
    content: `${id} confidence ranking fixture`,
    source_file: extra.source_file ?? '',
    concepts: extra.concepts ?? [],
    source: 'vector',
    score,
    createdAt: extra.createdAt ?? NOW.toISOString(),
    updatedAt: extra.updatedAt ?? extra.createdAt ?? NOW.toISOString(),
    ...extra,
  };
}

function confidenceReorderFixture(): Record<string, FanoutHit[]> {
  return {
    alpha: [
      hit('stale-vector-win', 1, {
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
      hit('trusted-fresh', 0.91, {
        title: 'Trusted fresh deploy note',
        tags: ['deploy', 'confidence'],
        concepts: ['deploy'],
        memorySource: 'session://codex-2684',
        source_file: 'trusted.md',
      }),
    ],
  };
}

function pureRrfExpected(byCollection: Record<string, SearchResult[]>) {
  const scores = new Map<string, { raw: number; bestScore: number }>();
  for (const results of Object.values(byCollection)) {
    results.forEach((result, index) => {
      const current = scores.get(result.id) ?? { raw: 0, bestScore: result.score ?? 0 };
      current.raw += 1 / (RRF_K + index + 1);
      current.bestScore = Math.max(current.bestScore, result.score ?? 0);
      scores.set(result.id, current);
    });
  }
  const maxRaw = Math.max(...[...scores.values()].map((item) => item.raw));
  return [...scores.entries()]
    .map(([id, item]) => ({
      id,
      fusedScore: round6(item.raw),
      rankingScore: round6(item.raw / maxRaw),
      bestScore: item.bestScore,
    }))
    .sort((a, b) => b.rankingScore - a.rankingScore || b.fusedScore - a.fusedScore || b.bestScore - a.bestScore)
    .map(({ id, fusedScore, rankingScore }) => ({ id, fusedScore, rankingScore }));
}

function round6(value: number): number {
  return +value.toFixed(6);
}

test('confidenceWeight promotes a fresher provenanced hit over pure vector rank', () => {
  const fixture = confidenceReorderFixture();
  const pure = fuseRankedResults(fixture, 2, { confidenceWeight: 0, now: NOW });
  const weighted = fuseRankedResults(fixture, 2, { confidenceWeight: 0.25, now: NOW });

  expect(pure.map((item) => item.id)).toEqual(['stale-vector-win', 'trusted-fresh']);
  expect(weighted.map((item) => item.id)).toEqual(['trusted-fresh', 'stale-vector-win']);
  expect(weighted[0].confidence.score).toBeGreaterThan(weighted[1].confidence.score);
  expect(weighted[0].rankingScore).toBeGreaterThan(weighted[1].rankingScore);
});

test('confidenceWeight zero reproduces exact pure RRF scores and ordering', () => {
  const fixture: Record<string, FanoutHit[]> = {
    alpha: [
      hit('fresh-trusted', 0.86, { tags: ['rank'], memorySource: 'runbook', title: 'Fresh trusted' }),
      hit('stale-vector', 0.99, { createdAt: '2020-01-01T00:00:00.000Z' }),
      hit('shared', 0.75, { tags: ['shared'] }),
    ],
    beta: [
      hit('shared', 0.97, { tags: ['shared'] }),
      hit('beta-only', 0.95),
      hit('stale-vector', 0.6, { createdAt: '2020-01-01T00:00:00.000Z' }),
      hit('fresh-trusted', 0.7, { tags: ['rank'], memorySource: 'runbook', title: 'Fresh trusted' }),
    ],
    gamma: [hit('gamma-only', 0.88)],
  };

  const fused = fuseRankedResults(fixture, 5, { confidenceWeight: 0, now: NOW })
    .map(({ id, fusedScore, rankingScore }) => ({ id, fusedScore, rankingScore }));

  expect(fused).toEqual(pureRrfExpected(fixture));
  expect(fused.map((item) => item.id)).toEqual([
    'shared',
    'fresh-trusted',
    'stale-vector',
    'gamma-only',
    'beta-only',
  ]);
});
