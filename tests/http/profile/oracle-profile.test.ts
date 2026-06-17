import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { createOracleProfilesEndpoint } from '../../../src/routes/profile/index.ts';
import { thorOracleProfile } from '../../../src/oracles/thor.ts';

function createApp() {
  return new Elysia({ prefix: '/api' }).use(createOracleProfilesEndpoint());
}

describe('oracle profile HTTP routes', () => {
  test('GET /api/oracles/profiles returns a stable sorted profile listing', async () => {
    const app = createApp();
    const res = await app.handle(new Request('http://local/api/oracles/profiles'));
    const body = await res.json() as { profiles: Array<{ slug: string; defaultConcepts: string[] }>; total: number };
    const slugs = body.profiles.map((profile) => profile.slug);

    expect(res.status).toBe(200);
    expect(body.total).toBe(body.profiles.length);
    expect(slugs).toEqual([...slugs].sort());
    expect(slugs).toContain('thor');
    expect(body.profiles.find((profile) => profile.slug === 'thor')?.defaultConcepts).toContain('thor-oracle');
  });

  test('GET /api/oracles/profiles/:slug resolves aliases without mutating registry copies', async () => {
    const app = createApp();
    const byName = await app.handle(new Request('http://local/api/oracles/profiles/Thor%20Oracle'));
    const profile = await byName.json() as { id: string; principles: string[] };
    profile.principles.push('mutated response copy');

    const byId = await app.handle(new Request('http://local/api/oracles/profiles/thor-oracle'));
    const fresh = await byId.json() as { id: string; principles: string[] };

    expect(byName.status).toBe(200);
    expect(byId.status).toBe(200);
    expect(profile.id).toBe('thor-oracle');
    expect(fresh.id).toBe('thor-oracle');
    expect(fresh.principles).not.toContain('mutated response copy');
  });


  test('GET /api/oracles/profiles skips malformed code-backed profiles with diagnostics', async () => {
    const malformed = { id: 'broken-oracle', slug: 'broken', name: 'Broken Oracle', principles: 'nope' };
    const app = new Elysia({ prefix: '/api' }).use(createOracleProfilesEndpoint({ profiles: [malformed, thorOracleProfile] }));
    const res = await app.handle(new Request('http://local/api/oracles/profiles'));
    const body = await res.json() as {
      profiles: Array<{ slug: string }>;
      total: number;
      invalidProfiles: Array<{ id?: string; slug?: string; reason: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.profiles.map((profile) => profile.slug)).toEqual(['thor']);
    expect(body.invalidProfiles).toHaveLength(1);
    expect(body.invalidProfiles[0]).toMatchObject({ id: 'broken-oracle', slug: 'broken' });
    expect(body.invalidProfiles[0].reason).toContain('principles must be an array');

    const missing = await app.handle(new Request('http://local/api/oracles/profiles/broken'));
    const missingBody = await missing.json() as { profiles: Array<{ slug: string }>; invalidProfiles: unknown[] };
    expect(missing.status).toBe(404);
    expect(missingBody.profiles.map((profile) => profile.slug)).toEqual(['thor']);
    expect(missingBody.invalidProfiles).toHaveLength(1);
  });

  test('GET /api/oracles/profiles/:slug reports requested id and valid choices on 404', async () => {
    const app = createApp();
    const res = await app.handle(new Request('http://local/api/oracles/profiles/not-real'));
    const body = await res.json() as {
      error: string;
      requested: string;
      profiles: Array<{ id: string; slug: string; name: string }>;
    };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Oracle profile not found');
    expect(body.requested).toBe('not-real');
    expect(body.profiles).toContainEqual(expect.objectContaining({ id: 'thor-oracle', slug: 'thor' }));
  });
});
