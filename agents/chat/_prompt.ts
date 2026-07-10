import { buildSkillInstructions } from './_skill';

export function buildSystemPrompt(): string {
  return buildSkillInstructions();
}

export function buildUserInput(message: string, state: unknown): string {
  // Whitelist known fields to avoid leaking arbitrary frontend state into the LLM context.
  const raw = (state ?? {}) as Record<string, unknown>;
  const safeState: Record<string, unknown> = {};
  const allowedKeys = [
    'platform',
    'username',
    'agent_mode',
    'card',
    'theme',
    'repo',
    'layout',
    'langs_count',
    'show_icons',
    'hide_border',
    'include_all_commits',
  ];
  for (const key of allowedKeys) {
    if (key in raw) safeState[key] = raw[key];
  }

  return [
    message,
    '',
    'Current frontend state:',
    JSON.stringify(safeState, null, 2),
  ].join('\n');
}
