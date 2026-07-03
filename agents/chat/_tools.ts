import { sseEvent } from '../_shared';

const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';
const CNB_BASE = 'https://cnb.cool';

export const STATS_TOOL_NAMES = [
  'inspect_github_user',
  'fetch_github_profile_readme',
  'inspect_cnb_user',
  'browser_fetch',
  'compose_stats_recipe',
  'compose_readme_draft',
] as const;

export function getAnthropicTools() {
  return [
    {
      name: 'inspect_github_user',
      description: 'Fetch public GitHub profile metadata and a recent repository sample for a username.',
      input_schema: {
        type: 'object',
        properties: { username: { type: 'string', description: 'GitHub username' } },
        required: ['username'],
      },
    },
    {
      name: 'fetch_github_profile_readme',
      description: 'Fetch the public profile README from username/username on GitHub before generating or rewriting a personal README.',
      input_schema: {
        type: 'object',
        properties: { username: { type: 'string', description: 'GitHub username' } },
        required: ['username'],
      },
    },
    {
      name: 'inspect_cnb_user',
      description: 'Fetch a public CNB profile or organization page as text.',
      input_schema: {
        type: 'object',
        properties: { username: { type: 'string', description: 'CNB username or organization path' } },
        required: ['username'],
      },
    },
    {
      name: 'browser_fetch',
      description: 'Fetch a public web page and return readable text. Use this for rendered/profile URLs when public page content matters.',
      input_schema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Public URL to fetch' } },
        required: ['url'],
      },
    },
    {
      name: 'compose_stats_recipe',
      description: 'Create a machine-readable stats card recipe that the frontend can apply to the options panel.',
      input_schema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['github', 'cnb'] },
          username: { type: 'string' },
          cards: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['stats', 'top-langs', 'pin', 'streak', 'profile-summary', 'contribution-calendar', 'recent-activity', 'repo-languages', 'org'],
            },
          },
          theme: { type: 'string' },
          rationale: { type: 'string' },
          options: { type: 'object', additionalProperties: true },
        },
        required: ['platform', 'username', 'cards', 'theme', 'rationale', 'options'],
      },
    },
    {
      name: 'compose_readme_draft',
      description: 'Deliver a complete personal README Markdown draft after analyzing public profile data, README content, and selected stats cards.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          markdown: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['title', 'markdown', 'summary'],
      },
    },
  ];
}

export async function executeStatsTool(
  name: string,
  input: Record<string, unknown>,
  options: { sseQueue?: string[]; signal?: AbortSignal },
) {
  const sseQueue = options.sseQueue ?? [];
  const signal = options.signal;

  if (name === 'inspect_github_user') {
    const username = String(input.username || '');
    const user = await fetchJson(`${GITHUB_API}/users/${encodeURIComponent(username)}`, signal);
    const repos = await fetchJson(
      `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=12`,
      signal,
    );
    return {
      platform: 'github',
      user: pick(user, ['login', 'name', 'bio', 'company', 'blog', 'location', 'public_repos', 'followers', 'following', 'created_at', 'updated_at', 'html_url']),
      repos: Array.isArray(repos)
        ? repos.map((repo) => pick(repo, ['name', 'description', 'language', 'stargazers_count', 'forks_count', 'updated_at', 'html_url', 'topics']))
        : [],
    };
  }

  if (name === 'fetch_github_profile_readme') {
    const username = String(input.username || '');
    const branches = ['main', 'master'];
    const attempts = [];
    for (const branch of branches) {
      const url = `${GITHUB_RAW}/${encodeURIComponent(username)}/${encodeURIComponent(username)}/${branch}/README.md`;
      try {
        const response = await fetch(url, { signal, headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' } });
        attempts.push({ branch, status: response.status });
        if (response.ok) {
          const text = await response.text();
          return { ok: true, url, branch, readme: text.slice(0, 24000), truncated: text.length > 24000 };
        }
      } catch (error) {
        attempts.push({ branch, error: (error as Error).message });
      }
    }
    return { ok: false, attempts, message: 'Profile README not found on main or master.' };
  }

  if (name === 'inspect_cnb_user') {
    const username = String(input.username || '');
    const url = `${CNB_BASE}/${encodeURIComponent(username)}`;
    const response = await fetch(url, { signal, headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' } });
    const text = await response.text();
    return { platform: 'cnb', url, status: response.status, text: cleanHtml(text).slice(0, 6000) };
  }

  if (name === 'browser_fetch') {
    const url = String(input.url || '');
    const response = await fetch(url, { signal, headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' } });
    const text = await response.text();
    return { url, status: response.status, text: cleanHtml(text).slice(0, 8000) };
  }

  if (name === 'compose_stats_recipe') {
    const payload = { ok: true, recipe: input };
    sseQueue.push(sseEvent({ type: 'stats_recipe', ...payload }));
    return payload;
  }

  if (name === 'compose_readme_draft') {
    const payload = {
      ok: true,
      title: String(input.title || 'README Draft'),
      markdown: String(input.markdown || ''),
      summary: String(input.summary || ''),
    };
    sseQueue.push(sseEvent({ type: 'readme_draft', ...payload }));
    return payload;
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

async function fetchJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal, headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' } });
  if (!response.ok) throw new Error(`Request failed ${response.status}: ${url}`);
  return response.json();
}

function cleanHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(source: any, keys: string[]) {
  const target: Record<string, unknown> = {};
  for (const key of keys) target[key] = source?.[key];
  return target;
}
