import OpenAI from 'openai';
import {
  Agent,
  OpenAIChatCompletionsModel,
  run,
  type ModelSettings,
  type RunStreamEvent,
  type Session,
} from '@openai/agents';
import { getStore } from '@edgeone/pages-blob';
import { resolveModelName } from '../_model';
import { createLogger, createSSEResponse, getGitHubToken, jsonResponse, sseEvent, truncateText } from '../_shared';
import {
  buildCacheKey as buildCacheKeyShared,
  CACHE_STORE_NAME,
  extractReadmeFromEvents,
  getCacheExpiresAt,
  LEADERBOARD_KEY,
  parseAnalysisCacheKey,
  readCompatibleAnalysisCacheFromStore,
  resolveGitHubLogin,
  resolveAnalysisCacheTtlMs,
  type CacheEntry,
} from '../_cache';
import { buildSystemPrompt, buildUserInput } from './_prompt';
import { createOpenAIAgentTools } from './_tools';

const logger = createLogger('stats-agent');

interface FrontendState {
  platform?: string;
  username?: string;
  agent_mode?: string;
}

const QWEN_THINKING_MODEL_SETTINGS: ModelSettings = {
  providerData: {
    chat_template_kwargs: {
      enable_thinking: false,
    },
    thinking_token_budget: 512,
  },
};

const AGENT_MAX_TURNS = 12;

async function readCompatibleAnalysisCache(platform: string, username: string, mode: string, cacheTtlMs: number): Promise<CacheEntry | null> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const result = await readCompatibleAnalysisCacheFromStore(store, platform, username, mode, cacheTtlMs);
    return result?.entry ?? null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, events: string[], cacheTtlMs: number): Promise<void> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const cachedAt = Date.now();
    const entry: CacheEntry = { cachedAt, expiresAt: getCacheExpiresAt(cachedAt, undefined, cacheTtlMs), events };
    await store.setJSON(key, entry);
  } catch {
    // Cache write failures are non-fatal
  }
}

async function updateLeaderboard(platform: string, username: string, events: string[], cacheTtlMs: number): Promise<void> {
  try {
    const { readmeDraft, userProfile } = extractReadmeFromEvents(events);
    if (!readmeDraft) return;

    const store = getStore(CACHE_STORE_NAME);
    let leaderboard: any[] = [];

    try {
      const entry = await store.get(LEADERBOARD_KEY, { type: 'json', consistency: 'strong' });
      if (Array.isArray(entry)) {
        leaderboard = entry;
      }
    } catch {
      // ignore
    }

    const nickname = userProfile?.nickname || readmeDraft.user?.nickname || readmeDraft.user?.name || username;
    // 优先使用平台 API 校验时捕获的“权威大小写”用户名（写入 user_profile.username），
    // 而不是访客提交表单时的原始大小写，避免同一账号在榜单里因为大小写不同被当成两条记录、
    // 或者展示出和平台真实用户名不一致的大小写。旧缓存没有该字段时回退到原始 username。
    let canonicalUsername = userProfile?.username || username;
    if (platform === 'github') {
      canonicalUsername = await resolveGitHubLogin(canonicalUsername);
    }
    let avatar = userProfile?.avatar || readmeDraft.user?.avatar || '';
    if (avatar && !avatar.startsWith('http') && platform === 'cnb') {
      avatar = `https://cnb.cool${avatar.startsWith('/') ? '' : '/'}${avatar}`;
    }
    if (!avatar) {
      avatar = platform === 'cnb'
        ? `https://cnb.cool/users/${encodeURIComponent(canonicalUsername)}/avatar/s`
        : `https://github.com/${encodeURIComponent(canonicalUsername)}.png`;
    }

    let displayUsername = canonicalUsername;
    if (platform === 'cnb' && avatar) {
      const match = avatar.match(/\/users\/([^/]+)/);
      if (match) displayUsername = match[1];
    }

    const score = typeof readmeDraft.score === 'number' ? readmeDraft.score : 60;
    const rating = readmeDraft.objective_rating || '入门';
    const badges = Array.isArray(readmeDraft.badges) ? readmeDraft.badges : [];

    const updatedAt = Date.now();
    const rankItem = {
      username: displayUsername,
      platform,
      nickname,
      avatar,
      score,
      rating,
      badges,
      updatedAt,
      expiresAt: getCacheExpiresAt(updatedAt, undefined, cacheTtlMs),
    };

    // Remove existing entry for same user and platform.
    // Use case-insensitive match for both platforms: CNB doesn't allow two accounts
    // with the same name differing only in case, and this also cleans up any legacy
    // lowercase entries written by an older version of the code.
    leaderboard = leaderboard.filter(
      (item) => !(item.platform === platform && item.username.toLowerCase() === canonicalUsername.toLowerCase())
    );

    // Add new entry
    leaderboard.push(rankItem);

    // Sort by score desc, then by updatedAt desc
    leaderboard.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.updatedAt - a.updatedAt;
    });

    // Keep top 100
    if (leaderboard.length > 100) {
      leaderboard = leaderboard.slice(0, 100);
    }

    await store.setJSON(LEADERBOARD_KEY, leaderboard);
    logger.log({ event: 'leaderboard.update.success', platform, username: canonicalUsername, score });
  } catch (err) {
    logger.error({ event: 'leaderboard.update.error', platform, username, error: String(err) });
  }
}

