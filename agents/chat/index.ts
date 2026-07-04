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
import { createLogger, createSSEResponse, jsonResponse, sseEvent, truncateText } from '../_shared';
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

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_STORE_NAME = 'stats-agent-analysis-cache';

interface CacheEntry {
  cachedAt: number;
  events: string[]; // raw SSE line strings collected during the run
}

function buildCacheKey(platform: string, username: string, mode: string): string {
  const safePlatform = (platform || 'github').toLowerCase().replace(/[^a-z0-9]/g, '');
  // CNB usernames are case-sensitive; GitHub is case-insensitive — normalize only for GitHub
  const rawUsername = username || '';
  const safeUsername = safePlatform === 'cnb'
    ? rawUsername.replace(/[^a-zA-Z0-9_.-]/g, '')
    : rawUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const safeMode = (mode || 'readme').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `analysis/${safePlatform}/${safeUsername}/${safeMode}.json`;
}

async function readCache(key: string): Promise<CacheEntry | null> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const entry = await store.get(key, { type: 'json' }) as CacheEntry | null;
    if (!entry || typeof entry.cachedAt !== 'number') return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(key: string, events: string[]): Promise<void> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const entry: CacheEntry = { cachedAt: Date.now(), events };
    await store.setJSON(key, entry);
  } catch {
    // Cache write failures are non-fatal
  }
}

