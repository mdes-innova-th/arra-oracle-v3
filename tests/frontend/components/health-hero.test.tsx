import { describe, expect, test } from 'bun:test';
import { HealthHero, checkedAgo, healthState, healthStates } from '../../../frontend/src/components/HealthHero';
import { htmlFor } from '../_render';

describe('HealthHero', () => {
  test('renders all health states with status semantics', () => {
    const html = healthStates.map((state) => htmlFor(
      <HealthHero state={state} checkedAt={1_000} onAction={() => {}} />,
    )).join('\n');

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Oracle is ready');
    expect(html).toContain('Oracle is degraded');
    expect(html).toContain('Oracle is offline');
    expect(html).toContain('Oracle is draining');
    expect(html).toContain('Oracle health is unknown');
    expect(html).toContain('Checking Oracle health');
  });

  test('maps raw health status and renders checked age', () => {
    expect(healthState('ok')).toBe('ok');
    expect(healthState('degraded')).toBe('degraded');
    expect(healthState('surprising')).toBe('unknown');
    expect(checkedAgo(1_000, 12_400)).toBe('checked 11s ago');
  });
});