async function deleteCache(key: string): Promise<void> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    await store.delete(key);
  } catch {
    // ignore
  }
}

async function deleteAnalysisCachesForUser(platform: string, username: string): Promise<void> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const normalized = username.toLowerCase();
    const { blobs } = await store.list();
    await Promise.all(
      blobs
        .map((blob: any) => blob.key)
        .filter((key: string) => {
          const parsed = parseAnalysisCacheKey(key);
          return parsed && parsed.platform === platform && parsed.mode === 'readme' && parsed.username.toLowerCase() === normalized;
        })
        .map((key: string) => store.delete(key).catch(() => undefined)),
    );
  } catch {
    // ignore
  }
}

async function removeFromLeaderboard(platform: string, username: string): Promise<void> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    let leaderboard: any[] = [];
    try {
      const entry = await store.get(LEADERBOARD_KEY, { type: 'json', consistency: 'strong' });
      if (Array.isArray(entry)) {
        leaderboard = entry;
      }
    } catch {
      return;
    }

    // Case-insensitive match for both platforms (see updateLeaderboard for rationale)
    const filtered = leaderboard.filter(
      (item) => !(item.platform === platform && item.username.toLowerCase() === username.toLowerCase())
    );

    if (filtered.length !== leaderboard.length) {
      await store.setJSON(LEADERBOARD_KEY, filtered);
      logger.log({ event: 'leaderboard.remove.success', platform, username });
    }
  } catch (err) {
    logger.error({ event: 'leaderboard.remove.error', platform, username, error: String(err) });
  }
}

/** Minimal type definition for the EdgeOne Makers agent request context. */
interface AgentContext {
  request?: {
    body?: Record<string, unknown>;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  };
  env?: Record<string, string | undefined>;
  tracer?: {
    span: (name: string, fn: (...args: any[]) => any, attrs?: Record<string, unknown>) => any;
    startSpan: (name: string, attrs?: Record<string, unknown>) => any;
    setAttributes: (attrs: Record<string, unknown>) => void;
  };
  sandbox?: { browser?: any };
  store?: { openaiSession: (id: string) => any };
  conversation_id?: string;
  run_id?: string;
  waitUntil?: (promise: Promise<unknown>) => void;
  utils?: { abortActiveRun?: (id: string) => any };
}

