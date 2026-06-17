import { Elysia, t } from 'elysia';
import { getOracleProfile, listOracleProfileCatalog, type OracleProfileSource } from '../../oracles/registry.ts';
import type { OracleProfile } from '../../oracles/model.ts';

interface OracleProfilesEndpointOptions {
  profiles?: OracleProfileSource;
}

function oracleCapabilitySchema() {
  return t.Object({
    id: t.String(),
    label: t.String(),
    description: t.String(),
  });
}

export function oracleProfileSchema() {
  return t.Object({
    id: t.String(),
    slug: t.String(),
    name: t.String(),
    role: t.String(),
    theme: t.String(),
    born: t.String(),
    human: t.Optional(t.String()),
    motto: t.String(),
    principles: t.Array(t.String()),
    capabilities: t.Array(oracleCapabilitySchema()),
    workflows: t.Array(t.String()),
    defaultConcepts: t.Array(t.String()),
  });
}

function issueSchema() {
  return t.Object({
    index: t.Number(),
    id: t.Optional(t.String()),
    slug: t.Optional(t.String()),
    reason: t.String(),
  });
}

function profileChoice(profile: OracleProfile) {
  return { id: profile.id, slug: profile.slug, name: profile.name };
}

function catalog(options: OracleProfilesEndpointOptions) {
  return listOracleProfileCatalog(options.profiles);
}

function withIssues<T extends Record<string, unknown>>(body: T, invalidProfiles: unknown[]) {
  return invalidProfiles.length ? { ...body, invalidProfiles } : body;
}

function profilesResponseSchema() {
  return t.Object({
    profiles: t.Array(oracleProfileSchema()),
    total: t.Number(),
    invalidProfiles: t.Optional(t.Array(issueSchema())),
  });
}

const notFoundSchema = t.Object({
  error: t.String(),
  requested: t.String(),
  profiles: t.Array(t.Object({ id: t.String(), slug: t.String(), name: t.String() })),
  invalidProfiles: t.Optional(t.Array(issueSchema())),
});

export function createOracleProfilesEndpoint(options: OracleProfilesEndpointOptions = {}) {
  return new Elysia()
    .get('/oracles/profiles', () => {
      const { profiles, invalidProfiles } = catalog(options);
      return withIssues({ profiles, total: profiles.length }, invalidProfiles);
    }, {
      response: profilesResponseSchema(),
      detail: { tags: ['health'], menu: { group: 'hidden' }, summary: 'List code-backed Oracle profiles' },
    })
    .get('/oracles/profiles/:slug', ({ params, set }) => {
      const requested = params.slug.trim();
      const profile = getOracleProfile(requested, options.profiles);
      if (!profile) {
        const { profiles, invalidProfiles } = catalog(options);
        set.status = 404;
        return withIssues({ error: 'Oracle profile not found', requested: params.slug, profiles: profiles.map(profileChoice) }, invalidProfiles);
      }
      return profile;
    }, {
      params: t.Object({ slug: t.String({ minLength: 1 }) }),
      response: t.Union([oracleProfileSchema(), notFoundSchema]),
      detail: { tags: ['health'], menu: { group: 'hidden' }, summary: 'Read one code-backed Oracle profile' },
    });
}
