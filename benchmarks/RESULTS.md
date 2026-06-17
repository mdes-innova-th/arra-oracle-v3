# Benchmark Results

## Honest retrieval methodology (#2472)

Run date: 2026-06-17

Harness: `benchmarks/honest-recall.ts` over the public-safe 48-query dataset in
`benchmarks/fixtures/recall-dataset.jsonl`. Queries with non-empty
`expectedIds` are answerable and score **Recall@k**. Queries with empty
`expectedIds` are unanswerable controls and leave the Recall@k denominator; they
score **Reject-Recall** and **Reject-Precision** instead, matching the
PhotoBench/trec_eval split between retrieval recall and correct rejection.

Answer accuracy remains **not measured**: no answer generator or judge runs.

| Track | Denominator | Success | Reported fields |
| --- | --- | --- | --- |
| Recall@k | answerable queries only | at least one expected doc in top-k | `hits / total_queries` |
| Reject-Recall | unanswerable queries only | retriever returns no docs | `correct_rejections / total_unanswerable` |
| Reject-Precision | all no-result responses | no-result response belongs to an unanswerable query | `correct_rejections / total_rejections` |

## Current public run

| Run | Mode | Corpus | Answerable Recall@3 | Reject metrics | Notes |
| --- | --- | --- | --- | --- | --- |
| Hybrid headline | `hybrid` multi-model + FTS5 | `public-recall-dataset-v2` | 40/44 = 0.909091 | reported separately in JSON | No-match controls are not counted as recall misses. |
| FTS baseline | `fts` | `public-recall-dataset-v2` | baseline only | reported separately in JSON | Used to expose lexical weak spots, not answer quality. |

### Reproduce

```bash
bun run benchmarks/honest-recall.ts \
  --dataset benchmarks/fixtures/recall-dataset.jsonl \
  --corpus public-recall-dataset-v2 --corpus-size 48 \
  --top-k 3 --mode hybrid --model multi \
  --out benchmarks/out/honest-recall.json
```

The command expects an Arra HTTP API already running with the same public recall
corpus indexed. The report includes per-case `metric_family` so answerable and
unanswerable controls can be audited independently.