export async function onRequest(context: AgentContext) {
  const body = context.request?.body ?? {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const state = body.state ?? {};
  const forceReanalyze = body.force_reanalyze === true;
  const signal = context.request?.signal as AbortSignal | undefined;
  const headers = context.request?.headers ?? {};
  const conversationId =
    (context.conversation_id as string | undefined) ||
    headers['makers-conversation-id'] ||
    headers['Makers-Conversation-Id'] ||
    headers['MAKERS-CONVERSATION-ID'];
  const runId = String(context.run_id || body.run_id || conversationId || '');

  // Attach general trace attributes so the console can filter/aggregate spans
  // by session. Without these, auto-collected OpenInference spans are orphaned
  // from the Traces panel's run_id / conversation_id filter dimensions.
  context.tracer?.setAttributes({
    'agent.run_id': runId || conversationId || 'unknown',
    'agent.conversation_id': conversationId || 'unknown',
    'agent.route_path': '/chat',
  });

  if (!message) return jsonResponse({ error: "'message' is required" }, 400);
  if (!conversationId) return jsonResponse({ error: "Missing required 'makers-conversation-id' header" }, 400);

  const env = (context.env ?? {}) as Record<string, string | undefined>;
  if (!env.AI_GATEWAY_API_KEY || !env.AI_GATEWAY_BASE_URL) {
    return jsonResponse({ error: 'Missing AI_GATEWAY_API_KEY or AI_GATEWAY_BASE_URL' }, 500);
  }

  const frontendState = (state ?? {}) as FrontendState;
  const agentMode = frontendState.agent_mode === 'stats' ? 'stats' : 'readme';
  const platform = frontendState.platform || 'github';
  const username = frontendState.username || '';
  const cacheKey = buildCacheKeyShared(platform, username, agentMode);
  const cacheTtlMs = resolveAnalysisCacheTtlMs(env);

  // Enrich the root span with business context now that platform/username/mode are known.
  // These attrs allow filtering Traces by user or mode in the console panel.
  // We initialize cache.hit to false and execution_type to full_run by default.
  context.tracer?.setAttributes({
    'user.platform': platform,
    'user.username': username,
    'agent.mode': agentMode,
    'agent.force_reanalyze': forceReanalyze,
    'cache.key': cacheKey,
    'cache.hit': false,
    'agent.execution_type': 'full_run',
  });

  // --- Cache read: skip if force_reanalyze ---
  if (!forceReanalyze) {
    const cached = await (context.tracer
      ? context.tracer.span(
        'cache.lookup',
        async (span: any) => {
          const res = await readCompatibleAnalysisCache(platform, username, agentMode, cacheTtlMs);
          span.setAttributes({ 'cache.hit': !!res });
          return res;
        },
        { 'cache.key': cacheKey, 'agent.mode': agentMode },
      )
      : readCompatibleAnalysisCache(platform, username, agentMode, cacheTtlMs));
    if (cached) {
      // Mark root span as cache hit
      context.tracer?.setAttributes({
        'cache.hit': true,
        'agent.execution_type': 'cache_hit',
      });
      logger.log({
        event: 'agent.cache.hit',
        route: '/chat',
        cache_key: cacheKey,
        cached_at: new Date(cached.cachedAt).toISOString(),
      });
      // Sync casing updates on cache hit; use waitUntil if available to avoid blocking SSE first frame
      const leaderboardUpdate = updateLeaderboard(platform, username, cached.events, cacheTtlMs);
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(leaderboardUpdate);
      } else {
        await leaderboardUpdate;
      }
      return createSSEResponse(async function* () {
        // Emit a cache-hit marker so the frontend knows it came from cache
        yield sseEvent({
          type: 'cache_hit',
          cached_at: cached.cachedAt,
          platform,
          username,
          mode: agentMode,
        });
        for (const raw of cached.events) {
          yield raw;
        }
      }, signal);
    }
  }

  // Capture tracer for use inside the SSE generator closure.
  const tracer = context.tracer;

  return createSSEResponse(async function* () {
    const sseQueue: string[] = [];
    const collectedEvents: string[] = []; // for writing to cache
    const startedAt = Date.now();
    const modelName = resolveModelName(env);
    let assistantText = '';
    let emittedReadmeDraft = false;
    let emittedStatsRecipe = false;
    let agentRunSpan: any = null;
    let agentRunSpanEnded = false;
    let prefetchedProfile: Record<string, unknown> | undefined;
    let lastCNBInspect: Record<string, any> | null = null;

    logger.log({
      event: 'agent.run.start',
      route: '/chat',
      conversation_id: conversationId,
      run_id: runId,
      platform: frontendState.platform,
      username: frontendState.username,
      agent_mode: frontendState.agent_mode,
      framework: 'openai-agents-sdk',
      model: modelName,
      tools_enabled: true,
      sandbox_enabled: Boolean(context.sandbox),
      thinking_enabled: false,
      thinking_token_budget: 512,
      force_reanalyze: forceReanalyze,
    });

    // Helper to yield AND collect for cache
    function* yieldAndCollect(chunk: string): Generator<string> {
      collectedEvents.push(chunk);
      yield chunk;
    }

    try {
      const statusChunk = sseEvent({
        type: 'agent_status',
        status: 'model_ready',
        model: '腾讯云 TDP 社区模型',
        protocol: 'openai_agents_sdk',
        tools_enabled: true,
        thinking_enabled: false,
        thinking_token_budget: 512,
      });
      yield* yieldAndCollect(statusChunk);

      const thinkingChunk = sseEvent({ type: 'thinking', content: '正在启动 OpenAI Agents SDK，并通过框架工具流执行公开资料分析...' });
      yield* yieldAndCollect(thinkingChunk);

      // Verify user existence first to fail-fast and save tokens
      const checkThinkingChunk = sseEvent({ type: 'thinking', content: `正在验证 ${platform === 'github' ? 'GitHub' : 'CNB'} 用户 "${username}" 是否存在...` });
      yield* yieldAndCollect(checkThinkingChunk);

      // Span: user existence validation — records timing, outcome, and whether the user exists.
      const validateSpan = tracer?.startSpan('user.validate', {
        'user.platform': platform,
        'user.username': username,
      });
      const gitHubToken = getGitHubToken(env);
      try {
        if (platform === 'github') {
          const headers: Record<string, string> = { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' };
          if (gitHubToken) {
            headers['Authorization'] = `token ${gitHubToken}`;
          }
          const checkResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
            signal,
            headers
          });
          if (checkResponse.status === 404) {
            validateSpan?.setAttributes({ 'user.exists': false, 'http.status_code': 404 });
            throw new Error(`GitHub 用户 "${username}" 不存在 (404)，请检查拼写是否正确。`);
          }
          if (checkResponse.ok) {
            const profile = await checkResponse.json();
            validateSpan?.setAttributes({
              'user.exists': true,
              'user.display_name': String(profile.name || profile.login || username),
              'user.followers': Number(profile.followers ?? 0),
              'user.public_repos': Number(profile.public_repos ?? 0),
              'http.status_code': checkResponse.status,
            });
            // Store prefetched profile to avoid duplicate API call in inspect_github_user tool
            prefetchedProfile = profile;
            const profileChunk = sseEvent({
              type: 'user_profile',
              content: JSON.stringify({
                // profile.login 是 GitHub API 返回的权威大小写，不同于访客表单里随意输入的大小写，
                // 持久化后供排行榜、独立用户页等场景统一使用，避免同一账号因大小写不一致而展示不一致。
                username: profile.login || username,
                nickname: profile.name || profile.login || username,
                bio: profile.bio || '这位开发者很低调，什么都没有留下。',
                avatar: profile.avatar_url || ''
              })
            });
            yield* yieldAndCollect(profileChunk);
          }
        } else if (platform === 'cnb') {
          const headers: Record<string, string> = {
            'Accept': 'application/vnd.cnb.web+json',
            'User-Agent': 'EdgeOne-Stats-Agent/1.0'
          };
          const checkResponse = await fetch(`https://cnb.cool/users/${encodeURIComponent(username)}`, {
            signal,
            headers
          });
          if (checkResponse.status === 404) {
            validateSpan?.setAttributes({ 'user.exists': false, 'http.status_code': 404 });
            throw new Error(`CNB 用户 "${username}" 不存在 (404)。请注意：CNB 用户名区分大小写，请检查输入。`);
          }
          if (checkResponse.ok) {
            const profile = await checkResponse.json();
            validateSpan?.setAttributes({
              'user.exists': true,
              'user.display_name': String(profile.nickname || profile.username || username),
              'user.followers': Number(profile.follower_count ?? 0),
              'user.public_repos': Number(profile.public_repo_count ?? 0),
              'http.status_code': checkResponse.status,
            });
            const profileChunk = sseEvent({
              type: 'user_profile',
              content: JSON.stringify({
                // profile.username 是 CNB API 返回的权威大小写（CNB 用户名区分大小写）。
                username: profile.username || username,
                nickname: profile.nickname || profile.username || username,
                bio: profile.bio || '这位开发者很低调，什么都没有留下。',
                avatar: profile.avatar || ''
              })
            });
            yield* yieldAndCollect(profileChunk);
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes('不存在 (404)')) {
          validateSpan?.end();
          throw err;
        }
        validateSpan?.setAttributes({ 'user.validate_bypassed': true, 'error.message': err.message || String(err) });
        logger.log({
          event: 'agent.run.validation_bypass',
          message: 'User validation bypassed due to network or rate limit',
          error: err.message || String(err)
        });
      } finally {
        validateSpan?.end();
      }

      const llmClient = new OpenAI({
        apiKey: env.AI_GATEWAY_API_KEY,
        baseURL: normalizeOpenAIBaseUrl(env.AI_GATEWAY_BASE_URL || ''),
      });
      const model = new OpenAIChatCompletionsModel(llmClient, modelName);
      const tools = createOpenAIAgentTools({
        sseQueue,
        signal,
        sandbox: context.sandbox,
        tracer,
        prefetchedProfile,
        env,
      });

      const agent = new Agent({
        name: 'Stats Agent',
        instructions: buildSystemPrompt(),
        model,
        modelSettings: QWEN_THINKING_MODEL_SETTINGS,
        tools,
        toolUseBehavior: resolveToolUseBehavior(agentMode),
      });

      const session: Session | undefined =
        context.store && conversationId
          ? context.store.openaiSession(conversationId)
          : undefined;

      // Span: agent run — covers the full LLM inference + tool-call loop.
      // OpenInference auto-generates nested LLM + tool child spans inside this span.
      // We add business attrs so each turn is linkable to user/mode/model in the Traces panel.
      agentRunSpan = tracer?.startSpan('agent.run', {
        'agent.framework': 'openai-agents-sdk',
        'agent.model': modelName,
        'agent.mode': agentMode,
        'agent.max_turns': AGENT_MAX_TURNS,
        'user.platform': platform,
        'user.username': username,
      });
      let agentTurns = 0;

      const result = await run(agent, buildUserInput(message, state), {
        stream: true,
        signal,
        session,
        maxTurns: AGENT_MAX_TURNS,
      });

      let lastTotalTokens = 0;
      let lastRawResponsesLen = 0;
      let lastUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      for await (const event of result.toStream()) {
        if (signal?.aborted) break;
        const toolOutput = extractToolOutput(event);
        if (toolOutput?.name === 'inspect_cnb_user') {
          const parsed = parseMaybeJson(toolOutput.output);
          if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).ok) {
            lastCNBInspect = parsed as Record<string, any>;
          }
        }
        for (const sideEffect of drainSseQueue(sseQueue)) {
          if (sideEffect.includes('"type":"readme_draft"')) emittedReadmeDraft = true;
          if (sideEffect.includes('"type":"stats_recipe"')) emittedStatsRecipe = true;
          yield* yieldAndCollect(sideEffect);
        }
        const mapped = mapAgentEvent(event);
        for (const item of mapped) {
          if (item.type === 'ai_response') assistantText += String(item.content || '');
          // Count agent turns for the run span summary attribute
          if (item.type === 'agent_status' && item.status === 'agent_updated') agentTurns++;
          const chunk = sseEvent(item);
          yield* yieldAndCollect(chunk);
        }

        // 增量计算 usage：仅在 rawResponses 长度变化时重新汇总，避免 O(n²) 遍历。
        if (result.rawResponses.length !== lastRawResponsesLen) {
          lastRawResponsesLen = result.rawResponses.length;
          lastUsage = collectUsage(result.rawResponses);
          if (lastUsage.total_tokens > lastTotalTokens) {
            lastTotalTokens = lastUsage.total_tokens;
            const usageChunk = sseEvent({
              type: 'usage',
              input_tokens: lastUsage.input_tokens,
              output_tokens: lastUsage.output_tokens,
              total_tokens: lastUsage.total_tokens,
            });
            yield* yieldAndCollect(usageChunk);
          }
        }
      }

      agentRunSpan?.setAttributes({
        'agent.turns': agentTurns,
        'agent.emitted_readme': emittedReadmeDraft,
        'agent.emitted_stats': emittedStatsRecipe,
        'llm.token.total': lastUsage.total_tokens,
      });
      if (!agentRunSpanEnded) { agentRunSpan?.end(); agentRunSpanEnded = true; }

      for (const sideEffect of drainSseQueue(sseQueue)) {
        if (sideEffect.includes('"type":"readme_draft"')) emittedReadmeDraft = true;
        if (sideEffect.includes('"type":"stats_recipe"')) emittedStatsRecipe = true;
        yield* yieldAndCollect(sideEffect);
      }

      const finalToolEvent = eventFromFinalToolOutput(result.finalOutput, agentMode);
      if (finalToolEvent) {
        if (finalToolEvent.type === 'readme_draft' && !emittedReadmeDraft) {
          emittedReadmeDraft = true;
          yield* yieldAndCollect(sseEvent(finalToolEvent));
        }
        if (finalToolEvent.type === 'stats_recipe' && !emittedStatsRecipe) {
          emittedStatsRecipe = true;
          yield* yieldAndCollect(sseEvent(finalToolEvent));
        }
      }

      if (agentMode === 'readme' && !emittedReadmeDraft && platform === 'cnb' && lastCNBInspect) {
        const draft = sseEvent(createCNBReadmeDraftFromInspect(lastCNBInspect, username));
        emittedReadmeDraft = true;
        yield* yieldAndCollect(draft);
      }

      if (agentMode === 'readme' && !emittedReadmeDraft && assistantText.trim()) {
        const fallback = sseEvent(createFallbackReadmeDraft(assistantText, state));
        emittedReadmeDraft = true;
        yield* yieldAndCollect(fallback);
      }
      if (agentMode === 'stats' && !emittedStatsRecipe) {
        const finalChunk = sseEvent({ type: 'agent_status', status: 'finalizing', message: 'Stats recipe tool did not emit a structured recipe.' });
        yield* yieldAndCollect(finalChunk);
      }

      const usage = collectUsage(result.rawResponses);
      if (usage.total_tokens > 0) {
        const usageChunk = sseEvent({
          type: 'usage',
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          total_tokens: usage.total_tokens,
        });
        yield* yieldAndCollect(usageChunk);
      }

      logger.log({
        event: 'agent.run.finish',
        status: 'ok',
        route: '/chat',
        conversation_id: conversationId,
        run_id: runId,
        duration_ms: Date.now() - startedAt,
      });

      // Write to cache only on successful completion (has useful result)
      if (emittedReadmeDraft || emittedStatsRecipe) {
        // Span: cache write — shows serialization + Blob persistence latency
        await (tracer
          ? tracer.span(
            'cache.write',
            async (span: any) => {
              await writeCache(cacheKey, collectedEvents, cacheTtlMs);
              span.setAttributes({
                'cache.key': cacheKey,
                'cache.events_count': collectedEvents.length,
                'cache.mode': agentMode,
              });
              logger.log({ event: 'agent.cache.write', cache_key: cacheKey, events_count: collectedEvents.length });
            },
            { 'cache.key': cacheKey },
          )
          : writeCache(cacheKey, collectedEvents, cacheTtlMs).then(() =>
            logger.log({ event: 'agent.cache.write', cache_key: cacheKey, events_count: collectedEvents.length }),
          ));
        if (emittedReadmeDraft) {
          // Span: leaderboard update — shows scoring + Blob write latency
          await (tracer
            ? tracer.span(
              'leaderboard.update',
              () => updateLeaderboard(platform, username, collectedEvents, cacheTtlMs),
              { 'user.platform': platform, 'user.username': username },
            )
            : updateLeaderboard(platform, username, collectedEvents, cacheTtlMs));
          yield* yieldAndCollect(sseEvent({ type: 'leaderboard_updated', platform, username }));
        }
      }
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError' || signal?.aborted || err.message?.includes('terminated')) return;
      logger.error({
        event: 'agent.run.finish',
        status: 'error',
        route: '/chat',
        conversation_id: conversationId,
        run_id: runId,
        duration_ms: Date.now() - startedAt,
        error_name: err.name,
        error_message: err.message,
      });
      // Ensure the run span is closed on error path (guard against double-close)
      agentRunSpan?.setAttributes({ 'agent.error': true, 'agent.error_message': err.message });
      if (!agentRunSpanEnded) { agentRunSpan?.end(); agentRunSpanEnded = true; }
      // Clean up cache and rankings if the user is verified to be non-existent
      if (err.message && err.message.includes('不存在 (404)')) {
        await deleteCache(cacheKey);
        await deleteAnalysisCachesForUser(platform, username);
        await removeFromLeaderboard(platform, username);
        yield sseEvent({ type: 'leaderboard_updated', platform, username, removed: true });
      }
      yield sseEvent({ type: 'error_message', content: err.message });
    }
  }, signal);
}

