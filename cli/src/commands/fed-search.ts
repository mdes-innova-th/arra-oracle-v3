import { apiFetch, oracleApiBase } from "../lib/api.ts";

interface PeerTarget {
  name: string;
  url: string;
}

interface SearchResult {
  id: string;
  content: string;
  score?: number;
  source_file?: string;
  type?: string;
  concepts?: string[];
  [key: string]: unknown;
}

interface PeerSearchResult {
  peer: string;
  url: string;
  results: SearchResult[];
  error?: string;
  ms: number;
}

function takeFlagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx >= 0) return args[idx + 1];
  return undefined;
}

async function discoverPeers(): Promise<PeerTarget[]> {
  const res = await apiFetch("/api/peers");
  if (!res.ok) return [];
  const data = (await res.json()) as { peers?: PeerTarget[] };
  return data.peers ?? [];
}

async function searchPeer(
  peer: PeerTarget,
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<PeerSearchResult> {
  const start = Date.now();
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const url = `${peer.url.replace(/\/+$/, "")}/api/search?${params}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { peer: peer.name, url: peer.url, results: [], error: `HTTP ${res.status}`, ms: Date.now() - start };
    }
    const data = (await res.json()) as { results?: SearchResult[] };
    return { peer: peer.name, url: peer.url, results: data.results ?? [], ms: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { peer: peer.name, url: peer.url, results: [], error: msg, ms: Date.now() - start };
  }
}

function dedup(results: Array<SearchResult & { _peer: string }>): Array<SearchResult & { _peer: string }> {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.id || `${r.source_file}:${r.content?.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fedSearch(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("arra-cli fed search <query> [--limit N] [--timeout N] [--json]\n");
    console.log("Federated search — fan-out to all known peers + local, merge + dedup.\n");
    console.log("Options:");
    console.log("  --limit N      max results per peer (default 5)");
    console.log("  --timeout N    per-peer timeout in ms (default 5000)");
    console.log("  --json         output raw JSON");
    console.log("  --local        include local arra instance in the search");
    console.log("  --peers-only   skip local, search only remote peers");
    console.log("\nEnv:");
    console.log("  ORACLE_API     local API base URL (default http://localhost:47778)");
    return 0;
  }

  const limit = Number(takeFlagValue(args, "--limit") ?? "5");
  const timeoutMs = Number(takeFlagValue(args, "--timeout") ?? "5000");
  const jsonOutput = args.includes("--json");
  const peersOnly = args.includes("--peers-only");
  const includeLocal = !peersOnly && (args.includes("--local") || !peersOnly);

  const query = args
    .filter((a) => !a.startsWith("--") && a !== "search")
    .join(" ")
    .trim();
  if (!query) {
    console.error("Usage: arra-cli fed search <query>");
    return 1;
  }

  const peers = await discoverPeers();
  if (peers.length === 0 && !includeLocal) {
    console.error("No peers discovered. Add peers via namedPeers config or enable Scout.");
    return 1;
  }

  const localBase = oracleApiBase();
  const targets: PeerTarget[] = [
    ...(includeLocal ? [{ name: "local", url: localBase }] : []),
    ...peers,
  ];

  console.error(`🔍 Federated search: "${query}" → ${targets.length} target(s)`);

  const results = await Promise.all(
    targets.map((peer) => searchPeer(peer, query, limit, timeoutMs)),
  );

  const allResults = results.flatMap((pr) =>
    pr.results.map((r) => ({ ...r, _peer: pr.peer })),
  );
  allResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const merged = dedup(allResults);

  if (jsonOutput) {
    const summary = results.map(({ peer, url, results: r, error, ms }) => ({
      peer,
      url,
      count: r.length,
      error: error ?? null,
      ms,
    }));
    console.log(JSON.stringify({ query, peers: summary, results: merged, total: merged.length }, null, 2));
    return 0;
  }

  for (const pr of results) {
    const status = pr.error ? `❌ ${pr.error}` : `✅ ${pr.results.length} results`;
    console.error(`  ${pr.peer.padEnd(16)} ${status} (${pr.ms}ms)`);
  }
  console.error(`  ${"─".repeat(40)}`);
  console.error(`  ${merged.length} results (deduped)\n`);

  for (const r of merged.slice(0, limit * 2)) {
    const peer = r._peer.padEnd(12);
    const score = r.score != null ? `[${r.score.toFixed(3)}]` : "";
    const src = r.source_file ? ` (${r.source_file})` : "";
    const snippet = (r.content ?? "").slice(0, 120).replace(/\n/g, " ");
    console.log(`${peer} ${score} ${snippet}${src}`);
  }

  return 0;
}
