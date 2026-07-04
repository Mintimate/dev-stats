import { getStore } from '@edgeone/pages-blob';
import { createLogger, jsonResponse } from './_shared';

const logger = createLogger('leaderboard-agent');
const CACHE_STORE_NAME = 'stats-agent-analysis-cache';
const leaderboardKey = 'leaderboard/readme_rankings.json';

export async function onRequest(context: any) {
  const store = getStore(CACHE_STORE_NAME);
  const body = context.request?.body ?? {};
  const forceRebuild = body.rebuild === true;

  let leaderboard: any[] = [];
  let indexExists = false;

  // 1. Try reading the compiled index if not forcing a rebuild
  if (!forceRebuild) {
    try {
      const entry = await store.get(leaderboardKey, { type: 'json' });
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
    const cacheKeys = blobs.filter(b => {
      const parts = b.key.split('/');
      return parts.length === 4 && parts[0] === 'analysis' && parts[3] === 'readme.json';
    });
    cacheKeysCount = cacheKeys.length;
  } catch (err) {
    logger.error({ event: 'leaderboard.list_keys.error', error: String(err) });
  }

  // 3. Rebuild if forced, or index does not exist, or index count is different from actual cache count
  const needsRebuild = forceRebuild || !indexExists || leaderboard.length === 0 || leaderboard.length !== cacheKeysCount;

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

    for (const blob of blobsList) {
      const parts = blob.key.split('/');
      // key structure: analysis/${platform}/${username}/readme.json
      if (parts.length === 4 && parts[0] === 'analysis' && parts[3] === 'readme.json') {
        const platform = parts[1];
        const username = parts[2];
        try {
          const cacheEntry: any = await store.get(blob.key, { type: 'json' });
          if (cacheEntry && Array.isArray(cacheEntry.events)) {
            let readmeDraft: any = null;
            let userProfile: any = null;
            for (const raw of cacheEntry.events) {
              if (raw.startsWith('data: ')) {
                const jsonStr = raw.slice(6).trim();
                try {
                  const parsed = JSON.parse(jsonStr);
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
                  // ignore
                }
              }
            }

            if (readmeDraft) {
              const nickname = userProfile?.nickname || readmeDraft.user?.nickname || readmeDraft.user?.name || username;
              let avatar = userProfile?.avatar || readmeDraft.user?.avatar || '';
              let displayUsername = username;

              // Local extraction from title first (case-sensitive)
              if (readmeDraft.title && readmeDraft.title.toLowerCase().startsWith(username.toLowerCase())) {
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
          }
        } catch (err) {
          logger.error({ event: 'leaderboard.rebuild.item_error', key: blob.key, error: String(err) });
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
      await store.setJSON(leaderboardKey, sliced);
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
