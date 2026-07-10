import { getStore } from '@edgeone/pages-blob';
import { createLogger, jsonResponse } from './_shared';
import {
  CACHE_STORE_NAME,
  extractReadmeFromEvents,
  getCacheExpiresAt,
  readRefreshLease,
  readCompatibleAnalysisCacheFromStore,
  resolveAnalysisCacheTtlMs,
  sanitizeEventsForPublicReplay,
} from './_cache';

const logger = createLogger('profile-agent');

/**
 * 返回某个用户最近一次成功的 README 分析结果，供独立用户主页（/u/:platform/:username）使用。
 * 旧快照也会返回并标记 stale，由前端先展示、再后台触发重新分析。
 */
export async function onRequest(context: any) {
  const body = context.request?.body ?? {};
  const platform = String(body.platform || 'github').toLowerCase() === 'cnb' ? 'cnb' : 'github';
  const username = String(body.username || '').trim();

  if (!username) return jsonResponse({ error: "'username' is required" }, 400);

  try {
    const store = getStore(CACHE_STORE_NAME);
    const cacheTtlMs = resolveAnalysisCacheTtlMs(context.env);
    const refreshLease = await readRefreshLease(store, platform, username, 'readme').catch(() => null);
    const refresh = refreshLease
      ? { status: 'running', runId: refreshLease.runId, startedAt: refreshLease.startedAt, expiresAt: refreshLease.expiresAt }
      : { status: 'idle' };
    const cached = await readCompatibleAnalysisCacheFromStore(store, platform, username, 'readme', cacheTtlMs, false);
    const entry = cached?.entry ?? null;
    if (!entry || !Array.isArray(entry.events)) {
      return jsonResponse({ found: false, refresh });
    }

    const { readmeDraft, userProfile } = extractReadmeFromEvents(entry.events);
    if (!readmeDraft) {
      return jsonResponse({ found: false, refresh });
    }

    const expiresAt = getCacheExpiresAt(entry.cachedAt, entry.expiresAt, cacheTtlMs);

    return jsonResponse({
      found: true,
      platform,
      username,
      cachedAt: entry.cachedAt || 0,
      expiresAt,
      stale: expiresAt <= Date.now(),
      refresh,
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
