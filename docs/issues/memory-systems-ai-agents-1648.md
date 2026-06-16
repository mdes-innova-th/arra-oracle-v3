# #1648 Memory Systems for AI Agents

Status: research/proposal update for issue
[#1648](https://github.com/Soul-Brews-Studio/arra-oracle-v3/issues/1648),
2026-06-17.

This promotes the issue research into a durable architecture note. It does not
add a new memory backend. It defines which memory patterns ARRA should adopt,
which current pieces already match those patterns, and which implementation
issues should follow.

## Research verdict

ARRA should stay a **provenance-first hybrid memory system**:

1. **Files are durable truth.** Keep reviewable knowledge in `ψ/memory/`,
   `ψ/learn/`, docs, and rule files so humans can diff, repair, and rebuild.
2. **SQLite is the ledger.** Use Drizzle metadata for tenant scope, lifecycle,
   provenance, supersede state, access logs, and future confidence inputs.
3. **FTS + vectors are working recall.** Retrieve ranked chunks, rerank when
   available, then package answers with source paths and citations.
4. **MCP is a facade.** Expose ARRA memory/search through MCP tools; do not copy
   the official MCP memory server as the storage engine.
5. **Capture is review-gated.** Background extraction should create candidates;
   durable trusted memory needs validation or policy approval.

## Architecture patterns

| Pattern | Evidence | ARRA stance |
| --- | --- | --- |
| Context-resident summaries | Useful for active-session compression, but volatile and hard to audit. | Use only as a cache or prompt budget layer; never canonical memory. |
| Retrieval store + context injection | 2026 surveys describe retrieval-augmented stores as one core agent-memory family and cover production concerns like write filtering, contradiction handling, latency, and privacy. | Keep this as the default path: `oracle_search` over FTS/vector/rerank with source files. |
| Knowledge graph memory | The official MCP memory server is graph-shaped, but its reference search is substring matching over entity names/types/observations. | Add graph links only as derived metadata over ARRA docs; do not downgrade recall to graph-only search. |
| Background extraction | LangMem separates hot-path writes from background extraction/consolidation and recommends persistent stores/namespaces for production. | Implement background extraction as `memory_propose`, not automatic trusted writes. |
| Hierarchical virtual context | MemGPT uses OS-style tiers and paging between limited context and external memory. | Adopt the design vocabulary for prompt budgeting; postpone autonomous paging until retrieval quality is measured. |
| Learned/policy memory control | Current surveys call out policy-learned management and benchmark gaps as emerging frontiers. | Track, but do not depend on learned memory policy before ARRA has a deterministic eval harness. |

## Current ARRA comparison

### Strengths already present

- **Hybrid recall:** `src/tools/search/handler.ts` combines FTS5, vector search,
  optional reranking, warnings, and search logging.
- **Ledger schema:** `src/db/schema.ts` has `oracle_documents`, `oracle_fts`,
  `oracle_memories`, `search_log`, `document_access`, tenant indexes, and
  supersede fields.
- **Write-time learning:** `src/tools/learn.ts` writes markdown under
  `ψ/memory/learnings/`, inserts `oracle_documents`, updates FTS5, and queues
  vector indexing when available.
- **Indexer coverage:** `src/indexer/index.ts` scans resonance, learnings,
  retrospectives, distillations, `ψ/learn/`, and optional security corpus.
- **Freshness/lifecycle hooks:** supersede metadata, index jobs, and document
  access logs provide the raw signals for trust and decay.
- **Tenant isolation:** recent route slices and search/vector filtering use
  `tenant_id` as the boundary for HTTP and MCP surfaces.

### Gaps to close before adding graph/tiered memory

- No first-class **memory proposal** queue for untrusted agent-extracted notes.
- No query-time **confidence object** returned with search results.
- No validation status or source hash on `oracle_documents`; source paths can be
  checked, but evidence integrity is not recorded as metadata.
- No eval harness that measures stale recall, repeated mistakes, tenant leaks, or
  citation/path invalidation across sessions.
- `oracle_memories` is a lightweight challenge table; it should not be confused
  with the canonical knowledge corpus in `oracle_documents`.

## Proposed ARRA memory contract

### 1. Read contract: confidence at query time

Add a small confidence service used by search/read routes before changing rank:

```ts
type MemoryConfidence = {
  score: number;              // 0..1, computed at read time
  freshness: 'fresh' | 'aging' | 'stale';
  validation: 'verified' | 'unverified' | 'missing-source' | 'superseded';
  signals: {
    sourceExists: boolean;
    sourceHashMatches?: boolean;
    superseded: boolean;
    accessCount: number;
    indexedAt: number;
    updatedAt: number;
    tenantScoped: boolean;
  };
};
```

Initial behavior should return metadata and warnings only. Ranking changes should
wait until search logs show lower false positives.

### 2. Write contract: propose, validate, promote

Use explicit lifecycle states instead of letting agents silently rewrite durable
knowledge:

```ts
memory_propose(candidate, provenance)  // background extraction, untrusted
memory_validate(candidateId)           // path/hash/excerpt checks
memory_promote(candidateId)            // durable oracle_documents + FTS/vector
memory_archive(id, reason)             // supersede or retire without delete
```

Hot-path MCP writes can keep `oracle_learn`, but background extractors should
land in the proposal queue first.

### 3. Retrieval contract: cite before answer

Search responses should keep returning source path, type, concepts, mode, and
warnings. Add confidence metadata and require agents that answer from memory to
show citations for repo facts. A future UI can surface low-confidence warnings,
superseded pointers, and missing-source repairs.

### 4. Optional graph layer: derived, not primary

Build graph edges from existing facts:

- `concepts` tags,
- `superseded_by` links,
- shared source path/project,
- trace/handoff/document-access co-occurrence.

Use graph traversal to widen candidate sets, then rank with FTS/vector/reranker.
Do not maintain an independent graph truth store unless relation-miss metrics
show clear value.

## Implementation sequence

1. **Document and naming cleanup:** keep this file as the issue-level design note;
   use “durable knowledge memory” for `oracle_documents` and “personal memory”
   for `oracle_memories`.
2. **Confidence metadata:** add source hash + validation fields, compute
   confidence at query time, and return warnings without rank changes.
3. **Proposal queue:** add candidate extraction tables/routes/tools, then promote
   into `oracle_documents` through review-gated CLI/UI/MCP flows.
4. **Eval harness:** replay search logs and curated multi-session coding traces;
   measure stale facts, duplicate fixes, source-missing rate, and tenant leaks.
5. **Interop:** if LangMem compatibility is needed, build an adapter over
   `oracle_search`, `oracle_learn`, `oracle_read/list`, tenant, and supersede
   metadata instead of adopting its storage model wholesale.
6. **Graph/tiered memory:** add only after the eval harness proves relation
   misses or prompt-budget failures that hybrid retrieval cannot solve.

## Source notes

- MCP reference servers README: memory is a knowledge-graph reference server, not
  a production-ready storage recommendation; the memory server can be run with
  `npx -y @modelcontextprotocol/server-memory`.
  <https://github.com/modelcontextprotocol/servers>
- MCP memory source: `searchNodes` is explicitly a basic substring search over
  graph fields and relations.
  <https://github.com/modelcontextprotocol/servers/blob/main/src/memory/index.ts>
- LangMem background guide: hot-path vs background extraction,
  `create_memory_store_manager`, persistent production stores, and namespaces.
  <https://langchain-ai.github.io/langmem/background_quickstart/>
- LangChain memory concepts: hot-path/background tradeoffs and namespace-based
  long-term memory stores.
  <https://docs.langchain.com/oss/python/concepts/memory>
- Agent memory survey: forms/functions/dynamics taxonomy and trustworthiness
  frontiers.
  <https://arxiv.org/abs/2512.13564>
- Autonomous LLM agent memory survey: write-manage-read loop and five mechanism
  families.
  <https://arxiv.org/html/2603.07670v1>
- MemGPT: hierarchical virtual context and OS-style memory tiers.
  <https://arxiv.org/abs/2310.08560>
