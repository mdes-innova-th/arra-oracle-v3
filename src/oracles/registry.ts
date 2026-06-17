import { thorOracleProfile } from './thor.ts';
import type { OracleCapability, OracleProfile } from './model.ts';

const codeBackedProfiles: readonly unknown[] = [thorOracleProfile];
const REQUIRED_STRINGS = ['id', 'slug', 'name', 'role', 'theme', 'born', 'motto'] as const;
const ARRAY_FIELDS = ['principles', 'workflows', 'defaultConcepts'] as const;

export interface OracleProfileIssue {
  index: number;
  id?: string;
  slug?: string;
  reason: string;
}

export interface OracleProfileCatalog {
  profiles: OracleProfile[];
  invalidProfiles: OracleProfileIssue[];
}

export type OracleProfileSource = readonly unknown[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function key(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function readString(record: Record<string, unknown>, field: string, errors: string[]): string {
  const value = record[field];
  if (typeof value === 'string' && value.trim()) return value.trim();
  errors.push(`${field} must be a non-empty string`);
  return '';
}

function readStringArray(record: Record<string, unknown>, field: string, errors: string[]): string[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return [];
  }
  const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  if (items.length !== value.length) errors.push(`${field} must contain only non-empty strings`);
  if (field === 'principles' && items.length === 0) errors.push('principles must contain at least one string');
  return items;
}

function readCapabilities(value: unknown, errors: string[]): OracleCapability[] {
  if (!Array.isArray(value)) {
    errors.push('capabilities must be an array');
    return [];
  }
  const capabilities: OracleCapability[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`capabilities[${index}] must be an object`);
      return;
    }
    const capErrors: string[] = [];
    const id = readString(item, 'id', capErrors);
    const label = readString(item, 'label', capErrors);
    const description = readString(item, 'description', capErrors);
    if (capErrors.length) errors.push(`capabilities[${index}]: ${capErrors.join(', ')}`);
    else capabilities.push({ id, label, description });
  });
  return capabilities;
}

function profileIssue(index: number, value: unknown, reason: string): OracleProfileIssue {
  const record = isRecord(value) ? value : {};
  return {
    index,
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    ...(typeof record.slug === 'string' ? { slug: record.slug } : {}),
    reason,
  };
}

function normalizeProfile(value: unknown, index: number): OracleProfile | OracleProfileIssue {
  if (!isRecord(value)) return profileIssue(index, value, 'profile must be an object');
  const errors: string[] = [];
  const base = Object.fromEntries(REQUIRED_STRINGS.map((field) => [field, readString(value, field, errors)]));
  const arrays = Object.fromEntries(ARRAY_FIELDS.map((field) => [field, readStringArray(value, field, errors)]));
  const capabilities = readCapabilities(value.capabilities, errors);
  if (value.human !== undefined && typeof value.human !== 'string') errors.push('human must be a string');
  if (errors.length) return profileIssue(index, value, errors.join('; '));
  return cloneProfile({
    id: base.id,
    slug: base.slug,
    name: base.name,
    role: base.role,
    theme: base.theme,
    born: base.born,
    ...(typeof value.human === 'string' && value.human.trim() ? { human: value.human.trim() } : {}),
    motto: base.motto,
    principles: arrays.principles,
    capabilities,
    workflows: arrays.workflows,
    defaultConcepts: arrays.defaultConcepts,
  });
}

function cloneProfile(profile: OracleProfile): OracleProfile {
  return {
    ...profile,
    principles: [...profile.principles],
    capabilities: profile.capabilities.map((capability) => ({ ...capability })),
    workflows: [...profile.workflows],
    defaultConcepts: [...profile.defaultConcepts],
  };
}

function aliases(profile: OracleProfile): string[] {
  return [
    profile.id,
    profile.slug,
    profile.name,
    profile.name.replace(/\s+oracle$/i, ''),
  ];
}

export function listOracleProfileCatalog(source: OracleProfileSource = codeBackedProfiles): OracleProfileCatalog {
  const catalog: OracleProfileCatalog = { profiles: [], invalidProfiles: [] };
  source.forEach((raw, index) => {
    const profile = normalizeProfile(raw, index);
    if ('reason' in profile) catalog.invalidProfiles.push(profile);
    else catalog.profiles.push(profile);
  });
  catalog.profiles.sort((left, right) => left.slug.localeCompare(right.slug));
  return catalog;
}

export function listOracleProfiles(source?: OracleProfileSource): OracleProfile[] {
  return listOracleProfileCatalog(source).profiles;
}

export function getOracleProfile(slugOrId: unknown, source?: OracleProfileSource): OracleProfile | undefined {
  if (typeof slugOrId !== 'string') return undefined;
  const requested = key(slugOrId);
  if (!requested) return undefined;
  return listOracleProfiles(source).find((item) => aliases(item).map(key).includes(requested));
}