function resolveToolUseBehavior(agentMode: 'readme' | 'stats') {
  const finalTool = agentMode === 'readme' ? 'compose_readme_draft' : 'compose_stats_recipe';
  return { stopAtToolNames: [finalTool] };
}

function mapAgentEvent(event: RunStreamEvent): Array<Record<string, unknown>> {
  if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta') {
    const delta = String(event.data.delta || '');
    if (!delta) return [];
    return [
      { type: 'ai_response', content: delta },
      { type: 'text_delta', delta, mirrored: true },
    ];
  }

  if (event.type === 'run_item_stream_event' && event.name === 'tool_called') {
    const item = event.item as any;
    const raw = item.rawItem ?? {};
    const name = item.name || item.toolName || raw.name;
    return name
      ? [
        { type: 'tool_called', name, input: parseMaybeJson(raw.arguments) },
        { type: 'tool_call', name, arguments: truncateText(raw.arguments ?? {}, 700) },
      ]
      : [];
  }

  if (event.type === 'run_item_stream_event' && event.name === 'tool_output') {
    const item = event.item as any;
    const raw = item.rawItem ?? {};
    const name = item.name || item.toolName || raw.name;
    const output = item.output ?? raw.output ?? '';
    return name
      ? [{ type: 'tool_result', name, content: truncateText(output, 900) }]
      : [];
  }

  if (event.type === 'agent_updated_stream_event') {
    return [{ type: 'agent_status', status: 'agent_updated', agent: event.agent?.name }];
  }

  return [];
}

