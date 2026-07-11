import type { DeterministicAnalysis } from './_analysis';

export const EVIDENCE_CACHE_SCHEMA_VERSION = 'v1';
export const EVIDENCE_CACHE_PREFIX = 'evidence';

export interface EvidenceCacheEntry {
  cachedAt: number;
  expiresAt: number;
  platform: 'github' | 'cnb';
  username: string;
  inspected: Record<string, any>;
  analysis: DeterministicAnalysis;
}

function normalizeIdentity(platform: string, username: string) {
  const safePlatform = platform === 'cnb' ? 'cnb' : 'github';
  const safeUsername = safePlatform === 'cnb'
    ? String(username || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    : String(username || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return { safePlatform, safeUsername };
}

export function buildEvidenceCacheKey(platform: string, username: string): string {
  const { safePlatform, safeUsername } = normalizeIdentity(platform, username);
  return `${EVIDENCE_CACHE_PREFIX}/${EVIDENCE_CACHE_SCHEMA_VERSION}/${safePlatform}/${safeUsername}.json`;
}

function isEvidenceCacheEntry(value: unknown, now = Date.now()): value is EvidenceCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as EvidenceCacheEntry;
  return (
    (entry.platform === 'github' || entry.platform === 'cnb') &&
    typeof entry.username === 'string' &&
    typeof entry.cachedAt === 'number' &&
    typeof entry.expiresAt === 'number' &&
    entry.expiresAt > now &&
    Boolean(entry.inspected) &&
    Boolean(entry.analysis) &&
    entry.analysis.version === 'v1'
  );
}

export async function readEvidenceCache(
  store: any,
  platform: 'github' | 'cnb',
  username: string,
  now = Date.now(),
): Promise<EvidenceCacheEntry | null> {
  const key = buildEvidenceCacheKey(platform, username);
  const entry = await store.get(key, { type: 'json', consistency: 'strong' });
  return isEvidenceCacheEntry(entry, now) ? entry : null;
}

export async function writeEvidenceCache(
  store: any,
  platform: 'github' | 'cnb',
  username: string,
  inspected: Record<string, any>,
  analysis: DeterministicAnalysis,
  ttlMs: number,
  now = Date.now(),
): Promise<EvidenceCacheEntry> {
  const entry: EvidenceCacheEntry = {
    cachedAt: now,
    expiresAt: now + ttlMs,
    platform,
    username: analysis.username || username,
    inspected,
    analysis,
  };
  await store.setJSON(buildEvidenceCacheKey(platform, username), entry, { cacheControl: 'no-store' });
  return entry;
}
