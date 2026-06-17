import { listOracleProfiles, type OracleProfileSource } from './registry.ts';
import type { OracleProfile } from './model.ts';

export interface OracleProfilePrinciple {
  id: string;
  type: 'principle';
  content: string;
  source_file: string;
  concepts: string[];
  profile: Pick<OracleProfile, 'id' | 'slug' | 'name'>;
}

interface RandomPrincipleOptions {
  profiles?: OracleProfileSource;
  random?: () => number;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function profileConcepts(profile: OracleProfile): string[] {
  return uniqueStrings([profile.id, profile.slug, profile.theme, ...profile.defaultConcepts]);
}

function randomIndex(length: number, random: () => number): number {
  const value = random();
  const safeValue = Number.isFinite(value) ? value : 0;
  return Math.min(length - 1, Math.max(0, Math.floor(Math.max(0, safeValue) * length)));
}

export function randomProfilePrinciple(options: RandomPrincipleOptions = {}): OracleProfilePrinciple | undefined {
  const candidates = listOracleProfiles(options.profiles).flatMap((profile) => (
    profile.principles.map((content, index) => ({ profile, content, index }))
  ));
  if (!candidates.length) return undefined;
  const random = options.random ?? Math.random;
  const candidate = candidates[randomIndex(candidates.length, random)];
  return {
    id: `${candidate.profile.slug}-profile-principle-${candidate.index + 1}`,
    type: 'principle',
    content: candidate.content,
    source_file: `oracle-profile://${candidate.profile.slug}`,
    concepts: profileConcepts(candidate.profile),
    profile: {
      id: candidate.profile.id,
      slug: candidate.profile.slug,
      name: candidate.profile.name,
    },
  };
}