function extractToolOutput(event: RunStreamEvent): { name: string; output: unknown } | null {
  if (event.type !== 'run_item_stream_event' || event.name !== 'tool_output') return null;
  const item = event.item as any;
  const raw = item?.rawItem ?? {};
  const name = item?.name || item?.toolName || raw.name;
  if (!name) return null;
  return { name: String(name), output: item?.output ?? raw.output ?? '' };
}

function normalizeOpenAIBaseUrl(value: string): string {
  return value
    .trim()
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/v1\/?$/, '/v1');
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function collectUsage(responses: any[]) {
  return responses.reduce(
    (acc, response) => {
      const usage = response?.usage ?? {};
      const input = usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? 0;
      const output = usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? 0;
      const total = usage.total_tokens ?? usage.totalTokens ?? input + output;
      acc.input_tokens += input;
      acc.output_tokens += output;
      acc.total_tokens += total;
      return acc;
    },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  );
}

function drainSseQueue(queue: string[]): string[] {
  const items = [];
  while (queue.length) items.push(queue.shift()!);
  return items;
}

function eventFromFinalToolOutput(finalOutput: unknown, agentMode: 'readme' | 'stats'): Record<string, unknown> | null {
  const parsed = parseMaybeJson(finalOutput);
  if (!parsed || typeof parsed !== 'object') return null;
  const payload = parsed as Record<string, unknown>;

  if (payload.type === 'readme_draft' || payload.type === 'stats_recipe') {
    return payload;
  }

  if (agentMode === 'readme' && payload.ok && typeof payload.markdown === 'string') {
    return { type: 'readme_draft', ...payload };
  }

  if (agentMode === 'stats' && payload.ok && payload.recipe && typeof payload.recipe === 'object') {
    return { type: 'stats_recipe', ...(payload.recipe as Record<string, unknown>) };
  }

  return null;
}

