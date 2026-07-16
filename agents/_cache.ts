import { createLogger, getGitHubToken, sseEvent } from './_shared';

const logger = createLogger('shared-cache');

export const CACHE_STORE_NAME = 'stats-agent-analysis-cache';
// v5 separates deterministic evidence/score generation from writer output.
// Do not replay v4's model-authored ratings after the scoring contract changed.
export const CACHE_SCHEMA_VERSION = 'v1';
export const LEADERBOARD_KEY = 'leaderboard/readme_rankings.json';
export const LEADERBOARD_ITEM_PREFIX = 'leaderboard/items/';
export const REFRESH_LEASE_PREFIX = 'refresh-leases/';
export const PUBLIC_ANALYSIS_RATE_LIMIT_PREFIX = 'rate-limits/analysis/';
export const DEFAULT_ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_REFRESH_LEASE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_PUBLIC_ANALYSIS_RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes

export interface CacheEntry {
  cachedAt: number;
  expiresAt?: number;
  events: string[];
}

export interface RefreshLease {
  runId: string;
  platform: string;
  username: string;
  mode: string;
  startedAt: number;
  expiresAt: number;
}

function normalizeCacheIdentity(platform: string, username: string, mode = 'readme') {
  const safePlatform = (platform || 'github').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawUsername = username || '';
  const safeUsername = safePlatform === 'cnb'
    ? rawUsername.replace(/[^a-zA-Z0-9_.-]/g, '')
    : rawUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const safeMode = (mode || 'readme').toLowerCase().replace(/[^a-z0-9]/g, '');
  return { safePlatform, safeUsername, safeMode };
}

export function buildRefreshLeaseKey(platform: string, username: string, mode: string): string {
  const { safePlatform, safeUsername, safeMode } = normalizeCacheIdentity(platform, username, mode);
  return `${REFRESH_LEASE_PREFIX}${safePlatform}/${safeUsername}/${safeMode}.json`;
}

export function buildLeaderboardItemKey(platform: string, username: string): string {
  const { safePlatform, safeUsername } = normalizeCacheIdentity(platform, username);
  return `${LEADERBOARD_ITEM_PREFIX}${safePlatform}/${safeUsername.toLowerCase()}.json`;
}

export function isActiveRefreshLease(value: unknown, now = Date.now()): value is RefreshLease {
  if (!value || typeof value !== 'object') return false;
  const lease = value as RefreshLease;
  return typeof lease.runId === 'string' && lease.runId.length > 0 &&
    typeof lease.expiresAt === 'number' && lease.expiresAt > now;
}

export async function readRefreshLease(store: any, platform: string, username: string, mode: string): Promise<RefreshLease | null> {
  const key = buildRefreshLeaseKey(platform, username, mode);
  const lease = await store.get(key, { type: 'json', consistency: 'strong' });
  return isActiveRefreshLease(lease) ? lease : null;
}

export async function acquireRefreshLease(
  store: any,
  platform: string,
  username: string,
  mode: string,
  runId: string,
  now = Date.now(),
  ttlMs = DEFAULT_REFRESH_LEASE_TTL_MS,
): Promise<{ acquired: boolean; lease: RefreshLease }> {
  const key = buildRefreshLeaseKey(platform, username, mode);
  const existing = await store.get(key, { type: 'json', consistency: 'strong' });
  if (isActiveRefreshLease(existing, now)) return { acquired: false, lease: existing };

  // Blob 没有 compare-and-swap；过期租约先删除，再通过 onlyIfNew 竞争新租约。
  if (existing) await store.delete(key);
  const lease: RefreshLease = { runId, platform, username, mode, startedAt: now, expiresAt: now + ttlMs };
  try {
    await store.setJSON(key, lease, { onlyIfNew: true, cacheControl: 'no-store' });
    return { acquired: true, lease };
  } catch {
    const winner = await store.get(key, { type: 'json', consistency: 'strong' });
    if (isActiveRefreshLease(winner, now)) return { acquired: false, lease: winner };
    throw new Error('Failed to acquire analysis refresh lease');
  }
}

export async function releaseRefreshLease(store: any, lease: RefreshLease): Promise<void> {
  const key = buildRefreshLeaseKey(lease.platform, lease.username, lease.mode);
  const current = await store.get(key, { type: 'json', consistency: 'strong' });
  if (current?.runId === lease.runId) await store.delete(key);
}

