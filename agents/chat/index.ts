import { resolveModelName } from '../_model';
import { createLogger, createSSEResponse, jsonResponse, sseEvent, truncateText } from '../_shared';
import { buildSystemPrompt, buildUserInput } from './_prompt';
import { executeStatsTool, getAnthropicTools } from './_tools';

const logger = createLogger('stats-agent');

interface AnthropicContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

interface FrontendState {
  platform?: string;
  username?: string;
  agent_mode?: string;
}

interface ToolChoice {
  type: 'auto' | 'tool';
  name?: string;
}

export async function onRequest(context: any) {
  const body = context.request?.body ?? {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const state = body.state ?? {};
  const signal = context.request?.signal as AbortSignal | undefined;
  const headers = context.request?.headers ?? {};
  const conversationId =
    (context.conversation_id as string | undefined) ||
    headers['makers-conversation-id'] ||
    headers['Makers-Conversation-Id'] ||
    headers['MAKERS-CONVERSATION-ID'];

  if (!message) return jsonResponse({ error: "'message' is required" }, 400);
  if (!conversationId) return jsonResponse({ error: "Missing required 'makers-conversation-id' header" }, 400);

  const env = (context.env ?? {}) as Record<string, string | undefined>;
  if (!env.AI_GATEWAY_API_KEY || !env.AI_GATEWAY_BASE_URL) {
    return jsonResponse({ error: 'Missing AI_GATEWAY_API_KEY or AI_GATEWAY_BASE_URL' }, 500);
  }

  return createSSEResponse(async function* () {
    const sseQueue: string[] = [];
    try {
      yield sseEvent({ type: 'thinking', content: '正在使用配置的 Anthropic Messages 端点，并准备调用公开资料工具...' });
      const frontendState = (state ?? {}) as FrontendState;
      const agentMode = frontendState.agent_mode === 'stats' ? 'stats' : 'readme';
      let emittedStatsRecipe = false;
      let emittedReadmeDraft = false;

      const messages: AnthropicMessage[] = [
        {
          role: 'user',
          content: buildUserInput(message, state),
        },
      ];

      const profileUrl = homepageUrlForState(state);
      if (profileUrl) {
        const input = { url: profileUrl };
        yield sseEvent({ type: 'tool_call', name: 'browser_fetch', arguments: truncateText(input, 700) });
        const result = await executeStatsTool('browser_fetch', input, { sseQueue, signal });
        while (sseQueue.length) yield sseQueue.shift()!;
        yield sseEvent({ type: 'tool_result', name: 'browser_fetch', content: truncateText(result, 900) });
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Browser homepage observation for the current target (${profileUrl}):\n${JSON.stringify(result).slice(0, 9000)}`,
            },
          ],
        });
      }

      for (let turn = 0; turn < 5; turn += 1) {
        const response = await callMessagesApi(env, messages, signal);
        const content = Array.isArray(response.content) ? response.content as AnthropicContentBlock[] : [];

        const text = content
          .filter((block) => block.type === 'text' && block.text)
          .map((block) => block.text)
          .join('');
        if (text) yield sseEvent({ type: 'ai_response', content: text });

        const toolUses = content.filter((block) => block.type === 'tool_use' && block.name && block.id);
        if (toolUses.length === 0) {
          const usage = response.usage;
          if (usage) {
            const input = usage.input_tokens ?? 0;
            const output = usage.output_tokens ?? 0;
            yield sseEvent({ type: 'usage', input_tokens: input, output_tokens: output, total_tokens: input + output });
          }
          break;
        }

        messages.push({ role: 'assistant', content: content as unknown as Array<Record<string, unknown>> });
        const toolResults = [];

        for (const toolUse of toolUses) {
          if (signal?.aborted) break;
          const toolName = toolUse.name || 'tool';
          yield sseEvent({ type: 'tool_call', name: toolName, arguments: truncateText(toolUse.input ?? {}, 700) });
          try {
            const result = await executeStatsTool(toolName, toolUse.input ?? {}, { sseQueue, signal });
            if (toolName === 'compose_stats_recipe') emittedStatsRecipe = true;
            if (toolName === 'compose_readme_draft') emittedReadmeDraft = true;
            while (sseQueue.length) yield sseQueue.shift()!;
            yield sseEvent({ type: 'tool_result', name: toolName, content: truncateText(result, 900) });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            const err = error as Error;
            yield sseEvent({ type: 'tool_result', name: toolName, content: `Error: ${err.message}` });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ ok: false, error: err.message }),
              is_error: true,
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      }

      if (signal?.aborted) return;

      const finalTool = agentMode === 'readme' && !emittedReadmeDraft
        ? 'compose_readme_draft'
        : agentMode === 'stats' && !emittedStatsRecipe
          ? 'compose_stats_recipe'
          : '';

      if (finalTool) {
        const finalMessage = finalTool === 'compose_readme_draft'
          ? '必须现在调用 compose_readme_draft，输出完整个人 README Markdown。不要只输出文字说明。'
          : '必须现在调用 compose_stats_recipe，输出可应用到手动 Stats 面板的卡片组合和参数。不要只输出文字说明。';
        messages.push({ role: 'user', content: finalMessage });
        const response = await callMessagesApi(env, messages, signal, { type: 'tool', name: finalTool });
        const content = Array.isArray(response.content) ? response.content as AnthropicContentBlock[] : [];
        const toolUses = content.filter((block) => block.type === 'tool_use' && block.name && block.id);

        for (const toolUse of toolUses) {
          if (signal?.aborted) break;
          const toolName = toolUse.name || finalTool;
          yield sseEvent({ type: 'tool_call', name: toolName, arguments: truncateText(toolUse.input ?? {}, 700) });
          const result = await executeStatsTool(toolName, toolUse.input ?? {}, { sseQueue, signal });
          while (sseQueue.length) yield sseQueue.shift()!;
          yield sseEvent({ type: 'tool_result', name: toolName, content: truncateText(result, 900) });
        }
      }
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError' || signal?.aborted || err.message?.includes('terminated')) return;
      logger.error(err);
      yield sseEvent({ type: 'error_message', content: err.message });
    }
  }, signal);
}

async function callMessagesApi(
  env: Record<string, string | undefined>,
  messages: AnthropicMessage[],
  signal?: AbortSignal,
  toolChoice: ToolChoice = { type: 'auto' },
) {
  const response = await fetch(resolveMessagesEndpoint(env.AI_GATEWAY_BASE_URL || ''), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.AI_GATEWAY_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: resolveModelName(env),
      max_tokens: Number(env.AI_GATEWAY_MAX_TOKENS || 4096),
      system: buildSystemPrompt(),
      messages,
      tools: getAnthropicTools(),
      tool_choice: toolChoice,
    }),
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.message || text || `HTTP ${response.status}`;
    throw new Error(`API Error: ${response.status} ${message}`);
  }

  return json ?? {};
}

function resolveMessagesEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (trimmed.endsWith('/messages')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function homepageUrlForState(value: unknown): string {
  const state = (value ?? {}) as FrontendState;
  const username = typeof state.username === 'string' ? state.username.trim() : '';
  if (!username) return '';
  if (state.platform === 'cnb') return `https://cnb.cool/${encodeURIComponent(username)}`;
  return `https://github.com/${encodeURIComponent(username)}`;
}
