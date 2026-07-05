import { getStore } from '@edgeone/pages-blob';
import { createLogger, jsonResponse } from './_shared';
import {
  CACHE_STORE_NAME,
  extractReadmeFromEvents,
  LEADERBOARD_KEY,
  parseAnalysisCacheKey,
  resolveGitHubLogin,
} from './_cache';

const logger = createLogger('leaderboard-agent');

export async function onRequest(context: any) {
  const store = getStore(CACHE_STORE_NAME);
  const body = context.request?.body ?? {};
  const forceRebuild = body.rebuild === true;

  let leaderboard: any[] = [];
  let indexExists = false;

  // 1. Try reading the compiled index if not forcing a rebuild
  if (!forceRebuild) {
    try {
      const entry = await store.get(LEADERBOARD_KEY, { type: 'json', consistency: 'strong' });
      if (Array.isArray(entry)) {
        leaderboard = entry;
        indexExists = true;
      }
    } catch {
      // ignore
    }
  }

  // 2. Fetch all cache keys to verify count match
  let cacheKeysCount = 0;
  let blobsList: any[] = [];
  try {
    const { blobs } = await store.list();
    blobsList = blobs;
    const cacheKeys = blobs.filter(b => parseAnalysisCacheKey(b.key)?.mode === 'readme');
    cacheKeysCount = cacheKeys.length;
  } catch (err) {
    logger.error({ event: 'leaderboard.list_keys.error', error: String(err) });
  }

  // 3. Rebuild only if forced, or index does not exist / is empty.
  // Count mismatch is not a trigger because updateLeaderboard() handles incremental updates;
  // rebuilding on every count difference caused redundant full scans.
  const needsRebuild = forceRebuild || !indexExists || leaderboard.length === 0;

  if (!needsRebuild) {
    return jsonResponse({ leaderboard });
  }

  try {
    logger.log({
      event: 'leaderboard.rebuild.start',
      forceRebuild,
      indexExists,
      indexCount: leaderboard.length,
      cacheCount: cacheKeysCount
    });

    const rebuiltList: any[] = [];
    const cacheKeys = blobsList.filter(b => parseAnalysisCacheKey(b.key)?.mode === 'readme');

    // Process blobs in parallel batches of 5 for performance
    const BATCH_SIZE = 5;
    for (let i = 0; i < cacheKeys.length; i += BATCH_SIZE) {
      const batch = cacheKeys.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (blob: any) => {
          const parsedKey = parseAnalysisCacheKey(blob.key);
          if (!parsedKey) return null;
          const { platform, username } = parsedKey;
          const cacheEntry: any = await store.get(blob.key, { type: 'json' });
          return { platform, username, cacheEntry };
        })
      );

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        if (!result.value) continue;
        const { platform, username, cacheEntry } = result.value;
        try {
          if (!cacheEntry || !Array.isArray(cacheEntry.events)) continue;

            const { readmeDraft, userProfile } = extractReadmeFromEvents(cacheEntry.events);

            if (readmeDraft) {
              const nickname = userProfile?.nickname || readmeDraft.user?.nickname || readmeDraft.user?.name || username;
              let avatar = userProfile?.avatar || readmeDraft.user?.avatar || '';

              // 优先使用分析时持久化下来的权威大小写用户名（user_profile.username，来自平台 API）。
              // 缓存 key 里的 username 段对 GitHub 是强制小写的，不能作为大小写来源。
              // 只有老缓存缺失该字段时，才退回到从 AI 生成的标题里尝试猜大小写这个不太可靠的办法。
              let displayUsername = userProfile?.username || username;
              if (!userProfile?.username && readmeDraft.title && readmeDraft.title.toLowerCase().startsWith(username.toLowerCase())) {
                displayUsername = readmeDraft.title.slice(0, username.length);
              }

              if (platform === 'cnb') {
                try {
                  const checkResponse = await fetch(`https://cnb.cool/users/${encodeURIComponent(displayUsername)}`, {
                    headers: {
                      'Accept': 'application/vnd.cnb.web+json',
                      'User-Agent': 'EdgeOne-Stats-Agent/1.0'
                    }
                  });
                  if (checkResponse.ok) {
                    const profile = await checkResponse.json();
                    if (profile.username) {
                      displayUsername = profile.username;
                    }
                    if (profile.avatar) {
                      avatar = profile.avatar;
                    }
                  }
                } catch {
                  // ignore
                }
              }
              if (platform === 'github') {
                displayUsername = await resolveGitHubLogin(displayUsername);
              }

              if (avatar && !avatar.startsWith('http') && platform === 'cnb') {
                avatar = `https://cnb.cool${avatar.startsWith('/') ? '' : '/'}${avatar}`;
              }
              if (!avatar) {
                avatar = platform === 'cnb'
                  ? `https://cnb.cool/users/${encodeURIComponent(displayUsername)}/avatar/s`
                  : `https://github.com/${encodeURIComponent(displayUsername)}.png`;
              }

              const score = typeof readmeDraft.score === 'number' ? readmeDraft.score : 60;
              const rating = readmeDraft.objective_rating || '入门';
              const badges = Array.isArray(readmeDraft.badges) ? readmeDraft.badges : [];
              
              rebuiltList.push({
                username: displayUsername,
                platform,
                nickname,
                avatar,
                score,
                rating,
                badges,
                updatedAt: cacheEntry.cachedAt || Date.now(),
              });
            }
        } catch (err) {
          logger.error({ event: 'leaderboard.rebuild.item_error', platform, username, error: String(err) });
        }
      }
    }

    // Sort by score desc, then by updatedAt desc
    rebuiltList.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.updatedAt - a.updatedAt;
    });

    const sliced = rebuiltList.slice(0, 100);

    // Save index
    try {
      await store.setJSON(LEADERBOARD_KEY, sliced);
      logger.log({ event: 'leaderboard.rebuild.success', count: sliced.length });
    } catch (err) {
      logger.error({ event: 'leaderboard.save_index.error', error: String(err) });
    }

    return jsonResponse({ leaderboard: sliced });
  } catch (error: any) {
    logger.error({ event: 'leaderboard.rebuild.failed', error: String(error) });
    return jsonResponse({ error: error.message || String(error) }, 500);
  }
}