function createCNBReadmeDraftFromInspect(inspect: Record<string, any>, requestedUsername: string): Record<string, unknown> {
  const user = inspect.user ?? {};
  const totals = inspect.totals ?? {};
  const repos = Array.isArray(inspect.top_repos)
    ? inspect.top_repos
    : Array.isArray(inspect.repos)
      ? inspect.repos
      : [];
  const username = String(user.username || requestedUsername || 'CNBUser');
  const nickname = String(user.nickname || user.name || username);
  const repoCount = Number(totals.reported_repos ?? user.public_repo_count ?? repos.length ?? 0);
  const sampledRepos = Number(totals.sampled_repos ?? repos.length ?? 0);
  const stars = Number(totals.stars ?? user.stars_count ?? 0);
  const forks = Number(totals.forks ?? 0);
  const prs = Number(totals.pull_requests ?? 0);
  const commits = Number(totals.commits ?? 0);
  const issues = Number(totals.issues ?? 0);
  const activeDays = Number(totals.active_days ?? 0);
  const followers = Number(user.follower_count ?? 0);
  const topRepos = repos.slice(0, 6).map((repo: any) => ({
    name: String(repo.path || repo.name || ''),
    stars: Number(repo.star_count ?? repo.mark_count ?? 0),
    contributions_desc: `Owner · ${Number(repo.fork_count ?? 0)} forks${repo.language ? ` · ${repo.language}` : ''}`,
  })).filter((repo: any) => repo.name);
  const languages = Array.isArray(totals.languages)
    ? totals.languages.map((item: any) => item.language).filter(Boolean).slice(0, 5)
    : [];
  const flagship = topRepos[0];
  const score = Math.min(94, Math.max(62, 58 + Math.min(18, repoCount) + Math.min(10, stars / 3) + Math.min(8, forks / 5) + Math.min(8, prs / 5) + Math.min(6, followers / 10)));
  const rating = score >= 90 ? '夯' : score >= 80 ? '顶流' : score >= 70 ? '高级' : '平庸';
  const dimension = {
    maturity: clampScore(10 + Math.min(8, repoCount / 3) + (user.verified ? 2 : 0)),
    original_projects: clampScore(8 + Math.min(10, topRepos.length * 2) + Math.min(2, stars / 20)),
    contributions: clampScore(8 + Math.min(8, prs / 4) + Math.min(4, commits / 50)),
    influence: clampScore(7 + Math.min(7, stars / 5) + Math.min(4, forks / 8) + Math.min(2, followers / 20)),
    activity: clampScore(8 + Math.min(10, activeDays / 8) + Math.min(2, commits / 100)),
    community: clampScore(7 + Math.min(8, followers / 8) + Math.min(5, issues / 4)),
  };
  const markdown = [
    `# ${nickname}`,
    '',
    `> CNB: [@${username}](https://cnb.cool/u/${encodeURIComponent(username)})`,
    '',
    `公开资料显示，${nickname} 在 CNB 上有 ${repoCount} 个公开仓库，本次采样到 ${sampledRepos} 个仓库，累计约 ${stars} stars / marks、${forks} forks。${flagship ? `代表项目包括 **${flagship.name}**。` : ''}`,
    '',
    '## 项目亮点',
    '',
    ...(topRepos.length
      ? topRepos.map((repo: any) => `- [${repo.name}](https://cnb.cool/${repo.name}) · ${repo.stars} stars/marks · ${repo.contributions_desc}`)
      : ['- 暂未采样到公开仓库列表，但用户主页资料可继续补充。']),
    '',
    '## 技术栈',
    '',
    languages.length ? languages.map((lang: string) => `- ${lang}`).join('\n') : '- CNB 公开数据未提供明确语言分布',
    '',
    '## CNB Stats',
    '',
    `![CNB Stats](/api?platform=cnb&username=${encodeURIComponent(username)}&show_icons=true)`,
    '',
    `![CNB Languages](/api/top-langs?platform=cnb&username=${encodeURIComponent(username)}&layout=compact)`,
  ].join('\n');

  return {
    type: 'readme_draft',
    ok: true,
    title: `${username} README Draft`,
    markdown,
    summary: `${nickname} 的 CNB 资料已基于公开 API 汇总：${repoCount} 个公开仓库、${stars} stars/marks、${forks} forks。`,
    promotional_summary: `${nickname} 活跃于 CNB 生态，公开仓库覆盖 ${languages.length ? languages.join('、') : '多个技术方向'}，具备持续产出和项目沉淀。`,
    objective_rating: rating,
    objective_summary: `基于 CNB 公开数据，该账号拥有 ${repoCount} 个公开仓库，本次采样 ${sampledRepos} 个，累计 ${stars} stars/marks、${forks} forks；${activeDays ? `今年有 ${activeDays} 个活跃日，` : ''}${prs || commits ? `公开活动包含 ${commits} commits 与 ${prs} PR。` : '活动数据较有限。'}整体不应判定为空白账号。`,
    roast_summary: `这位不是“什么都没有留下”，只是 CNB 的公开数据得认真捞。仓库、fork 和活动都摆在那儿，直接说空白账号属于工具没戴眼镜。`,
    score: Number(score.toFixed(2)),
    badges: ['#CNB开发者', flagship ? '#项目沉淀型选手' : '#公开资料可挖', languages[0] ? `#${languages[0]}玩家` : '#开源观察中'],
    dimension_scores: dimension,
    top_repos: topRepos,
  };
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(20, Math.round(value)));
}

