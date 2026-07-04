import { sseEvent } from '../_shared';
import { tool } from '@openai/agents';

const GITHUB_API = 'https://api.github.com';
const CNB_BASE = 'https://cnb.cool';

/** Max raw HTML size (in bytes) that cleanHtml will process to avoid ReDoS on malicious pages. */
const MAX_HTML_CLEAN_BYTES = 200_000;

/** Allowlisted hostnames for the browser_fetch tool (SSRF prevention). */
const BROWSER_FETCH_ALLOWED_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'cnb.cool',
  'gitee.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'dev.to',
  'medium.com',
  'npmjs.com',
  'www.npmjs.com',
  'crates.io',
  'pypi.org',
]);

/**
 * Validate that a URL is safe for server-side fetching (SSRF prevention).
 * Rejects private IPs, non-HTTP(S) protocols, and cloud metadata endpoints.
 */
function isAllowedBrowserFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http(s)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Block private / loopback / link-local / metadata IPs
    if (
      /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|\[?::1|\[?fe80|\[?fc00|\[?fd00)/i.test(hostname) ||
      hostname === 'localhost' ||
      hostname === 'metadata.google.internal'
    ) {
      return false;
    }
    // If an allowlist is maintained, check it; otherwise allow any public host
    if (BROWSER_FETCH_ALLOWED_HOSTS.size > 0) {
      // Check exact match or parent domain match (e.g. "docs.github.com" matches "github.com")
      for (const allowed of BROWSER_FETCH_ALLOWED_HOSTS) {
        if (hostname === allowed || hostname.endsWith('.' + allowed)) return true;
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const STATS_TOOL_NAMES = [
  'inspect_github_user',
  'fetch_github_profile_readme',
  'inspect_cnb_user',
  'browser_fetch',
  'compose_stats_recipe',
  'compose_readme_draft',
] as const;

export function createOpenAIAgentTools(options: { sseQueue?: string[]; signal?: AbortSignal; sandbox?: any; tracer?: any; prefetchedProfile?: Record<string, unknown> }) {
  return getToolSchemas().map((schema) => tool({
    name: schema.name,
    description: schema.description,
    parameters: cloneSchema(schema.input_schema) as any,
    strict: false,
    timeoutMs: 20_000,
    timeoutBehavior: 'error_as_result',
    execute: async (input) => {
      const result = await executeStatsTool(schema.name, input as Record<string, unknown>, options);
      return JSON.stringify(result);
    },
  }));
}

function getToolSchemas() {
  return [
    {
      name: 'inspect_github_user',
      description: 'Fetch public GitHub profile metadata and a recent repository sample for a username.',
      input_schema: {
        type: 'object',
        properties: { username: { type: 'string', description: 'GitHub username' } },
        required: ['username'],
        additionalProperties: false,
      },
    },
    {
      name: 'fetch_github_profile_readme',
      description: 'Fetch the public profile README from username/username on GitHub before generating or rewriting a personal README.',
      input_schema: {
        type: 'object',
        properties: { username: { type: 'string', description: 'GitHub username' } },
        required: ['username'],
        additionalProperties: false,
      },
    },
    {
      name: 'inspect_cnb_user',
      description: 'Fetch a public CNB profile or organization page as text.',
      input_schema: {
        type: 'object',
        properties: { username: { type: 'string', description: 'CNB username or organization path' } },
        required: ['username'],
        additionalProperties: false,
      },
    },
    {
      name: 'browser_fetch',
      description: 'Fetch a public web page and return readable text. Use this for rendered/profile URLs when public page content matters.',
      input_schema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Public URL to fetch' } },
        required: ['url'],
        additionalProperties: false,
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
        additionalProperties: false,
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
          promotional_summary: {
            type: 'string',
            description: 'A concise personal-branding summary from a promotional README perspective.',
          },
          objective_rating: {
            type: 'string',
            enum: ['夯', '顶流', '高级', '平庸', '入门'],
            description: 'Objective public-profile rating. Use only one of: 夯, 顶流, 高级, 平庸, 入门.',
          },
          objective_summary: {
            type: 'string',
            description: 'Objective evidence-based summary explaining the rating and profile quality.',
          },
          roast_summary: {
            type: 'string',
            description: 'A sharp, sarcastic, and slightly toxic roast of the user profile based on public evidence. Be witty, technical, and humorous.',
          },
          score: {
            type: 'number',
            description: 'Dynamic user rating score between 0.00 and 100.00.',
          },
          badges: {
            type: 'array',
            items: { type: 'string' },
            description: '3 to 5 witty Chinese developer labels, e.g., ["#大厂PR常客", "#开源实干派"]',
          },
          dimension_scores: {
            type: 'object',
            properties: {
              maturity: { type: 'number', description: 'Account maturity score out of 20' },
              original_projects: { type: 'number', description: 'Original repository/code quality score out of 20' },
              contributions: { type: 'number', description: 'GitHub/CNB contributions count/quality score out of 20' },
              influence: { type: 'number', description: 'Repository star/fork ecological influence score out of 20' },
              activity: { type: 'number', description: 'Real activity authenticity score out of 20' },
              community: { type: 'number', description: 'Community followers/engagement impact score out of 20' },
            },
            required: ['maturity', 'original_projects', 'contributions', 'influence', 'activity', 'community'],
            additionalProperties: false,
          },
          top_repos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'E.g., "umami-software/umami"' },
                stars: { type: 'number', description: 'Star count of the repo' },
                contributions_desc: { type: 'string', description: 'E.g. "3 commits, 2 PRs" or "Owner"' },
              },
              required: ['name', 'stars', 'contributions_desc'],
              additionalProperties: false,
            },
            description: 'Top 3-6 starred repositories that the user owns or contributed to.',
          },
        },
        required: [
          'title',
          'markdown',
          'summary',
          'promotional_summary',
          'objective_rating',
          'objective_summary',
          'roast_summary',
          'score',
          'badges',
          'dimension_scores',
          'top_repos',
        ],
        additionalProperties: false,
      },
    },
  ];
}

