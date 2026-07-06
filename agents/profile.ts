import { getStore } from '@edgeone/pages-blob';
import { createLogger, jsonResponse } from './_shared';
import {
  CACHE_STORE_NAME,
  extractReadmeFromEvents,
  readCompatibleAnalysisCacheFromStore,
  resolveAnalysisCacheTtlMs,
  sanitizeEventsForPublicReplay,
} from './_cache';

const logger = createLogger('profile-agent');

/**
 * 只读地返回某个用户已缓存的 README 分析结果，供独立用户主页（/u/:platform/:username）使用。
 * 不会调用 Agent，不产生 token 消耗；命中缓存才返回数据，否则返回 { found: false }。
 */
export async function onRequest(context: any) {
  const body = context.request?.body ?? {};
  const platform = String(body.platform || 'github').toLowerCase() === 'cnb' ? 'cnb' : 'github';
  const username = String(body.username || '').trim();

  if (!username) return jsonResponse({ error: "'username' is required" }, 400);

  try {
    const store = getStore(CACHE_STORE_NAME);
    const cacheTtlMs = resolveAnalysisCacheTtlMs(context.env ?? process.env);
    const cached = await readCompatibleAnalysisCacheFromStore(store, platform, username, 'readme', cacheTtlMs);
    const entry = cached?.entry ?? null;
    if (!entry || !Array.isArray(entry.events)) {
      return jsonResponse({ found: false });
    }

    const { readmeDraft, userProfile } = extractReadmeFromEvents(entry.events);
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
      // 仅回放前端终端 UI 实际渲染用得到的精简事件，避免把原始工具入参/输出透传给公开只读接口。
      events: sanitizeEventsForPublicReplay(entry.events),
    });
  } catch (err) {
    logger.error({ event: 'profile.read.error', platform, username, error: String(err) });
    return jsonResponse({ error: 'Failed to read profile cache' }, 500);
  }
}
