# Benchmark Results

## Honest Recall@k headline (#2464)

Run date: 2026-06-17

Harness: `benchmarks/honest-recall.ts` (`runHonestRecallBenchmark`) against the temp backend in `benchmarks/hybrid-temp-backend.ts`. The runner starts an in-memory Bun `/api/search` service, seeds a 12-document public corpus into SQLite FTS5 plus memory vectors, embeds those same 12 docs through local Ollama (`bge-m3`, `nomic-embed-text`, `qwen3-embedding`), and writes `benchmarks/out/honest-recall.json`.

This does **not** touch the live vault/index. Answer accuracy is **not measured**. The metric is retrieval `Recall@k`; this headline uses label `Recall@3`.

| Run | Backend | Model / stack | Corpus | Recall@k label | Value | Hits | Weak cases disclosed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FTS baseline | temp SQLite FTS5 | FTS5 only | `temp-ollama-12-docs-v1` | `Recall@3` | 0.9 | 9/10 | Missed `weak/semantic-vector`; no vector evidence used. |
| Hybrid headline | temp FTS5 + memory vectors | `multi` = bge-m3 + nomic + qwen3 + FTS5 | `temp-ollama-12-docs-v1` | `Recall@3` | 1 | 10/10 | Recovered all bounded seed queries, including the semantic-vector weak case. |

### Reproduce

```bash
bun run benchmarks/hybrid-temp-backend.ts \
  --out benchmarks/out/honest-recall.json
```

The command requires local Ollama embedding models `bge-m3`, `nomic-embed-text`, and `qwen3-embedding`. It seeds only the temp 12-doc corpus and avoids live-vault reindexing.

### Hybrid provenance

```json
{
  "mode": "hybrid",
  "model": "multi",
  "top_k": 3,
  "corpus": { "label": "temp-ollama-12-docs-v1", "size": 12 },
  "metric": "Recall@k",
  "label": "Recall@3",
  "backend": "temp-bun-sqlite-fts5-memory-vectors",
  "embedding_provider": "ollama",
  "ollama_models": ["bge-m3", "nomic-embed-text", "qwen3-embedding"],
  "stack": ["bge-m3", "nomic", "qwen3", "FTS5"]
}
```

### Weak cases disclosed

| Case | Expected | FTS result | Hybrid result | Note |
| --- | --- | --- | --- | --- |
| `weak/semantic-vector` | `doc-vector` | miss | hit | Vector embedding similarity recovers the paraphrase "nearest neighbor meaning search". |
| `weak/wcag` | `doc-a11y` | hit | hit | Acronym query is covered in this seed but remains too narrow for broad answer-quality claims. |

Weak categories stay in the denominator. The headline only claims Recall@3 for this bounded, temp-seeded 12-doc retrieval corpus; it does not claim live-vault health or answer accuracy.
