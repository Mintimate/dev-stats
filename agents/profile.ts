import { getStore } from '@edgeone/pages-blob';
import { createLogger, jsonResponse } from './_shared';

const logger = createLogger('profile-agent');
const CACHE_STORE_NAME = 'stats-agent-analysis-cache';

interface CacheEntry {
  cachedAt: number;
  events: string[];
}

/**
 * 与 agents/chat/index.ts 中 buildCacheKey 保持一致的缓存 key 规则（固定读取 readme 模式的缓存）。
 */
function buildCacheKey(platform: string, username: string): string {
  const safePlatform = (platform || 'github').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawUsername = username || '';
  // CNB 用户名大小写敏感，GitHub 不敏感 —— 仅对 GitHub 做小写归一化。
  const safeUsername = safePlatform === 'cnb'
    ? rawUsername.replace(/[^a-zA-Z0-9_.-]/g, '')
    : rawUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return `analysis/${safePlatform}/${safeUsername}/readme.json`;
}

/** 从缓存的原始 SSE 事件行中提取 README 草稿与用户资料。*/
function extractReadme(events: string[]): { readmeDraft: any; userProfile: any } {
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
 * 只读地返回某个用户已缓存的 README 分析结果，供独立用户主页（/u/:platform/:username）使用。
 * 不会调用 Agent，不产生 token 消耗；命中缓存才返回数据，否则返回 { found: false }。
 */
export async function onRequest(context: any) {
  const body = context.request?.body ?? {};
  const platform = String(body.platform || 'github').toLowerCase() === 'cnb' ? 'cnb' : 'github';
  const username = String(body.username || '').trim();

  if (!username) return jsonResponse({ error: "'username' is required" }, 400);

  const cacheKey = buildCacheKey(platform, username);

  try {
    const store = getStore(CACHE_STORE_NAME);
    const entry = await store.get(cacheKey, { type: 'json' }) as CacheEntry | null;
    if (!entry || !Array.isArray(entry.events)) {
      return jsonResponse({ found: false });
    }

    const { readmeDraft, userProfile } = extractReadme(entry.events);
    if (!readmeDraft) {
      return jsonResponse({ found: false });
    }

    return jsonResponse({
      found: true,
      platform,
      username,
      cachedAt: entry.cachedAt || 0,
      readmeDraft,
      userProfile,
    });
  } catch (err) {
    logger.error({ event: 'profile.read.error', platform, username, error: String(err) });
    return jsonResponse({ error: 'Failed to read profile cache' }, 500);
  }
}