function createFallbackReadmeDraft(text: string, state: unknown): Record<string, unknown> {
  const config = (state ?? {}) as FrontendState;
  const username = config.username || 'User';
  const markdown = text.trim() || `# ${username}\n\n正在整理公开资料，暂未生成完整 README。`;
  return {
    type: 'readme_draft',
    ok: true,
    title: `${username} README Draft`,
    markdown,
    summary: '模型未触发结构化 README 工具，已将最终文本包装为 README 草稿。',
    promotional_summary: compactText(markdown, 180) || `${username} 的个人主页资料已经整理，可继续补充项目亮点与技术栈。`,
    objective_rating: '入门',
    objective_summary: '本次未拿到完整结构化评估，只能基于最终文本做保守判断；建议补充更多公开项目、贡献记录和 README 叙事后再评估。',
    roast_summary: '这位大佬比较低调，模型没能触发结构化工具，毒舌能量蓄力失败。',
    score: 60.00,
    badges: ['#低调开发者', '#极客探险家'],
    dimension_scores: {
      maturity: 12,
      original_projects: 12,
      contributions: 12,
      influence: 12,
      activity: 12,
      community: 12,
    },
    top_repos: [],
  };
}

function compactText(value: string, maxLength: number): string {
  const text = value.replace(/[#>*_`[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}