async function hashedRateLimitIdentity(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Allow one cache-miss analysis per public client in the configured window. The
 * identifier is SHA-256 hashed before it becomes a Blob key, so raw IP addresses
 * are never stored in the cache namespace.
 */
export async function acquirePublicAnalysisRateLimit(
  store: any,
  clientId: string,
  now = Date.now(),
  ttlMs = DEFAULT_PUBLIC_ANALYSIS_RATE_LIMIT_MS,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const key = `${PUBLIC_ANALYSIS_RATE_LIMIT_PREFIX}${await hashedRateLimitIdentity(clientId)}.json`;
  const existing = await store.get(key, { type: 'json', consistency: 'strong' });
  const existingExpiry = Number(existing?.expiresAt);
  if (Number.isFinite(existingExpiry) && existingExpiry > now) {
    return { allowed: false, retryAfterMs: existingExpiry - now };
  }

  if (existing) await store.delete(key);
  const entry = { expiresAt: now + ttlMs };
  try {
    await store.setJSON(key, entry, { onlyIfNew: true, cacheControl: 'no-store' });
    return { allowed: true, retryAfterMs: 0 };
  } catch {
    const winner = await store.get(key, { type: 'json', consistency: 'strong' });
    const winnerExpiry = Number(winner?.expiresAt);
    if (Number.isFinite(winnerExpiry) && winnerExpiry > now) {
      return { allowed: false, retryAfterMs: winnerExpiry - now };
    }
    throw new Error('Failed to acquire public analysis rate limit');
  }
}

export function resolveAnalysisCacheTtlMs(env?: Record<string, string | undefined>): number {
  const raw = Number(env?.CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ANALYSIS_CACHE_TTL_MS;
}

export function isFreshCacheEntry(entry: unknown, cacheTtlMs: number): entry is CacheEntry {
  if (!isCacheEntry(entry)) return false;
  return getCacheExpiresAt(entry.cachedAt, entry.expiresAt, cacheTtlMs) > Date.now();
}

/**
 * 校验缓存的结构是否可用，但不把 24h 刷新周期误当成数据保留期。
 * 排行榜和公开画像可读取旧快照；Agent 自身复用缓存时仍使用 isFreshCacheEntry。
 */
export function isCacheEntry(entry: unknown): entry is CacheEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as CacheEntry;
  return typeof candidate.cachedAt === 'number' && Number.isFinite(candidate.cachedAt) && Array.isArray(candidate.events);
}

export function getCacheExpiresAt(cachedAt: number, expiresAt: unknown, cacheTtlMs: number): number {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt)
    ? expiresAt
    : cachedAt + cacheTtlMs;
}

async function readFreshCacheEntry(store: any, key: string, cacheTtlMs: number): Promise<CacheEntry | null> {
  const entry = await store.get(key, { type: 'json', consistency: 'strong' }) as CacheEntry | null;
  return isFreshCacheEntry(entry, cacheTtlMs) ? entry : null;
}

async function readCacheEntry(store: any, key: string): Promise<CacheEntry | null> {
  const entry = await store.get(key, { type: 'json', consistency: 'strong' }) as CacheEntry | null;
  return isCacheEntry(entry) ? entry : null;
}

export async function readCompatibleAnalysisCacheFromStore(
  store: any,
  platform: string,
  username: string,
  mode: string,
  cacheTtlMs: number,
  freshOnly = true,
): Promise<{ key: string; entry: CacheEntry } | null> {
  const currentKey = buildCacheKey(platform, username, mode);
  const readEntry = freshOnly
    ? (key: string) => readFreshCacheEntry(store, key, cacheTtlMs)
    : (key: string) => readCacheEntry(store, key);
  const current = await readEntry(currentKey);
  if (current) return { key: currentKey, entry: current };

  const safePlatform = (platform || 'github').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeMode = (mode || 'readme').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeUsername = safePlatform === 'cnb'
    ? (username || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    : (username || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '');

  const { blobs } = await store.list({ consistency: 'strong' });
  const candidates = blobs
    .map((blob: any) => blob.key)
    .filter((key: string) => key !== currentKey)
    .map((key: string) => ({ key, parsed: parseAnalysisCacheKey(key) }))
    .filter(({ parsed }: { parsed: ReturnType<typeof parseAnalysisCacheKey> }) =>
      parsed &&
      parsed.platform === safePlatform &&
      parsed.mode === safeMode &&
      parsed.username === safeUsername
    );

  let newest: { key: string; entry: CacheEntry } | null = null;
  for (const candidate of candidates) {
    const entry = await readEntry(candidate.key);
    if (!entry) continue;
    if (!newest || entry.cachedAt > newest.entry.cachedAt) newest = { key: candidate.key, entry };
  }
  return newest;
}

/** 公开只读回放（/u/:platform/:username）允许透出的事件类型，其余一律丢弃。 */
const PUBLIC_REPLAY_EVENT_TYPES = new Set([
  'agent_status',
  'tool_call',
  'tool_called',
  'tool_result',
  'stats_recipe',
  'readme_draft',
  'usage',
  'error_message',
]);

/**
 * 将原始 SSE 事件行裁剪为公开只读回放接口（profile.ts）所需的最小字段集。
 * 丢弃 thinking/text_delta/ai_response/user_profile 等敏感或冗余事件，
 * 并且对保留的事件类型也只挑选前端终端回放实际渲染用到的字段，
 * 避免 tool_call 的原始入参、tool_result 的原始输出内容被公开接口透传。
 */
export function sanitizeEventsForPublicReplay(events: string[]): string[] {
  const sanitized: string[] = [];
  const seen = new Set<string>();
  for (const raw of events) {
    if (typeof raw !== 'string' || !raw.startsWith('data: ')) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(raw.slice(6).trim());
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || !PUBLIC_REPLAY_EVENT_TYPES.has(parsed.type)) continue;

    let picked: Record<string, unknown> | null = null;
    switch (parsed.type) {
      case 'agent_status':
        picked = {
          type: parsed.type,
          status: parsed.status,
          protocol: parsed.protocol,
          model: parsed.model,
          message: parsed.message,
          score: Number(parsed.score || 0),
          rating: parsed.rating,
          cached_at: parsed.cached_at,
          expires_at: parsed.expires_at,
        };
        break;
      case 'tool_call':
      case 'tool_called':
        // 两种事件名是运行时兼容别名；公开回放只保留一条规范化的开始事件。
        picked = { type: 'tool_call', name: parsed.name };
        break;
      case 'tool_result':
        picked = { type: parsed.type, name: parsed.name };
        break;
      case 'stats_recipe':
        picked = { type: parsed.type, cards: Array.isArray(parsed.cards) ? parsed.cards : [] };
        break;
      case 'readme_draft':
        picked = { type: parsed.type, is_ghost: Boolean(parsed.is_ghost) };
        break;
      case 'usage':
        picked = { type: parsed.type, total_tokens: Number(parsed.total_tokens || 0) };
        break;
      case 'error_message':
        picked = { type: parsed.type, content: String(parsed.content || '') };
        break;
      default:
        picked = null;
    }
    if (picked) {
      const fingerprint = JSON.stringify(picked);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      sanitized.push(sseEvent(picked));
    }
  }
  return sanitized;
}

