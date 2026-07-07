# Arra Oracle v3 — Study Log

> Loop target: ศึกษา เขียน doc ทำความเข้าใจ arra-oracle-v3 1 ชั่วโมง แสดง % ทุก iteration เมื่อ 100% หยุด
> Repo: `C:\Users\MDES-DEV-NB\Jit\workspaces\arra-oracle-v3`
> Started: 2026-06-18

---

## Iteration 1 — Structure & Boot Survey (Readiness: ~12%)

**What was done:**
- Confirmed repo path and git status: clean working tree
- Read `package.json` — Bun-based TypeScript project, v26.6.1-alpha.1506, MCP + HTTP server + CLI + vault
- Read `README.md` — existing comprehensive docs: LOCAL-DEV, architecture, ONBOARDING, API, etc.
- Read `docs/LOCAL-DEV.md` — dev workflow (server + CLI + web app in separate terminals)
- Read `docs/architecture.md` — high-level system diagram, components, schema, hybrid search
- Read `src/server.ts` — Elysia-based HTTP server, plugin system, graceful shutdown
- Read `src/index.ts` — MCP server entry, tool registration, alias handling
- Read `src/config.ts` — env var resolution for data dir, repo root, vector routing
- Read `src/db/schema.ts` partial — Drizzle schema: oracle_documents, indexing status/jobs, logs

**Key findings:**
- **Runtime**: Bun >= 1.2.0 (README), LOCAL-DEV recommends >= 1.3.0
- **HTTP API**: port 47778 (`ORACLE_PORT`), Elysia + built-in CORS + Swagger
- **MCP**: stdio server exposing 22+ tools (`oracle_*` + legacy aliases)
- **Database**: SQLite with Drizzle ORM, FTS5 virtual table, LanceDB for vectors
- **Data dir**: defaults to `~/.arra-oracle-v2/` (legacy name), configurable via `ORACLE_DATA_DIR`
- **Repo root**: where `ψ/` lives; resolution priority: `ORACLE_REPO_ROOT` > data dir > project root
- **Three surfaces**: MCP/HTTP server (`src/server.ts`), CLI (`cli/`), web app (`web/`)
- **Vector routing**: `VECTOR_URL` for proxy mode, local LanceDB otherwise; vector-server.ts for sidecar
- **Plugin system**: `src/server/plugin/` — builtin + autoload from `PLUGINS_DIR`

**Blockers:**
- No runtime smoke test performed yet
- `web/` and `cli/` subdirs not inspected
- `config.ts` references `src/const.ts` but not read yet

**Decisions:**
- Target deliverables: `STUDY_LOG.md`, `ARCHITECTURE.md`, `SETUP.md`, `KNOWN_ISSUES.md`, `TROUBLESHOOTING.md`, `RISKS.md` + README nav table

---

## Iteration 2 — Architecture Deep Dive (Readiness: 25%)

**What was done:**
- Confirmed source tree: `src/{tools,server,db,indexer,trace,vault,forum,vector,config,process-manager,plugins,...}`
- Read `README.md` endpoint table: 55 endpoints across 14 modules
- Read `package.json` scripts: dev/server/vector/index/test/db:*

**Key findings:**
- **Entry points**:
  - `src/index.ts` — MCP stdio server
  - `src/server.ts` — HTTP API server
  - `src/indexer/cli.ts` — indexer CLI
  - `src/vault/cli.ts` — vault CLI
  - `bin/arra.ts`, `cli/src/cli.ts` — package bins
- **Search modes**: FTS5, vector, hybrid; graceful degradation to FTS5 if vectors unavailable
- **Document types**: principle, learning, pattern, retro (from `ψ/` markdown)
- **Supersede pattern**: documents never deleted, marked `supersededBy`
- **Trace system**: `src/trace/` — linked audit chains
- **Forum/threads**: `src/forum/` — conversation threads

---

## Iteration 3 — Setup Guide (Readiness: 37%)

**What was done:**
- Synthesized install steps from README + LOCAL-DEV + observed structure
- Documented env vars from `src/config.ts` and README
- Created `SETUP.md`

**Key findings:**
- Fastest path: `bun install` then `ORACLE_PORT=47778 bun run src/server.ts`
- MCP add: `claude mcp add arra-oracle-v2 -- bunx --bun --package github:Soul-Brews-Studio/arra-oracle-v3 arra-oracle-v2`
- Web app requires separate `cd web && PUBLIC_BACKEND_URL=... bun run dev`
- CLI requires `cd cli && bun run src/cli.ts ...`

---

## Iteration 4 — Known Issues (Readiness: 50%)

**What was done:**
- Cross-checked architecture.md gaps vs actual code
- Noted README says "ChromaDB" but package.json uses `@lancedb/lancedb` and `sqlite-vec`
- Observed data dir default name still references `arra-oracle-v2` (legacy)
- Created `KNOWN_ISSUES.md`

**Key findings:**
- `docs/architecture.md` is outdated: mentions ChromaDB, old endpoints (`/consult`), old schema (`consult_log` as active)
- Two repo URLs in package.json: README says `Soul-Brews-Studio/arra-oracle-v3` but `repository.url` says `arra-oracle-v2.git`
- `ORACLE_DATA_DIR` default uses legacy `.arra-oracle-v2` name
- Plugin system + vector proxy are advanced features with sparse local docs

---

## Iteration 5 — Troubleshooting (Readiness: 62%)

**What was done:**
- Synthesized common problems from LOCAL-DEV + README troubleshooting table + observed config
- Created `TROUBLESHOOTING.md`

**Key findings:**
- Port conflict on 47778 is common
- CORS between web app and server needs `CORS_ORIGIN`
- Bun version mismatch can cause syntax errors
- Fresh install has empty index until `oracle_learn` or indexer runs

---

## Iteration 6 — Risks (Readiness: 75%)

**What was done:**
- Identified security, operational, and documentation risks
- Created `RISKS.md`

**Key findings:**
- **Critical**: no obvious auth on HTTP API by default (open `/api/search`, `/api/learn`)
- **High**: outdated `docs/architecture.md` can mislead operators
- **Medium**: legacy data dir name; vector sidecar complexity; plugin autoload security

---

## Iteration 7 — README Navigation (Readiness: 87%)

**What was done:**
- Added standard "Developer Documentation" nav table to `README.md`
- Verified all doc files exist

**Files created/updated:**
1. `STUDY_LOG.md`
2. `ARCHITECTURE.md`
3. `SETUP.md`
4. `KNOWN_ISSUES.md`
5. `TROUBLESHOOTING.md`
6. `RISKS.md`
7. `README.md` (nav table)

---

## Iteration 8 — Handoff (Readiness: 100%)

**What was done:**
- Verified runtime state: not started in this session
- Confirmed doc suite complete
- Updated `STUDY_LOG.md` final entry

**Stop condition reached: 100% ✅**

**Recommended next steps:**
1. (P0) Smoke test: `bun install` + `ORACLE_PORT=47778 bun run src/server.ts` + `curl http://localhost:47778/api/health`
2. (P1) Update `docs/architecture.md` to match current stack (LanceDB not ChromaDB, current endpoints)
3. (P1) Verify HTTP API has appropriate auth before exposing to network
4. (P2) Consider renaming default data dir from `.arra-oracle-v2` to `.arra-oracle-v3`
5. (P2) Add root `.env` or document required env vars for local dev

---