function cloneSchema(schema: unknown) {
  return JSON.parse(JSON.stringify(schema));
}

export async function executeStatsTool(
  name: string,
  input: Record<string, unknown>,
  options: { sseQueue?: string[]; signal?: AbortSignal; sandbox?: any; tracer?: any; prefetchedProfile?: Record<string, unknown> },
) {
  const sseQueue = options.sseQueue ?? [];
  const signal = options.signal;
  const tracer = options.tracer;

  if (name === 'inspect_github_user') {
    const username = String(input.username || '');
    // Re-use profile data fetched during the validation phase to save GitHub API quota (60 req/h anonymous).
    const user = options.prefetchedProfile ?? await (tracer
      ? tracer.span('github.fetch_profile', () => fetchJson(`${GITHUB_API}/users/${encodeURIComponent(username)}`, signal), { 'github.username': username })
      : fetchJson(`${GITHUB_API}/users/${encodeURIComponent(username)}`, signal));
    const repos = await (tracer
      ? tracer.span('github.fetch_repos', () => fetchJson(`${GITHUB_API}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=12`, signal), { 'github.username': username })
      : fetchJson(`${GITHUB_API}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=12`, signal));

    let contributions: any[] = [];
    try {
      const prs = await (tracer
        ? tracer.span('github.search_prs', () => fetchJson(`${GITHUB_API}/search/issues?q=author:${encodeURIComponent(username)}+type:pr&per_page=60`, signal), { 'github.username': username })
        : fetchJson(`${GITHUB_API}/search/issues?q=author:${encodeURIComponent(username)}+type:pr&per_page=60`, signal));
      if (prs && Array.isArray(prs.items)) {
        const repoMap = new Map<string, { prCount: number }>();
        for (const item of prs.items) {
          const repoUrl = item.repository_url;
          const match = repoUrl?.match(/\/repos\/([^/]+\/[^/]+)$/);
          if (match) {
            const repoFullName = match[1];
            const owner = repoFullName.split('/')[0];
            if (owner.toLowerCase() !== username.toLowerCase()) {
              const current = repoMap.get(repoFullName) || { prCount: 0 };
              current.prCount++;
              repoMap.set(repoFullName, current);
            }
          }
        }
        const topContributed = Array.from(repoMap.entries())
          .sort((a, b) => b[1].prCount - a[1].prCount)
          .slice(0, 6);

        // Wrap all contributed-repo fetches in a single span to reduce trace noise
        const fetchContribRepos = async () => {
          await Promise.all(
            topContributed.map(async ([repoName, stats]) => {
              try {
                const detail = await fetchJson(`${GITHUB_API}/repos/${repoName}`, signal);
                contributions.push({
                  name: repoName,
                  description: detail.description,
                  stargazers_count: detail.stargazers_count,
                  forks_count: detail.forks_count,
                  language: detail.language,
                  html_url: detail.html_url,
                  pr_count: stats.prCount,
                });
              } catch {
                // Ignore failure for individual repos
              }
            })
          );
        };
        await (tracer
          ? tracer.span('github.fetch_contributed_repos', fetchContribRepos, { 'github.username': username, 'github.contrib_count': topContributed.length })
          : fetchContribRepos());
      }
    } catch {
      // Ignore errors for search queries (e.g. rate limits)
    }

    return {
      platform: 'github',
      user: pick(user, ['login', 'name', 'bio', 'company', 'blog', 'location', 'public_repos', 'followers', 'following', 'created_at', 'updated_at', 'html_url', 'avatar_url']),
      repos: Array.isArray(repos)
        ? repos.map((repo) => pick(repo, ['name', 'description', 'language', 'stargazers_count', 'forks_count', 'updated_at', 'html_url', 'topics']))
        : [],
      contributions,
    };
  }

  if (name === 'fetch_github_profile_readme') {
    // Use the GitHub REST API instead of raw.githubusercontent.com:
    //   - raw.githubusercontent.com is frequently DNS-polluted / connection-stalled
    //     from EdgeOne edge nodes in mainland China, causing 20s tool timeouts
    //     even for users that clearly exist.
    //   - api.github.com/repos/{u}/{u}/readme follows the default branch automatically
    //     and returns base64-encoded content in one request.
    // A 5s per-request timeout is enforced so a stalled socket can no longer eat
    // the whole 20s tool budget.
    const username = String(input.username || '');
    const url = `${GITHUB_API}/repos/${encodeURIComponent(username)}/${encodeURIComponent(username)}/readme`;
    try {
      const response = await (tracer
        ? tracer.span(
            'github.fetch_readme_api',
            () =>
              fetchWithTimeout(
                url,
                { headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0', Accept: 'application/vnd.github+json' } },
                5_000,
                signal,
              ),
            { 'github.username': username, 'github.url': url },
          )
        : fetchWithTimeout(
            url,
            { headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0', Accept: 'application/vnd.github+json' } },
            5_000,
            signal,
          ));
      if (response.status === 404) {
        return {
          ok: false,
          attempts: [{ url, status: 404 }],
          message: 'Profile README not found: this user has no username/username repo, or the repo has no README.',
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          attempts: [{ url, status: response.status }],
          message: `GitHub API returned ${response.status}`,
        };
      }
      const data: any = await response.json();
      const text = decodeBase64(String(data?.content || ''));
      if (!text) {
        return {
          ok: false,
          attempts: [{ url, status: 200, error: 'empty content' }],
          message: 'README content was empty or could not be decoded.',
        };
      }
      return {
        ok: true,
        url,
        branch: String(data?.path || ''),
        readme: text.slice(0, 24000),
        truncated: text.length > 24000,
      };
    } catch (error) {
      return {
        ok: false,
        attempts: [{ url, error: (error as Error).message }],
        message: 'Failed to fetch profile README within 5s.',
      };
    }
  }

  if (name === 'inspect_cnb_user') {
    const username = String(input.username || '');
    const userUrl = `${CNB_BASE}/users/${encodeURIComponent(username)}`;
    const reposUrl = `${CNB_BASE}/users/${encodeURIComponent(username)}/repos?page=1&page_size=20&role=Owner&status=active`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.cnb.web+json',
      'User-Agent': 'EdgeOne-Stats-Agent/1.0'
    };

    try {
      const userResponse = await (tracer
        ? tracer.span('cnb.fetch_profile', () => fetchWithTimeout(userUrl, { headers }, 5_000, signal), { 'cnb.username': username })
        : fetchWithTimeout(userUrl, { headers }, 5_000, signal));
      if (userResponse.status === 404) {
        return {
          platform: 'cnb',
          ok: false,
          status: 404,
          error: `CNB 用户 "${username}" 不存在 (404)。请注意：CNB 的用户名是区分大小写的，例如 "Mintimate" 与 "mintimate" 是不同的，请检查输入的大写字母。`
        };
      }
      const user = userResponse.ok ? await userResponse.json() : null;

      const reposResponse = await (tracer
        ? tracer.span('cnb.fetch_repos', () => fetchWithTimeout(reposUrl, { headers }, 5_000, signal), { 'cnb.username': username })
        : fetchWithTimeout(reposUrl, { headers }, 5_000, signal));
      const repos = reposResponse.ok ? await reposResponse.json() : [];

      return {
        platform: 'cnb',
        url: `${CNB_BASE}/u/${encodeURIComponent(username)}`,
        user: user ? {
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar ? (user.avatar.startsWith('http') ? user.avatar : `${CNB_BASE}${user.avatar}`) : '',
          follower_count: user.follower_count,
          follow_count: user.follow_count,
          public_repo_count: user.public_repo_count,
          stars_count: user.stars_count,
          created_at: user.created_at
        } : null,
        repos: Array.isArray(repos) ? repos.map((r: any) => ({
          name: r.name,
          path: r.path,
          description: r.description,
          star_count: r.star_count,
          fork_count: r.fork_count,
          language: r.language
        })) : []
      };
    } catch (e) {
      return { platform: 'cnb', error: (e as Error).message };
    }
  }

  if (name === 'browser_fetch') {
    const url = String(input.url || '');
    // SSRF prevention: validate URL before fetching
    if (!isAllowedBrowserFetchUrl(url)) {
      return { ok: false, url, error: 'URL is not allowed: must be a public HTTP(S) URL on a permitted host.' };
    }
    const sandboxResult = await (tracer
      ? tracer.span('sandbox.browser_goto', () => fetchWithSandboxBrowser(url, options.sandbox, signal), { 'browser.url': url })
      : fetchWithSandboxBrowser(url, options.sandbox, signal));
    if (sandboxResult) return sandboxResult;

    const response = await (tracer
      ? tracer.span('browser_fetch.http_fallback', () => fetchWithTimeout(url, { headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' } }, 5_000, signal), { 'browser.url': url })
      : fetchWithTimeout(url, { headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' } }, 5_000, signal));
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
      promotional_summary: String(input.promotional_summary || input.summary || ''),
      objective_rating: coerceRating(input.objective_rating),
      objective_summary: String(input.objective_summary || input.summary || ''),
      roast_summary: String(input.roast_summary || ''),
      score: Number(input.score ?? 60.00),
      badges: Array.isArray(input.badges) ? input.badges.map(String) : [],
      dimension_scores: input.dimension_scores || {
        maturity: 12,
        original_projects: 12,
        contributions: 12,
        influence: 12,
        activity: 12,
        community: 12
      },
      top_repos: Array.isArray(input.top_repos) ? input.top_repos : [],
    };
    sseQueue.push(sseEvent({ type: 'readme_draft', ...payload }));
    return payload;
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

function coerceRating(value: unknown): string {
  const text = String(value || '');
  return ['夯', '顶流', '高级', '平庸', '入门'].includes(text) ? text : '入门';
}

async function fetchWithSandboxBrowser(url: string, sandbox: any, signal?: AbortSignal) {
  const browser = sandbox?.browser;
  if (!browser || !url || signal?.aborted) return null;

  try {
    if (typeof browser.goto === 'function') await browser.goto(url, { timeout: 20 });

    let content = '';
    if (typeof browser.getContent === 'function') {
      content = String(await browser.getContent());
    } else if (typeof browser.evaluate === 'function') {
      content = String(await browser.evaluate('document.body ? document.body.innerText : document.documentElement.innerText'));
    }

    if (!content) return null;
    return {
      url,
      status: 200,
      source: 'sandbox_browser',
      text: cleanHtml(content).slice(0, 8000),
    };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5_000, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function fetchJson(url: string, signal?: AbortSignal) {
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'EdgeOne-Stats-Agent/1.0' } }, 5_000, signal);
  if (!response.ok) throw new Error(`Request failed ${response.status}: ${url}`);
  return response.json();
}

function decodeBase64(text: string): string {
  const clean = text.replace(/\s/g, '');
  if (!clean) return '';
  // GitHub README content is base64-encoded UTF-8. We must decode bytes first,
  // then interpret them as UTF-8, otherwise non-ASCII characters (中文/emoji)
  // turn into mojibake.
  try {
    if (typeof atob === 'function') {
      const binary = atob(clean);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch {
    // fall through to Buffer path
  }
  try {
    const BufferCtor = (globalThis as any).Buffer;
    if (typeof BufferCtor !== 'undefined') {
      return BufferCtor.from(clean, 'base64').toString('utf-8');
    }
  } catch {
    // no Buffer available
  }
  return '';
}

function cleanHtml(value: string): string {
  // Truncate before regex processing to prevent ReDoS on malicious pages
  const truncated = value.length > MAX_HTML_CLEAN_BYTES ? value.slice(0, MAX_HTML_CLEAN_BYTES) : value;
  return truncated
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
