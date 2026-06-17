import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/oracle';
import { HealthHero } from '../components/HealthHero';
import { IndexFolderCard } from '../components/simple/IndexFolderCard';
import { HealthState, mapHealthState, type SimpleHealthPayload } from '../components/simple/healthState';

async function fetchHealth(): Promise<SimpleHealthPayload> {
  const response = await apiFetch('/api/health', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`/api/health returned ${response.status}`);
  return await response.json() as SimpleHealthPayload;
}

export function SimplePage() {
  const loadedAt = useRef(Date.now());
  const failedPolls = useRef(0);
  const [state, setState] = useState<HealthState>(HealthState.Starting);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const health = await fetchHealth();
      failedPolls.current = 0;
      setState(mapHealthState({ health, msSinceLoad: Date.now() - loadedAt.current }));
    } catch (error) {
      failedPolls.current += 1;
      setState(mapHealthState({ error, failedPolls: failedPolls.current, msSinceLoad: Date.now() - loadedAt.current }));
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
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl flex-col justify-center gap-6">
        <HealthHero state={state} checkedAt={checkedAt} onAction={poll} />
        <IndexFolderCard />
      </div>
    </main>
  );
}