async function updateLeaderboard(platform: string, username: string, events: string[]): Promise<void> {
  try {
    let readmeDraft: any = null;
    let userProfile: any = null;

    for (const raw of events) {
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

    if (!readmeDraft) return;

    const store = getStore(CACHE_STORE_NAME);
    const leaderboardKey = 'leaderboard/readme_rankings.json';
    let leaderboard: any[] = [];

    try {
      const entry = await store.get(leaderboardKey, { type: 'json' });
      if (Array.isArray(entry)) {
        leaderboard = entry;
      }
    } catch {
      // ignore
    }

    const nickname = userProfile?.nickname || readmeDraft.user?.nickname || readmeDraft.user?.name || username;
    let avatar = userProfile?.avatar || readmeDraft.user?.avatar || '';
    if (avatar && !avatar.startsWith('http') && platform === 'cnb') {
      avatar = `https://cnb.cool${avatar.startsWith('/') ? '' : '/'}${avatar}`;
    }
    if (!avatar) {
      avatar = platform === 'cnb'
        ? `https://cnb.cool/users/${encodeURIComponent(username)}/avatar/s`
        : `https://github.com/${encodeURIComponent(username)}.png`;
    }

    let displayUsername = username;
    if (platform === 'cnb' && avatar) {
      const match = avatar.match(/\/users\/([^/]+)/);
      if (match) displayUsername = match[1];
    }

    const score = typeof readmeDraft.score === 'number' ? readmeDraft.score : 60;
    const rating = readmeDraft.objective_rating || '入门';
    const badges = Array.isArray(readmeDraft.badges) ? readmeDraft.badges : [];

    const rankItem = {
      username: displayUsername,
      platform,
      nickname,
      avatar,
      score,
      rating,
      badges,
      updatedAt: Date.now(),
    };

    // Remove existing entry for same user and platform.
    // Use case-insensitive match for both platforms: CNB doesn't allow two accounts
    // with the same name differing only in case, and this also cleans up any legacy
    // lowercase entries written by an older version of the code.
    leaderboard = leaderboard.filter(
      (item) => !(item.platform === platform && item.username.toLowerCase() === username.toLowerCase())
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

    await store.setJSON(leaderboardKey, leaderboard);
    logger.log({ event: 'leaderboard.update.success', platform, username, score });
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

async function removeFromLeaderboard(platform: string, username: string): Promise<void> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const leaderboardKey = 'leaderboard/readme_rankings.json';
    let leaderboard: any[] = [];
    try {
      const entry = await store.get(leaderboardKey, { type: 'json' });
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
      await store.setJSON(leaderboardKey, filtered);
      logger.log({ event: 'leaderboard.remove.success', platform, username });
    }
  } catch (err) {
    logger.error({ event: 'leaderboard.remove.error', platform, username, error: String(err) });
  }
}

export async function onRequest(context: any) {
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
  const cacheKey = buildCacheKey(platform, username, agentMode);

  // --- Cache read: skip if force_reanalyze ---
  if (!forceReanalyze) {
    const cached = await readCache(cacheKey);
    if (cached) {
      logger.log({
        event: 'agent.cache.hit',
        route: '/chat',
        cache_key: cacheKey,
        cached_at: new Date(cached.cachedAt).toISOString(),
      });
      // Sync casing updates on cache hit; use waitUntil if available to avoid blocking SSE first frame
      const leaderboardUpdate = updateLeaderboard(platform, username, cached.events);
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

  return createSSEResponse(async function* () {
    const sseQueue: string[] = [];
    const collectedEvents: string[] = []; // for writing to cache
    const startedAt = Date.now();
    const modelName = resolveModelName(env);
    let assistantText = '';
    let emittedReadmeDraft = false;
    let emittedStatsRecipe = false;

    logger.log({
      event: 'agent.run.start',
      route: '/chat',
      conversation_id: conversationId,
      run_id: runId,
      platform: state?.platform,
      username: state?.username,
      agent_mode: state?.agent_mode,
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
        model: modelName,
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

      try {
        if (platform === 'github') {
          const checkResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
            signal,
            headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' }
          });
          if (checkResponse.status === 404) {
            throw new Error(`GitHub 用户 "${username}" 不存在 (404)，请检查拼写是否正确。`);
          }
          if (checkResponse.ok) {
            const profile = await checkResponse.json();
            const profileChunk = sseEvent({
              type: 'user_profile',
              content: JSON.stringify({
                nickname: profile.name || profile.login || username,
                bio: profile.bio || '这位开发者很低调，什么都没有留下。',
                avatar: profile.avatar_url || ''
              })
            });
            yield* yieldAndCollect(profileChunk);
          }
        } else if (platform === 'cnb') {
          const checkResponse = await fetch(`https://cnb.cool/users/${encodeURIComponent(username)}`, {
            signal,
            headers: {
              'Accept': 'application/vnd.cnb.web+json',
              'User-Agent': 'EdgeOne-Stats-Agent/1.0'
            }
          });
          if (checkResponse.status === 404) {
            throw new Error(`CNB 用户 "${username}" 不存在 (404)。请注意：CNB 用户名区分大小写，请检查输入。`);
          }
          if (checkResponse.ok) {
            const profile = await checkResponse.json();
            const profileChunk = sseEvent({
              type: 'user_profile',
              content: JSON.stringify({
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
          throw err;
        }
        logger.log({
          event: 'agent.run.validation_bypass',
          message: 'User validation bypassed due to network or rate limit',
          error: err.message || String(err)
        });
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

      const result = await run(agent, buildUserInput(message, state), {
        stream: true,
        signal,
        session,
        maxTurns: 8,
      });

      let lastTotalTokens = 0;
      for await (const event of result.toStream()) {
        if (signal?.aborted) break;
        for (const sideEffect of drainSseQueue(sseQueue)) {
          if (sideEffect.includes('"type":"readme_draft"')) emittedReadmeDraft = true;
          if (sideEffect.includes('"type":"stats_recipe"')) emittedStatsRecipe = true;
          yield* yieldAndCollect(sideEffect);
        }
        const mapped = mapAgentEvent(event);
        for (const item of mapped) {
          if (item.type === 'ai_response') assistantText += String(item.content || '');
          const chunk = sseEvent(item);
          yield* yieldAndCollect(chunk);
        }

        const usage = collectUsage(result.rawResponses);
        if (usage.total_tokens > lastTotalTokens) {
          lastTotalTokens = usage.total_tokens;
          const usageChunk = sseEvent({
            type: 'usage',
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
          });
          yield* yieldAndCollect(usageChunk);
        }
      }

      for (const sideEffect of drainSseQueue(sseQueue)) {
        if (sideEffect.includes('"type":"readme_draft"')) emittedReadmeDraft = true;
        if (sideEffect.includes('"type":"stats_recipe"')) emittedStatsRecipe = true;
        yield* yieldAndCollect(sideEffect);
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
        await writeCache(cacheKey, collectedEvents);
        logger.log({ event: 'agent.cache.write', cache_key: cacheKey, events_count: collectedEvents.length });
        if (emittedReadmeDraft) {
          await updateLeaderboard(platform, username, collectedEvents);
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
      // Clean up cache and rankings if the user is verified to be non-existent
      if (err.message && err.message.includes('不存在 (404)')) {
        await deleteCache(cacheKey);
        await removeFromLeaderboard(platform, username);
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