/**
 * 解析 analysis 缓存 key，同时兼容带版本号（v4）和不带版本号的旧格式。
 * 用于遍历 blob store 时识别分析缓存条目。
 */
export function parseAnalysisCacheKey(key: string): { platform: string; username: string; mode: string } | null {
  const parts = key.split('/');
  if (parts.length === 4 && parts[0] === 'analysis') {
    return { platform: parts[1], username: parts[2], mode: parts[3].replace(/\.json$/, '') };
  }
  if (parts.length === 5 && parts[0] === 'analysis' && /^v\d+$/.test(parts[1])) {
    return { platform: parts[2], username: parts[3], mode: parts[4].replace(/\.json$/, '') };
  }
  return null;
}

/**
 * 通过 GitHub REST API 校验并返回平台权威大小写的用户名。
 * GitHub 用户名不区分大小写，但 API 返回的 login 是权威大小写。
 * 带上 token 以避开未认证 60 req/h 限流，避免 leaderboard 全量重建时触发限流。
 */
export async function resolveGitHubLogin(username: string, env?: Record<string, string | undefined>): Promise<string> {
  try {
    const token = getGitHubToken(env);
    const headers: Record<string, string> = { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers });
    if (response.ok) {
      const profile = await response.json();
      return profile.login || username;
    }
    logger.error({ event: 'github.resolve_login.not_ok', username, status: response.status });
  } catch (err) {
    logger.error({ event: 'github.resolve_login.error', username, error: String(err) });
  }
  return username;
}

/**
 * 从缓存的原始 SSE 事件行中提取 README 草稿与用户资料。
 * chat agent、leaderboard 重建、profile 只读页共用此逻辑。
 * 返回值为动态解析的 JSON，使用 any 以兼容调用方已有的字段访问模式。
 */
export function extractReadmeFromEvents(events: string[]): {
  readmeDraft: any;
  userProfile: any;
} {
  let readmeDraft: any = null;
  let userProfile: any = null;

  for (const raw of events) {
    if (!raw.startsWith('data: ')) continue;
    try {
      const parsed = JSON.parse(raw.slice(6).trim());
      if (parsed.type === 'readme_draft') {
        readmeDraft = parsed;
      } else if (parsed.type === 'user_profile') {
        try {
          userProfile = typeof parsed.content === 'string' ? JSON.parse(parsed.content) : parsed.content;
        } catch {
          userProfile = parsed;
        }
      }
    } catch {
      // ignore malformed lines
    }
  }

  return { readmeDraft, userProfile };
}

/**
 * 根据 platform / username / mode 构造带版本号的缓存 key。
 * CNB 用户名大小写敏感，GitHub 不敏感 —— 仅对 GitHub 做小写归一化。
 */
export function buildCacheKey(platform: string, username: string, mode: string): string {
  const { safePlatform, safeUsername, safeMode } = normalizeCacheIdentity(platform, username, mode);
  return `analysis/${CACHE_SCHEMA_VERSION}/${safePlatform}/${safeUsername}/${safeMode}.json`;
}
