import { invoke } from "@tauri-apps/api/core";
import {
  API_BASE,
  API_HOST,
  API_HOST_STORAGE_KEY,
  apiFetch,
  apiUrl,
  connectToApiHost,
  hasStoredApiHost,
} from "../api/oracle";
import { SetupWizard } from "./SetupWizard";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

export type GateState = "checking" | "ready" | "unreachable";
export const DEFAULT_ORACLE_HOST = "localhost:47778";
export const ORACLE_HOST_STORAGE_KEY = API_HOST_STORAGE_KEY;

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI__);
}

function okStatus(value: unknown): boolean {
  if (typeof value === "string") return value.trim().startsWith("2");
  if (typeof value === "number") return value >= 200 && value < 300;
  return false;
}

export function normalizeOracleHost(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_ORACLE_HOST;
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`http://${trimmed}`);
    return url.host || DEFAULT_ORACLE_HOST;
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0] || DEFAULT_ORACLE_HOST;
  }
}

export function connectUrlForHost(input: string, href: string): string {
  const url = new URL(href);
  url.searchParams.set("host", normalizeOracleHost(input));
  return url.toString();
}

async function browserHealthCheck(): Promise<void> {
  const target = apiUrl("/api/health");
  const response = await apiFetch("/api/health", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${target} returned ${response.status}`);
}

async function tauriHealthCheck(): Promise<void> {
  const status = await invoke<string>("health_check");
  if (!okStatus(status))
    throw new Error(`health_check returned ${String(status)}`);
}

function PnaGuide({ retryCount, onRetry }: { retryCount: number; onRetry: () => void }) {
  if (retryCount >= 3) {
    return (
      <div className="pna-beacon pointer-events-none fixed left-[165px] top-[52px] z-50 grid -translate-x-1/2 justify-items-center gap-2" aria-hidden="true">
        <svg className="text-err-text" width="28" height="34" viewBox="0 0 28 34">
          <path d="M14 32 L14 8 M5 16 L14 8 L23 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <div className="w-[15rem] rounded-xl bg-err-bg px-3 py-2 text-xs font-semibold text-err-text shadow-lg" style={{ border: '1px solid var(--color-err-border)' }}>
          Blocked? Click the <strong>site icon in the URL bar</strong> → Local network access → Allow
        </div>
      </div>
    );
  }
  return (
    <div className="pna-beacon fixed left-[147px] top-[10px] z-50 w-[330px] max-w-[calc(100vw-2rem)]">
      <div className="pointer-events-none rounded-2xl border-2 border-dashed border-accent-solid/50 bg-[oklch(0.24_0.01_260/0.9)] p-4 shadow-2xl backdrop-blur-sm" aria-hidden="true">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-white">v4.buildwithoracle.com wants to</p>
          <span className="text-sm text-white/50">✕</span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-white/70">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2.5" y="4" width="15" height="10" rx="1.5" /><path d="M7 17h6" strokeLinecap="round" /></svg>
          Access other apps and services on this device
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/80">Block</span>
          <span className="animate-pulse rounded-full bg-accent-solid px-4 py-1.5 text-xs font-bold text-on-accent ring-2 ring-accent-solid/70">Allow</span>
        </div>
      </div>
      <div className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl bg-accent-solid/90 px-4 py-2.5 shadow-lg">
        <p className="text-left text-xs font-semibold leading-snug text-on-accent">
          The real Chrome prompt appears here.
          <br />No prompt?
          <button
            className="focus-ring ml-2 inline-block rounded-full bg-[oklch(0.20_0.02_260)] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[oklch(0.28_0.02_260)]"
            type="button"
            onClick={onRetry}
          >
            Retry
          </button>
        </p>
        <svg className="mr-2 shrink-0 text-on-accent" width="22" height="30" viewBox="0 0 22 30" aria-hidden="true">
          <path d="M11 28 L11 6 M3 13 L11 5 L19 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>
    </div>
  );
}

export function ConnectOracleSetup({
  isTauri,
  message,
  onRetry,
  onStartBackend,
  starting,
  state,
  retryCount,
}: {
  isTauri: boolean;
  message: string;
  onRetry: () => void;
  onStartBackend: () => void;
  starting: boolean;
  state: GateState;
  retryCount: number;
}) {
  const [host, setHost] = useState(API_HOST);
  const target = API_BASE;

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    connectToApiHost(host);
  }

  const showGuide = !isTauri;

  return (
    <main className="connect-shell flex min-h-screen items-center justify-center p-6 text-text">
      {showGuide ? <PnaGuide retryCount={retryCount} onRetry={onRetry} /> : null}
      <section className="connect-glass w-full max-w-xl rounded-3xl p-8">
        <div className="mb-6 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex h-20 w-20 items-center justify-center rounded-[1.35rem] bg-[oklch(0.12_0.02_265)] text-5xl drop-shadow-[0_0_20px_oklch(0.60_0.15_300/0.5)]" aria-hidden="true">
            🔮
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">ARRA Oracle</p>
            <h1 className="text-2xl font-bold">{state === "unreachable" ? "Backend unavailable" : "Connect to your Oracle"}</h1>
          </div>
        </div>
        <p className="text-sm text-text-muted">
          {state === "checking"
            ? `Checking backend health at ${target}.`
            : `Cannot reach ${target}: ${message}`}
        </p>

        <form className="mt-6 space-y-3" onSubmit={connect}>
          <label className="block text-sm font-semibold text-text" htmlFor="oracle-host">
            Local Oracle host
          </label>
          <input
            id="oracle-host"
            className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-text outline-none backdrop-blur focus:border-accent"
            placeholder={DEFAULT_ORACLE_HOST}
            value={host}
            onChange={(event) => setHost(event.currentTarget.value)}
          />
          <p className="text-xs text-text-muted">
            Start your backend with <code className="rounded bg-white/10 px-1.5 py-0.5">arra-oracle-v3 serve</code>, then connect from hosted Studio.
            {!hasStoredApiHost() ? " The default is localhost:47778." : null}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              className="focus-ring rounded-full bg-accent-solid px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
              type="submit"
            >
              Use this backend
            </button>
            {state === "unreachable" && isTauri && (
              <button
                className="focus-ring rounded-full border border-accent-border px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft disabled:opacity-60"
                disabled={starting}
                type="button"
                onClick={onStartBackend}
              >
                {starting ? "Starting…" : "Start Backend"}
              </button>
            )}
            <button
              className="focus-ring rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-white/10"
              type="button"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export function BackendGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [message, setMessage] = useState("Checking backend health…");
  const [starting, setStarting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const isTauri = isTauriRuntime();

  const check = useCallback(async (isRetry = false) => {
    setState("checking");
    setMessage("Checking backend health…");
    if (isRetry) setRetryCount((c) => c + 1);
    try {
      if (isTauri) await tauriHealthCheck();
      else await browserHealthCheck();
      setState("ready");
    } catch (error) {
      setState("unreachable");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [isTauri]);

  useEffect(() => {
    void check();
  }, [check]);

  async function startBackend() {
    setStarting(true);
    setMessage("Starting backend…");
    try {
      await invoke("start_backend");
      await check();
    } catch (error) {
      setState("unreachable");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }

  if (state === "ready") return <SetupWizard>{children}</SetupWizard>;

  return (
    <ConnectOracleSetup
      isTauri={isTauri}
      message={message}
      onRetry={() => void check(true)}
      onStartBackend={() => void startBackend()}
      starting={starting}
      state={state}
      retryCount={retryCount}
    />
  );
}
