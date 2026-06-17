import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/oracle';
import { HealthHero, healthState, type HealthState } from '../components/HealthHero';
import type { HealthResponse } from '../../../src/server/types';

async function fetchHealth(): Promise<HealthState> {
  const response = await apiFetch('/api/health', { headers: { accept: 'application/json' } });
  if (!response.ok) return 'down';
  const body = await response.json() as Partial<HealthResponse>;
  return body.draining ? 'draining' : healthState(body.status);
}

export function SimplePage() {
  const [state, setState] = useState<HealthState>('checking');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const poll = useCallback(async () => {
    setState((current) => current === 'ok' ? current : 'checking');
    try {
      setState(await fetchHealth());
    } catch {
      setState('down');
    } finally {
      setCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), 10_000);
    return () => window.clearInterval(timer);
  }, [poll]);

  return (
    <main className="min-h-screen bg-field p-6 text-text">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl items-center">
        <HealthHero state={state} checkedAt={checkedAt} onAction={poll} />
      </div>
    </main>
  );
}
