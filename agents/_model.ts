const DEFAULT_MODEL = '@makers/deepseek-v4-flash';

export function resolveModelName(env: Record<string, string | undefined> | undefined): string {
  return env?.AI_GATEWAY_MODEL || DEFAULT_MODEL;
}
