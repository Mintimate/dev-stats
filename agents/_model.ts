const DEFAULT_MODEL = '@makers/deepseek-v4-flash';

export function resolveModelName(env: Record<string, string | undefined> | undefined): string {
  return env?.AI_GATEWAY_MODEL || DEFAULT_MODEL;
}

export function collectGatewayEnv(env: Record<string, string | undefined> | undefined): Record<string, string> {
  const source = env ?? {};
  const result: Record<string, string> = {
    CLAUDE_CONFIG_DIR: '/tmp/claude-agent-sdk',
    CLAUDE_CODE_TMPDIR: '/tmp',
  };

  if (source.AI_GATEWAY_BASE_URL) result.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrl(source.AI_GATEWAY_BASE_URL);
  if (source.AI_GATEWAY_API_KEY) result.ANTHROPIC_API_KEY = source.AI_GATEWAY_API_KEY;
  result.ANTHROPIC_SMALL_FAST_MODEL = source.AI_GATEWAY_SMALL_MODEL || resolveModelName(source);
  if (source.ANTHROPIC_CUSTOM_HEADERS) result.ANTHROPIC_CUSTOM_HEADERS = source.ANTHROPIC_CUSTOM_HEADERS;

  return result;
}

function normalizeAnthropicBaseUrl(value: string): string {
  return value
    .trim()
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/responses\/?$/, '')
    .replace(/\/embeddings\/?$/, '')
    .replace(/\/messages\/?$/, '')
    .replace(/\/v1\/?$/, '');
}
