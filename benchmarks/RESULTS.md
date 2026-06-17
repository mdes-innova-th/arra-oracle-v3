# Benchmark Results

## Honest Recall@k headline (#2464)

Run date: 2026-06-17

Harness: `benchmarks/honest-recall.ts` (`runHonestRecallBenchmark`) over the public-safe 48-query recall dataset in `benchmarks/fixtures/recall-dataset.jsonl`. The headline artifact is `benchmarks/out/honest-recall.json` and records mode, model, top_k, corpus, stack, git SHA, metric label, and per-query hit provenance.

Answer accuracy is **not measured**. This is retrieval recall only: a query is a hit when at least one expected document appears in the top 3. The metric name is `Recall@k`; this run's label is `Recall@3`.

| Run | Mode | Model / stack | Corpus | Recall@k label | Value | Hits | Weak cases disclosed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FTS baseline | `fts` | FTS5 only | `public-recall-dataset-v2` | `Recall@3` | 0.6875 | 33/48 | Missed semantic paraphrases, temporal TTL, CORS/private-network, vector preflight, and negative controls. |
| Hybrid headline | `hybrid` | `multi` = bge-m3 + nomic + qwen3 + FTS5 | `public-recall-dataset-v2` | `Recall@3` | 0.833333 | 40/48 | Recovered multi-word and most paraphrase cases; eight weak/negative cases below remain misses. |

### Reproduce

```bash
bun run benchmarks/honest-recall.ts \
  --dataset benchmarks/fixtures/recall-dataset.jsonl \
  --corpus public-recall-dataset-v2 --corpus-size 48 \
  --top-k 3 --mode hybrid --model multi \
  --out benchmarks/out/honest-recall.json
```

The command expects an Arra HTTP API already running with the same public recall corpus indexed. The committed JSON is the headline hybrid run artifact for this sprint.

### Hybrid provenance

```json
{
  "mode": "hybrid",
  "model": "multi",
  "top_k": 3,
  "corpus": { "label": "public-recall-dataset-v2", "size": 48 },
  "metric": "Recall@k",
  "label": "Recall@3",
  "git-sha": "105a6d9a36e64af0cd59d410ab92b29e69f5c283",
  "stack": ["bge-m3", "nomic", "qwen3", "FTS5"]
}
```

### Weak cases disclosed

| Case | Expected | Why it remains weak |
| --- | --- | --- |
| `simple/degraded-fts` | `pub-simple-health-degraded` | Degraded-search phrasing overlaps multiple health states. |
| `cors/private-network` | `pub-cors-private-network` | Browser PNA wording is sparse and acronym-heavy. |
| `memory/ttl-decay` | `pub-memory-ttl` | Temporal expiry language competes with consolidation/valid-time notes. |
| `vector/preflight` | `pub-vector-preflight` | Vector health/preflight terms overlap sidecar and proxy docs. |
| `edge/no-match-*` | none | Negative controls stay in the denominator and correctly disclose no relevant document. |

Weak and negative-control categories stay in the denominator. The hybrid run improves the public recall set, but it still misses acronym-heavy and nuanced operational-health queries, so the headline does not claim broad answer quality.
